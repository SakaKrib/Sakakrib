import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase environment is not configured.');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const adminSupabase = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

const allowedOrigin = (request: Request): string => {
  const origin = request.headers.get('origin');
  const configuredOrigin = Deno.env.get('APP_ORIGIN');
  if (configuredOrigin && origin === configuredOrigin) return origin;
  if (
    origin === 'http://localhost:5174' ||
    origin === 'http://localhost:5173' ||
    origin === 'http://127.0.0.1:5174' ||
    origin === 'http://100.109.224.0:5174' ||
    origin === 'http://100.109.224.0:5173'
  ) {
    return origin;
  }

  return configuredOrigin ?? '';
};

const corsHeaders = (request: Request): HeadersInit => {
  const origin = allowedOrigin(request);
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
};

const json = (request: Request, body: Record<string, unknown>, status = 200, extraHeaders: HeadersInit = []) => {
  const headers = new Headers(corsHeaders(request));
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  for (const [name, value] of extraHeaders) headers.append(name, value);
  return new Response(JSON.stringify(body), { status, headers });
};

const cookieBase = ['Path=/', 'HttpOnly', 'Secure', 'SameSite=None'];
const setAuthCookies = (accessToken: string, refreshToken: string): HeadersInit => [
  ['Set-Cookie', `sk_access=${encodeURIComponent(accessToken)}; ${cookieBase.join('; ')}; Max-Age=3600`],
  ['Set-Cookie', `sk_refresh=${encodeURIComponent(refreshToken)}; ${cookieBase.join('; ')}; Max-Age=2592000`],
];
const clearAuthCookies = (): HeadersInit => [
  ['Set-Cookie', `sk_access=; ${cookieBase.join('; ')}; Max-Age=0`],
  ['Set-Cookie', `sk_refresh=; ${cookieBase.join('; ')}; Max-Age=0`],
];

const readCookies = (request: Request): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (name) {
      try {
        result[name] = decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        result[name] = part.slice(index + 1).trim();
      }
    }
  }
  return result;
};

const getProfile = async (accessToken: string, userId: string) => {
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(`Profile lookup failed: ${error.message}`);
  return data;
};

const authenticatedResponse = async (request: Request, accessToken: string) => {
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return json(request, { authenticated: false }, 401);
  const profile = await getProfile(accessToken, data.user.id);
  if (!profile || profile.email_verified !== true) {
    return json(
      request,
      {
        authenticated: false,
        requiresEmailVerification: true,
        email: profile?.email ?? data.user.email ?? null,
      },
      403,
      clearAuthCookies(),
    );
  }
  return json(request, {
    authenticated: true,
    user: { id: data.user.id, email: data.user.email ?? null },
    profile,
  });
};

const refreshFromCookie = async (request: Request, refreshToken: string) => {
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) {
    return json(request, { authenticated: false }, 401, clearAuthCookies());
  }

  const profile = await getProfile(data.session.access_token, data.user.id);
  if (!profile || profile.email_verified !== true) {
    return json(
      request,
      {
        authenticated: false,
        requiresEmailVerification: true,
        email: profile?.email ?? data.user.email ?? null,
      },
      403,
      clearAuthCookies(),
    );
  }

  return json(
    request,
    {
      authenticated: true,
      user: { id: data.user.id, email: data.user.email ?? null },
      profile,
    },
    200,
    setAuthCookies(data.session.access_token, data.session.refresh_token),
  );
};

/**
 * After the application's custom signup OTP is verified, create a normal
 * Supabase Auth session server-side and immediately move it into HttpOnly
 * cookies. The browser never receives the access or refresh token.
 *
 * We intentionally use the service-role client only for generating a
 * one-time magic-link token. The returned token hash is immediately
 * exchanged server-side with verifyOtp(), producing the normal user session.
 */
