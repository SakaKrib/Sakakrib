import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ALLOWED_ORIGIN = Deno.env.get('AUTH_ALLOWED_ORIGIN') ?? '*';

const isProduction = Deno.env.get('ENVIRONMENT') === 'production';
const ACCESS_COOKIE = 'saka_access';
const REFRESH_COOKIE = 'saka_refresh';
const ACCESS_MAX_AGE = 60 * 15;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Vary': 'Origin',
};

function json(data: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extra,
    },
  });
}

function parseCookies(request: Request) {
  const header = request.headers.get('cookie') ?? '';
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    result[key] = decodeURIComponent(value);
  }
  return result;
}

function cookie(name: string, value: string, maxAge: number) {
  const sameSite = isProduction ? 'SameSite=Lax' : 'SameSite=None';
  const secure = isProduction || sameSite.includes('None') ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; ${sameSite}${secure}`;
}

function clearCookie(name: string) {
  return cookie(name, '', 0);
}

function sessionCookies(accessToken: string, refreshToken: string) {
  return [
    cookie(ACCESS_COOKIE, accessToken, ACCESS_MAX_AGE),
    cookie(REFRESH_COOKIE, refreshToken, REFRESH_MAX_AGE),
  ];
}

function clientForToken(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function getSessionFromAccessToken(accessToken: string) {
  const client = clientForToken(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { user: data.user, client };
}

async function handle(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? (request.method === 'GET' ? 'session' : '');
  const cookies = parseCookies(request);
  const body = request.method === 'POST'
    ? await request.json().catch(() => ({}))
    : {};

  if (action === 'login') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!email || !password) return json({ error: 'Email and password are required.' }, 400);

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      return json({ error: error?.message ?? 'Unable to sign in.' }, 401);
    }

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return json({ error: 'Your application profile could not be loaded.' }, 403);
    }

    if (profile.email_verified !== true) {
      return json({
        error: 'Your email is not verified.',
        requiresEmailVerification: true,
        email: profile.email ?? email,
      }, 403);
    }

    return json({
      authenticated: true,
      user: data.user,
      profile,
    }, 200, {
      'Set-Cookie': sessionCookies(data.session.access_token, data.session.refresh_token).join(', '),
    });
  }

  if (action === 'signup') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const fullName = String(body.fullName ?? '').trim();
    if (!email || !password || !fullName) return json({ error: 'Email, password and full name are required.' }, 400);

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return json({ error: error.message }, 400);
    if (!data.user) return json({ error: 'Unable to create your account.' }, 400);

    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return json({ error: 'An account with this email already exists. Please log in.' }, 409);
    }

    return json({
      created: true,
      userId: data.user.id,
      requiresEmailVerification: true,
      email,
      sessionCreated: Boolean(data.session),
    }, 201);
  }

  if (action === 'refresh') {
    const refreshToken = cookies[REFRESH_COOKIE];
    if (!refreshToken) return json({ authenticated: false }, 401, {
      'Set-Cookie': [clearCookie(ACCESS_COOKIE), clearCookie(REFRESH_COOKIE)].join(', '),
    });

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session || !data.user) {
      return json({ authenticated: false, error: 'Session expired. Please sign in again.' }, 401, {
        'Set-Cookie': [clearCookie(ACCESS_COOKIE), clearCookie(REFRESH_COOKIE)].join(', '),
      });
    }

    const { data: profile } = await client
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile || profile.email_verified !== true) {
      return json({ authenticated: false, requiresEmailVerification: true }, 403, {
        'Set-Cookie': [clearCookie(ACCESS_COOKIE), clearCookie(REFRESH_COOKIE)].join(', '),
      });
    }

    return json({ authenticated: true, user: data.user, profile }, 200, {
      'Set-Cookie': sessionCookies(data.session.access_token, data.session.refresh_token).join(', '),
    });
  }

  if (action === 'logout') {
    return json({ authenticated: false }, 200, {
      'Set-Cookie': [clearCookie(ACCESS_COOKIE), clearCookie(REFRESH_COOKIE)].join(', '),
    });
  }

  const accessToken = cookies[ACCESS_COOKIE];
  if (!accessToken) return json({ authenticated: false }, 401);

  const authenticated = await getSessionFromAccessToken(accessToken);
  if (!authenticated) return json({ authenticated: false }, 401);

  if (action === 'session') {
    const { data: profile, error } = await authenticated.client
      .from('profiles')
      .select('*')
      .eq('id', authenticated.user.id)
      .maybeSingle();

    if (error || !profile) return json({ authenticated: false }, 403);
    if (profile.email_verified !== true) return json({
      authenticated: false,
      requiresEmailVerification: true,
      email: profile.email ?? authenticated.user.email ?? null,
    }, 403);

    return json({ authenticated: true, user: authenticated.user, profile });
  }

  if (action === 'profile') {
    const { data: profile, error } = await authenticated.client
      .from('profiles')
      .select('*')
      .eq('id', authenticated.user.id)
      .maybeSingle();
    if (error || !profile) return json({ error: 'Profile not found.' }, 404);
    return json({ profile });
  }

  if (action === 'set-role') {
    const role = String(body.role ?? '');
    const allowed = ['renter', 'landlord', 'mover', 'real_estate', 'admin'];
    if (!allowed.includes(role)) return json({ error: 'Invalid role.' }, 400);

    const { data: currentProfile } = await authenticated.client
      .from('profiles')
      .select('email_verified')
      .eq('id', authenticated.user.id)
      .maybeSingle();
    if (currentProfile?.email_verified !== true) return json({ error: 'Email verification is required.' }, 403);

    const { error } = await authenticated.client
      .from('profiles')
      .update({ role })
      .eq('id', authenticated.user.id);
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  }

  return json({ error: 'Unknown auth action.' }, 404);
}

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (error) {
    console.error('auth-gateway error:', error);
    return json({ error: 'Authentication service error.' }, 500);
  }
});
