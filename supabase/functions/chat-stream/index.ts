import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase environment is not configured.');

const BASE_URL = SUPABASE_URL.replace(/\/+$/, '');
const admin = createClient(BASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

function cors(request: Request): HeadersInit {
  const origin = request.headers.get('origin');
  const configured = Deno.env.get('APP_ORIGIN');
  const dev = new Set(['http://localhost:5173','http://localhost:5174','http://localhost:5175','http://localhost:5176','http://127.0.0.1:5173','http://127.0.0.1:5174','http://127.0.0.1:5175','http://127.0.0.1:5176','http://100.109.224.0:5173']);
  const allowed = configured && origin === configured ? origin : origin && dev.has(origin) ? origin : configured ?? '';
  return { ...(allowed ? { 'Access-Control-Allow-Origin': allowed } : {}), 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' };
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0 || part.slice(0, i).trim() !== name) continue;
    const value = part.slice(i + 1).trim();
    try { return decodeURIComponent(value); } catch { return value; }
  }
  return null;
}

async function authenticate(request: Request) {
  const token = readCookie(request, 'sk_access');
  if (!token) return null;
  const auth = createClient(BASE_URL, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await auth.auth.getUser(token);
  return error || !data.user ? null : { id: data.user.id };
}

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });

  try {
    const user = await authenticate(request);
    if (!user) return new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401, headers: { ...cors(request), 'Content-Type': 'application/json' } });

    const url = new URL(request.url);
    const bookingId = url.searchParams.get('booking_id');
    const peerUserId = url.searchParams.get('peer_user_id');
    let conversationId = '';
    let authorized = false;

    if (bookingId) {
      const { data: booking } = await admin.from('bookings').select('id,renter_id,mover_id').eq('id', bookingId).maybeSingle();
      if (!booking) return new Response(JSON.stringify({ error: 'Booking not found.' }), { status: 404, headers: { ...cors(request), 'Content-Type': 'application/json' } });
      const { data: mover } = await admin.from('movers').select('user_id').eq('id', booking.mover_id).maybeSingle();
      authorized = booking.renter_id === user.id || mover?.user_id === user.id;
      conversationId = booking.id;
    } else if (peerUserId && peerUserId !== user.id) {
      const { data: mover } = await admin.from('movers').select('user_id,approval_status').eq('user_id', peerUserId).maybeSingle();
      authorized = !!mover && mover.approval_status === 'approved';
      conversationId = [user.id, peerUserId].sort().join('__');
    }

    if (!authorized || !conversationId) return new Response(JSON.stringify({ error: 'Not authorized for this conversation.' }), { status: 403, headers: { ...cors(request), 'Content-Type': 'application/json' } });

    const encoder = new TextEncoder();
    let lastCreatedAt = url.searchParams.get('after') || new Date(0).toISOString();
    let lastBookingUpdatedAt = '';
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sse(event, data)));
        send('ready', { conversation_id: conversationId });
        const started = Date.now();
        try {
          while (!closed && Date.now() - started < 45_000) {
            const { data: messages } = await admin.from('chat_messages').select('*').eq('conversation_id', conversationId).gt('created_at', lastCreatedAt).order('created_at', { ascending: true }).limit(100);
            if (messages?.length) {
              send('messages', messages);
              lastCreatedAt = messages[messages.length - 1].created_at;
            }
            if (bookingId) {
              const { data: booking } = await admin.from('bookings').select('*').eq('id', bookingId).maybeSingle();
              if (booking && booking.updated_at !== lastBookingUpdatedAt) {
                lastBookingUpdatedAt = booking.updated_at;
                send('booking', booking);
              }
            }
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        } catch (error) {
          console.error('chat-stream error:', error);
        } finally {
          try { controller.close(); } catch { /* already closed */ }
        }
      },
      cancel() { closed = true; },
    });

    return new Response(stream, { status: 200, headers: { ...cors(request), 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', Connection: 'keep-alive' } });
  } catch (error) {
    console.error('chat-stream error:', error);
    return new Response(JSON.stringify({ error: 'Chat stream failed.' }), { status: 500, headers: { ...cors(request), 'Content-Type': 'application/json' } });
  }
});
