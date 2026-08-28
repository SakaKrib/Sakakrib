import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase environment is not configured.');
}

const allowedOrigin = (request: Request): string => {
  const origin = request.headers.get('origin');
  const configuredOrigin = Deno.env.get('APP_ORIGIN');

  if (configuredOrigin && origin === configuredOrigin) return origin;

  if (
    origin === 'http://localhost:5173' ||
    origin === 'http://localhost:5174' ||
    origin === 'http://localhost:5175' ||
    origin === 'http://localhost:5176' ||
    origin === 'http://127.0.0.1:5173' ||
    origin === 'http://127.0.0.1:5174' ||
    origin === 'http://127.0.0.1:5175' ||
    origin === 'http://127.0.0.1:5176'
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-http-method-override',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    Vary: 'Origin',
  };
};

const json = (
  request: Request,
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: HeadersInit = [],
) => {
  const headers = new Headers(corsHeaders(request));
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');

  for (const [name, value] of extraHeaders) {
    headers.append(name, value);
  }

  return new Response(JSON.stringify(body), { status, headers });
};

const readCookies = (request: Request): Record<string, string> => {
  const result: Record<string, string> = {};

  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;

    const name = part.slice(0, index).trim();
    if (!name) continue;

    try {
      result[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      result[name] = part.slice(index + 1).trim();
    }
  }

  return result;
};

const clearAuthCookies = (): HeadersInit => [
  ['Set-Cookie', 'sk_access=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0'],
  ['Set-Cookie', 'sk_refresh=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0'],
];

const isSafeRestPath = (path: string): boolean => {
  if (!path.startsWith('/rest/v1/')) return false;
  if (path.includes('://') || path.startsWith('//')) return false;

  // Keep this function a fixed-origin PostgREST proxy. The browser can
  // select a public REST/RPC resource, but cannot redirect the gateway to
  // another host.
  return true;
};

const authenticate = async (accessToken: string) => {
  const authClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) return null;

  const userClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  return { user: data.user, userClient };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const origin = request.headers.get('origin');
  const configuredOrigin = Deno.env.get('APP_ORIGIN');
  if (
    configuredOrigin &&
    origin &&
    origin !== configuredOrigin
  ) {
    return json(request, { error: 'Origin not allowed.' }, 403);
  }

  try {
    const cookies = readCookies(request);
    const accessToken = cookies.sk_access;

    if (!accessToken) {
      return json(request, { authenticated: false, error: 'Authentication required.' }, 401, clearAuthCookies());
    }

    const authenticated = await authenticate(accessToken);
    if (!authenticated) {
      return json(request, { authenticated: false, error: 'Authentication expired.' }, 401, clearAuthCookies());
    }

    const url = new URL(request.url);
    const targetPath = url.search ? `${url.pathname}${url.search}` : url.pathname;

    if (!isSafeRestPath(url.pathname)) {
      return json(request, { error: 'Unsupported protected API path.' }, 400);
    }

    const targetUrl = `${SUPABASE_URL}${targetPath}`;
    const body = request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await request.text();

    const headers = new Headers();
    headers.set('apikey', SUPABASE_ANON_KEY!);
    headers.set('Authorization', `Bearer ${accessToken}`);
    headers.set('Accept', request.headers.get('accept') ?? 'application/json');

    const contentType = request.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);

    const prefer = request.headers.get('prefer');
    if (prefer) headers.set('Prefer', prefer);

    const range = request.headers.get('range');
    if (range) headers.set('Range', range);

    const postgrestResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
    });

    const responseHeaders = new Headers(corsHeaders(request));
    responseHeaders.set('Cache-Control', 'no-store');

    for (const headerName of ['content-type', 'content-range', 'location']) {
      const value = postgrestResponse.headers.get(headerName);
      if (value) responseHeaders.set(headerName, value);
    }

    const responseBody = await postgrestResponse.arrayBuffer();

    return new Response(responseBody, {
      status: postgrestResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('protected-api error:', error);
    return json(request, { error: 'Protected API request failed.' }, 500);
  }
});
