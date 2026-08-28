import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const CONFIGURED_ORIGINS = (Deno.env.get('AUTH_ALLOWED_ORIGIN') ?? '')
  .split(',')
  .map((value) => value.trim().replace(/\/$/, ''))
  .filter(Boolean);

const ACCESS_COOKIE = 'saka_access';
const REFRESH_COOKIE = 'saka_refresh';
const ACCESS_MAX_AGE = 60 * 15;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

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

function json(request: Request, data: unknown, status = 200, cookies: string[] = []) {
  const headers = corsHeaders(request);
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify(data), { status, headers });
}

function redirect(request: Request, location: string, cookies: string[] = []) {
  const headers = corsHeaders(request);
  headers.set('Location', location);
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 302, headers });
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

function cookie(name: string, value: string, maxAge: number) {
  const sameSite = Deno.env.get('COOKIE_SAMESITE') ?? 'None';
  const secure = sameSite === 'None' || Deno.env.get('ENVIRONMENT') === 'production';
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=${sameSite}${secure ? '; Secure' : ''}`;
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

function publicClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function authenticatedClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function authenticate(accessToken: string) {
  const client = authenticatedClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { client, user: data.user };
}

function allowedOAuthRedirect(value: string | null): string {
  const fallback = CONFIGURED_ORIGINS[0];
  if (!fallback) return '/';

  if (!value) return fallback;

  try {
    const candidate = new URL(value, fallback);
    if (candidate.origin !== fallback) return fallback;
    return candidate.toString();
  } catch {
    return fallback;
  }
}

function redirectWithError(base: string, error: string, email?: string) {
  const target = new URL(base);
  target.searchParams.set('auth_error', error);
  if (email) target.searchParams.set('email', email);
  return target.toString();
}

async function handle(request: Request) {
  const origin = request.headers.get('Origin') ?? '';
  if (CONFIGURED_ORIGINS.length > 0 && origin && !CONFIGURED_ORIGINS.includes(origin.replace(/\/$/, ''))) {
    return json(request, { error: 'Origin not allowed.' }, 403);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return json(request, { error: 'Method not allowed.' }, 405);
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
    if (!email || !password) return json(request, { error: 'Email and password are required.' }, 400);

    const client = publicClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      return json(request, { error: error?.message ?? 'Unable to sign in.' }, 401);
    }

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return json(request, { error: 'Your application profile could not be loaded.' }, 403);
    }

    if (profile.email_verified !== true) {
      return json(
        request,
        {
          error: 'Your email is not verified.',
          requiresEmailVerification: true,
          email: profile.email ?? email,
        },
        403,
      );
    }

    return json(
      request,
      { authenticated: true, user: data.user, profile },
      200,
      sessionCookies(data.session.access_token, data.session.refresh_token),
    );
  }

  if (action === 'signup') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const fullName = String(body.fullName ?? '').trim();

    if (!email || !password || !fullName) {
      return json(request, { error: 'Email, password and full name are required.' }, 400);
    }

    const client = publicClient();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) return json(request, { error: error.message }, 400);
    if (!data.user) return json(request, { error: 'Unable to create your account.' }, 400);

    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return json(request, { error: 'An account with this email already exists. Please log in.' }, 409);
    }

    return json(
      request,
      {
        created: true,
        userId: data.user.id,
        requiresEmailVerification: true,
        email,
        sessionCreated: Boolean(data.session),
      },
      201,
      data.session
        ? sessionCookies(data.session.access_token, data.session.refresh_token)
        : [],
    );
  }

  if (action === 'verify-otp') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const otp = String(body.otp ?? '').replace(/\D/g, '');
    if (!email || otp.length !== 6) {
      return json(request, { error: 'Email and a 6-digit verification code are required.' }, 400);
    }

    const accessToken = cookies[ACCESS_COOKIE];
    const client = accessToken ? authenticatedClient(accessToken) : publicClient();
    const { data, error } = await client.rpc('verify_signup_otp', {
      p_email: email,
      p_otp: otp,
    });

    if (error) {
      return json(request, { error: error.message || 'Invalid or expired verification code.' }, 400);
    }

    const result = data as { success?: boolean; error?: string; profile_id?: string } | null;
    if (!result?.success) {
      return json(request, { error: result?.error || 'Invalid or expired verification code.' }, 400);
    }

    const profileId = result.profile_id;
    if (!profileId) {
      return json(request, { error: 'Email verification succeeded, but the account profile could not be identified.' }, 500);
    }

    const { data: profile } = await client
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .maybeSingle();

    if (!profile || profile.email_verified !== true) {
      return json(request, { error: 'Email verification has not been completed.' }, 400);
    }

    if (accessToken) {
      const auth = await authenticate(accessToken);
      if (auth) {
        return json(request, {
          authenticated: true,
          user: auth.user,
          profile,
        });
      }
    }

    return json(request, {
      authenticated: false,
      verified: true,
      profile,
    });
  }

  if (action === 'refresh') {
    const refreshToken = cookies[REFRESH_COOKIE];
    if (!refreshToken) {
      return json(
        request,
        { authenticated: false },
        401,
        [clearCookie(ACCESS_COOKIE), clearCookie(REFRESH_COOKIE)],
      );
    }

    const client = publicClient();
    const { data, error } = await client.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session || !data.user) {
      return json(
        request,
        { authenticated: false, error: 'Session expired. Please sign in again.' },
        401,
        [clearCookie(ACCESS_COOKIE), clearCookie(REFRESH_COOKIE)],
      );
    }

    const { data: profile } = await client
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile || profile.email_verified !== true) {
      return json(
        request,
        { authenticated: false, requiresEmailVerification: true },
        403,
        [clearCookie(ACCESS_COOKIE), clearCookie(REFRESH_COOKIE)],
      );
    }

    return json(
      request,
      { authenticated: true, user: data.user, profile },
      200,
      sessionCookies(data.session.access_token, data.session.refresh_token),
    );
  }

  if (action === 'logout') {
    const accessToken = cookies[ACCESS_COOKIE];
    if (accessToken) {
      try {
        await authenticatedClient(accessToken).auth.signOut();
      } catch {
        // Cookies are cleared even if the remote session has already expired.
      }
    }

    return json(
      request,
      { authenticated: false },
      200,
      [clearCookie(ACCESS_COOKIE), clearCookie(REFRESH_COOKIE)],
    );
  }

  if (action === 'oauth-callback') {
    const code = url.searchParams.get('code');
    const redirectTo = allowedOAuthRedirect(url.searchParams.get('redirect'));

    if (!code) {
      return redirect(request, redirectWithError(redirectTo, 'missing_code'));
    }

    const client = publicClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);

    if (error || !data.session || !data.user) {
      return redirect(request, redirectWithError(redirectTo, 'oauth_failed'));
    }

    const { data: profile } = await client
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile || profile.email_verified !== true) {
      return redirect(
        request,
        redirectWithError(redirectTo, 'verification_required', data.user.email ?? ''),
        sessionCookies(data.session.access_token, data.session.refresh_token),
      );
    }

    return redirect(
      request,
      redirectTo,
      sessionCookies(data.session.access_token, data.session.refresh_token),
    );
  }

  const accessToken = cookies[ACCESS_COOKIE];
  if (!accessToken) return json(request, { authenticated: false }, 401);

  const auth = await authenticate(accessToken);
  if (!auth) return json(request, { authenticated: false }, 401);

  if (action === 'session' || action === 'profile') {
    const { data: profile, error } = await auth.client
      .from('profiles')
      .select('*')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (error || !profile) return json(request, { authenticated: false }, 403);

    if (profile.email_verified !== true) {
      return json(
        request,
        {
          authenticated: false,
          requiresEmailVerification: true,
          email: profile.email ?? auth.user.email ?? null,
        },
        403,
      );
    }

    return action === 'profile'
      ? json(request, { profile })
      : json(request, { authenticated: true, user: auth.user, profile });
  }

  if (action === 'set-role') {
    const role = String(body.role ?? '');
    const allowed = ['renter', 'landlord', 'mover', 'real_estate', 'admin'];
    if (!allowed.includes(role)) return json(request, { error: 'Invalid role.' }, 400);

    const { data: currentProfile } = await auth.client
      .from('profiles')
      .select('email_verified')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (currentProfile?.email_verified !== true) {
      return json(request, { error: 'Email verification is required.' }, 403);
    }

    const { error } = await auth.client
      .from('profiles')
      .update({ role })
      .eq('id', auth.user.id);

    if (error) return json(request, { error: error.message }, 400);
    return json(request, { success: true });
  }

  return json(request, { error: 'Unknown auth action.' }, 404);
}

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (error) {
    console.error('auth-gateway error:', error);
    return json(request, { error: 'Authentication service error.' }, 500);
  }
});