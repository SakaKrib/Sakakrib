import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase environment is not configured.');
}

const BASE_URL = SUPABASE_URL.replace(/\/+$/, '');
const BUCKET = 'chat-attachments';
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const publicClient = createClient(BASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const admin = createClient(BASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

function cors(request: Request): HeadersInit {
  const origin = request.headers.get('origin');
  const configured = Deno.env.get('APP_ORIGIN');
  const devOrigins = new Set(['http://localhost:5173','http://localhost:5174','http://localhost:5175','http://localhost:5176','http://127.0.0.1:5173','http://127.0.0.1:5174','http://127.0.0.1:5175','http://127.0.0.1:5176','http://100.109.224.0:5173']);
  const allowed = configured && origin === configured ? origin : origin && devOrigins.has(origin) ? origin : configured ?? '';
  return { ...(allowed ? { 'Access-Control-Allow-Origin': allowed } : {}), 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}

function json(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(request), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    try { return decodeURIComponent(value); } catch { return value; }
  }
  return null;
}

async function authenticate(request: Request) {
  const token = readCookie(request, 'sk_access');
  if (!token) return null;
  const { data, error } = await publicClient.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

async function ensureBucket() {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: `${MAX_BYTES}B`, allowedMimeTypes: Array.from(ALLOWED_TYPES) });
  if (error && !/already exists/i.test(error.message)) throw error;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  const origin = request.headers.get('origin');
  const configured = Deno.env.get('APP_ORIGIN');
  if (configured && origin && origin !== configured) return json(request, { error: 'Origin not allowed.' }, 403);

  try {
    const user = await authenticate(request);
    if (!user) return json(request, { authenticated: false, error: 'Authentication required.' }, 401);
    await ensureBucket();

    const form = await request.formData();
    const action = String(form.get('action') ?? 'upload');

    if (action === 'sign') {
      const messageId = String(form.get('message_id') ?? '');
      if (!messageId) return json(request, { error: 'message_id is required.' }, 400);
      const { data: message, error: messageError } = await admin.from('chat_messages').select('id,sender_id,receiver_id,event_data').eq('id', messageId).maybeSingle();
      if (messageError || !message) return json(request, { error: 'Attachment message not found.' }, 404);
      if (message.sender_id !== user.id && message.receiver_id !== user.id) return json(request, { error: 'Not authorized to access this attachment.' }, 403);
      const rawAttachments = message.event_data?.attachments;
      if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) return json(request, { error: 'No attachment found.' }, 404);
      const attachment = rawAttachments[0] as Record<string, unknown>;
      const path = typeof attachment.path === 'string' ? attachment.path : '';
      if (!path) return json(request, { error: 'Invalid attachment path.' }, 400);
      const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (signError || !signed?.signedUrl) return json(request, { error: 'Unable to sign attachment.' }, 500);
      return json(request, { signed_url: signed.signedUrl });
    }

    const file = form.get('file');
    if (!(file instanceof File)) return json(request, { error: 'Image file is required.' }, 400);
    if (!ALLOWED_TYPES.has(file.type)) return json(request, { error: 'Only JPG, PNG, WEBP, and GIF images are allowed.' }, 415);
    if (file.size <= 0 || file.size > MAX_BYTES) return json(request, { error: 'Image must be between 1 byte and 8 MB.' }, 413);

    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
    if (uploadError) return json(request, { error: 'Unable to upload image.' }, 500);
    const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (signError || !signed?.signedUrl) return json(request, { error: 'Image uploaded but could not be signed.' }, 500);

    return json(request, { path, name: file.name, mime_type: file.type, size: file.size, signed_url: signed.signedUrl });
  } catch (error) {
    console.error('chat-media-upload error:', error);
    return json(request, { error: 'Media operation failed.' }, 500);
  }
});