const establishVerifiedSession = async (email: string) => {
  if (!adminSupabase) {
    throw new Error('Server authentication configuration is incomplete.');
  }

  const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(linkError?.message ?? 'Unable to establish the authenticated session.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'email',
  });

  if (sessionError || !sessionData.session || !sessionData.user) {
    throw new Error(sessionError?.message ?? 'Unable to establish the authenticated session.');
  }

  return sessionData;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);

  const origin = request.headers.get('origin');
  const configuredOrigin = Deno.env.get('APP_ORIGIN');
  if (configuredOrigin && origin && origin !== configuredOrigin) return json(request, { error: 'Origin not allowed.' }, 403);

  try {
    const payload = await request.json().catch(() => ({}));
    const action = typeof payload.action === 'string' ? payload.action : '';

    if (action === 'signup') {
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      const password = typeof payload.password === 'string' ? payload.password : '';
      const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
      if (!email || !password || !fullName) return json(request, { error: 'Email, password and full name are required.' }, 400);

      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
      if (error || !data.user) return json(request, { error: error?.message ?? 'Unable to create your account.' }, 400);
      if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return json(request, { error: 'An account with this email already exists. Please log in.' }, 409);
      }

      if (data.session) {
        const profile = await getProfile(data.session.access_token, data.user.id);
        if (profile?.email_verified === true) {
          return json(request, {
            authenticated: true,
            user: { id: data.user.id, email: data.user.email ?? email },
            profile,
          }, 200, setAuthCookies(data.session.access_token, data.session.refresh_token));
        }
        await supabase.auth.signOut(data.session.access_token).catch(() => undefined);
      }

      return json(request, { authenticated: false, requiresEmailVerification: true, email, user_id: data.user.id });
    }

    if (action === 'login') {
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      const password = typeof payload.password === 'string' ? payload.password : '';
      if (!email || !password) return json(request, { error: 'Email and password are required.' }, 400);

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session || !data.user) return json(request, { error: error?.message ?? 'Unable to sign in.' }, 401);

      const profile = await getProfile(data.session.access_token, data.user.id);
      if (!profile) {
        await supabase.auth.signOut(data.session.access_token).catch(() => undefined);
        return json(request, { error: 'Your account does not have an application profile.' }, 403, clearAuthCookies());
      }
      if (profile.email_verified !== true) {
        await supabase.auth.signOut(data.session.access_token).catch(() => undefined);
        return json(request, { error: 'Your email is not verified.', requiresEmailVerification: true, email: profile.email ?? data.user.email ?? email }, 403, clearAuthCookies());
      }

      return json(request, { authenticated: true, user: { id: data.user.id, email: data.user.email ?? email }, profile }, 200, setAuthCookies(data.session.access_token, data.session.refresh_token));
    }

    if (action === 'session') {
      const cookies = readCookies(request);
      const accessToken = cookies.sk_access;
      if (accessToken) {
        const sessionResponse = await authenticatedResponse(request, accessToken);
        if (sessionResponse.status !== 401) return sessionResponse;
      }

      const refreshToken = cookies.sk_refresh;
      if (!refreshToken) return json(request, { authenticated: false }, 401, clearAuthCookies());
      return refreshFromCookie(request, refreshToken);
    }

    if (action === 'refresh') {
      const refreshToken = readCookies(request).sk_refresh;
      if (!refreshToken) return json(request, { authenticated: false }, 401, clearAuthCookies());
      return refreshFromCookie(request, refreshToken);
    }

    if (action === 'verify_otp') {
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      const otp = typeof payload.otp === 'string' ? payload.otp.replace(/\D/g, '') : '';
      if (!email || otp.length !== 6) return json(request, { error: 'A valid email and 6-digit verification code are required.' }, 400);

      const { data, error } = await supabase.rpc('verify_signup_otp', { p_email: email, p_otp: otp });
      if (error) return json(request, { error: error.message || 'Invalid or expired verification code.' }, 400);
      const result = data as { success?: boolean; error?: string; profile_id?: string } | null;
      if (!result?.success) return json(request, { error: result?.error || 'Invalid or expired verification code.' }, 400);

      const sessionData = await establishVerifiedSession(email);
      const profile = await getProfile(sessionData.session.access_token, sessionData.user.id);

      if (!profile || profile.email_verified !== true) {
        await supabase.auth.signOut(sessionData.session.access_token).catch(() => undefined);
        return json(request, { error: 'Email verification succeeded, but the authenticated profile could not be established.' }, 500, clearAuthCookies());
      }

      return json(
        request,
        {
          success: true,
          authenticated: true,
          user: { id: sessionData.user.id, email: sessionData.user.email ?? email },
          profile,
        },
        200,
        setAuthCookies(sessionData.session.access_token, sessionData.session.refresh_token),
      );
    }

    if (action === 'logout') {
      const accessToken = readCookies(request).sk_access;
      if (accessToken) await supabase.auth.signOut(accessToken).catch(() => undefined);
      return json(request, { authenticated: false }, 200, clearAuthCookies());
    }

    return json(request, { error: 'Unsupported auth action.' }, 400);
  } catch (error) {
    console.error('auth-gateway error:', error);
    return json(request, { error: error instanceof Error ? error.message : 'Authentication service error.' }, 500);
  }
});
