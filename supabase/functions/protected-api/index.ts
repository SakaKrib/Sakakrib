import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const CONFIGURED_ORIGINS = (Deno.env.get('AUTH_ALLOWED_ORIGIN') ?? '')
  .split(',')
  .map((value) => value.trim().replace(/\/$/, ''))
  .filter(Boolean);

const ACCESS_COOKIE = 'saka_access';

// Only resources that are intentionally part of the authenticated application API
// may be reached through this gateway. Authorization is still enforced by RLS because
// every database request is made with the caller's access token.
const ALLOWED_RESOURCES = new Set([
  'profiles',
  'listings',
  'listing_media',
  'movers',
  'bookings',
  'reviews',
  'community_posts',
  'terms_acceptance',
  'chat_messages',
  'booking_events',
  'landlord_subscriptions',
  'subscription_plans',
]);

function corsHeaders(request: Request): Headers {
  const origin = request.headers.get('Origin') ?? '';
  const normalizedOrigin = origin.replace(/\/$/, '');
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'content-type, x-client-info, apikey, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  });

  if (normalizedOrigin && CONFIGURED_ORIGINS.includes(normalizedOrigin)) {
    headers.set('Access-Control-Allow-Origin', normalizedOrigin);
  }

  return headers;
}

function json(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(request),
  });
}

function parseCookies(request: Request) {
  const result: Record<string, string> = {};

  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }

  return result;
}

function authenticatedClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

async function authenticate(request: Request) {
  const accessToken = parseCookies(request)[ACCESS_COOKIE];
  if (!accessToken) return null;

  const client = authenticatedClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) return null;

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.email_verified !== true) {
    return null;
  }

  return {
    client,
    user: data.user,
    profile,
  };
}

function validateResource(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!ALLOWED_RESOURCES.has(value)) return null;
  return value;
}

function validateId(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return value.trim();
}

async function handle(request: Request) {
  const origin = request.headers.get('Origin') ?? '';
  const normalizedOrigin = origin.replace(/\/$/, '');

  if (
    CONFIGURED_ORIGINS.length > 0 &&
    origin &&
    !CONFIGURED_ORIGINS.includes(normalizedOrigin)
  ) {
    return json(request, { error: 'Origin not allowed.' }, 403);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }

  if (request.method !== 'POST') {
    return json(request, { error: 'Method not allowed.' }, 405);
  }

  const body = await request.json().catch(() => ({}));
  const operation = String(body.operation ?? '');

  const auth = await authenticate(request);
  if (!auth) {
    return json(
      request,
      {
        error: 'Authentication required.',
        code: 'AUTH_REQUIRED',
      },
      401,
    );
  }

  // ----------------------------------------------------------
  // PROFILE
  // ----------------------------------------------------------
  if (operation === 'profile') {
    return json(request, { profile: auth.profile });
  }

  if (operation === 'profile-update') {
    const patch = body.patch;

    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return json(request, { error: 'A profile patch is required.' }, 400);
    }

    // Sensitive authorization/KYC fields are never writable through this generic
    // endpoint. Dedicated server/RPC flows should own those transitions.
    const forbidden = new Set([
      'id',
      'is_admin',
      'role',
      'email_verified',
      'kyc_completed',
      'verification_status',
      'admin_review_note',
      'free_listings_used',
      'created_at',
      'updated_at',
    ]);

    const safePatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
      if (!forbidden.has(key)) safePatch[key] = value;
    }

    if (Object.keys(safePatch).length === 0) {
      return json(request, { error: 'No permitted profile fields were supplied.' }, 400);
    }

    const { data, error } = await auth.client
      .from('profiles')
      .update(safePatch)
      .eq('id', auth.user.id)
      .select('*')
      .single();

    if (error) return json(request, { error: error.message }, 400);

    return json(request, { profile: data });
  }

  // ----------------------------------------------------------
  // LIST
  // ----------------------------------------------------------
  if (operation === 'list') {
    const resource = validateResource(body.resource);
    if (!resource) {
      return json(request, { error: 'Resource is not available through the protected API.' }, 400);
    }

    const limit = Math.min(
      Math.max(Number.isFinite(Number(body.limit)) ? Number(body.limit) : 100, 1),
      100,
    );
    const offset = Math.max(
      Number.isFinite(Number(body.offset)) ? Number(body.offset) : 0,
      0,
    );

    const { data, error, count } = await auth.client
      .from(resource)
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1);

    if (error) return json(request, { error: error.message }, 400);

    return json(request, { data: data ?? [], count: count ?? 0 });
  }

  // ----------------------------------------------------------
  // CREATE
  // ----------------------------------------------------------
  if (operation === 'create') {
    const resource = validateResource(body.resource);
    if (!resource) {
      return json(request, { error: 'Resource is not available through the protected API.' }, 400);
    }

    if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) {
      return json(request, { error: 'Create values are required.' }, 400);
    }

    const { data, error } = await auth.client
      .from(resource)
      .insert(body.values)
      .select('*')
      .single();

    if (error) return json(request, { error: error.message }, 400);

    return json(request, { data });
  }

  // ----------------------------------------------------------
  // UPDATE
  // ----------------------------------------------------------
  if (operation === 'update') {
    const resource = validateResource(body.resource);
    const id = validateId(body.id);

    if (!resource || !id) {
      return json(request, { error: 'A valid resource and record id are required.' }, 400);
    }

    if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) {
      return json(request, { error: 'Update values are required.' }, 400);
    }

    const { data, error } = await auth.client
      .from(resource)
      .update(body.values)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return json(request, { error: error.message }, 400);

    return json(request, { data });
  }

  // ----------------------------------------------------------
  // DELETE
  // ----------------------------------------------------------
  if (operation === 'delete') {
    const resource = validateResource(body.resource);
    const id = validateId(body.id);

    if (!resource || !id) {
      return json(request, { error: 'A valid resource and record id are required.' }, 400);
    }

    const { error } = await auth.client
      .from(resource)
      .delete()
      .eq('id', id);

    if (error) return json(request, { error: error.message }, 400);

    return json(request, { success: true });
  }

  // ----------------------------------------------------------
  // RPC
  // ----------------------------------------------------------
  if (operation === 'rpc') {
    const functionName = String(body.functionName ?? '').trim();
    const args = body.args;

    if (!functionName || !args || typeof args !== 'object' || Array.isArray(args)) {
      return json(request, { error: 'A valid RPC function and arguments are required.' }, 400);
    }

    // Only explicitly approved application RPCs may be called from this gateway.
    const allowedRpc = new Set([
      'verify_signup_otp',
      'get_listing_entitlement',
      'get_landlord_subscription',
      'get_subscription_usage',
    ]);

    if (!allowedRpc.has(functionName)) {
      return json(request, { error: 'RPC is not available through the protected API.' }, 403);
    }

    const { data, error } = await auth.client.rpc(functionName, args);
    if (error) return json(request, { error: error.message }, 400);

    return json(request, { data });
  }

  return json(request, { error: 'Unknown protected API operation.' }, 404);
}

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (error) {
    console.error('protected-api error:', error);
    return json(request, { error: 'Protected API service error.' }, 500);
  }
});
