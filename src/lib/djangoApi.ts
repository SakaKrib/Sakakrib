export interface DjangoApiErrorBody {
  detail?: string;
  error?: string;
  message?: string;
  authenticated?: boolean;
}

export interface DjangoApiException extends Error {
  status?: number;
  authenticated?: boolean;
}

/**
 * Browser development uses the current origin so /api/... requests pass
 * through the Vite proxy. Native builds can provide a primary Tailscale URL
 * and a fallback Ngrok URL. We select one reachable host once per app run,
 * before authentication, so HttpOnly cookies remain on a single origin.
 */
type ApiEnvironment = ImportMetaEnv & {
  readonly VITE_DJANGO_API_FALLBACK_URL?: string;
  readonly VITE_DJANGO_API_URLS?: string;
};

const normalizeApiBaseUrl = (value?: string): string => String(value || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/api$/i, '');

const configuredApiBaseUrls = (): string[] => {
  const env = import.meta.env as ApiEnvironment;
  const values = [
    env.VITE_DJANGO_API_URL,
    env.VITE_DJANGO_API_FALLBACK_URL,
    ...(env.VITE_DJANGO_API_URLS || '').split(','),
  ];
  return values
    .map(normalizeApiBaseUrl)
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index);
};

let activeApiBaseUrl: string | null = null;
let apiBaseSelectionPromise: Promise<string> | null = null;

/** Returns the selected API base, or the primary configured base before selection. */
export const getDjangoApiBaseUrl = (): string => {
  if (activeApiBaseUrl) return activeApiBaseUrl;
  const [primary] = configuredApiBaseUrls();
  if (primary) return primary;
  return typeof window !== 'undefined' ? window.location.origin : '';
};

/** Build a WebSocket URL from the exact API host selected for HTTP/auth. */
export const getDjangoWebSocketUrl = (path: string): string => {
  const url = new URL(path, getDjangoApiBaseUrl());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
};

/**
 * Probe the public CSRF endpoint in priority order. The first endpoint that
 * returns Django's JSON CSRF response is used for all API and WebSocket calls
 * until the app restarts. A failed preferred tunnel therefore falls back to
 * the next configured tunnel before the user signs in.
 */
export const ensureDjangoApiBaseUrl = async (): Promise<string> => {
  if (activeApiBaseUrl) return activeApiBaseUrl;
  if (apiBaseSelectionPromise) return apiBaseSelectionPromise;

  const candidates = configuredApiBaseUrls();
  if (!candidates.length) {
    activeApiBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return activeApiBaseUrl;
  }

  const selection = (async () => {
    for (const candidate of candidates) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      try {
        const response = await fetch(`${candidate}/api/accounts/csrf/`, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) continue;
        const body = await response.json() as { csrfToken?: string };
        if (typeof body?.csrfToken === 'string' && body.csrfToken.length > 0) {
          activeApiBaseUrl = candidate;
          return candidate;
        }
      } catch {
        // Try the next configured endpoint if this tunnel is offline or unreachable.
      } finally {
        clearTimeout(timeout);
      }
    }

    // Keep the preferred URL so the eventual API error identifies the primary
    // endpoint rather than silently redirecting requests to an unknown host.
    activeApiBaseUrl = candidates[0];
    console.warn('No configured Django API endpoint passed the startup check; using the primary URL.');
    return activeApiBaseUrl;
  })();

  apiBaseSelectionPromise = selection;
  try {
    return await selection;
  } finally {
    if (apiBaseSelectionPromise === selection) apiBaseSelectionPromise = null;
  }
};

/**
 * Resolve Django-hosted media paths against the same selected API host used
 * for authenticated requests. Preserve non-Django/CDN image URLs unchanged.
 */
export const resolveDjangoMediaUrl = (value?: string | null): string => {
  const url = String(value || '').trim();
  if (!url) return '';

  const baseUrl = getDjangoApiBaseUrl();
  if (url.startsWith('/api/') || url.startsWith('/media/')) {
    return `${baseUrl}${url}`;
  }

  try {
    const parsed = new URL(url, baseUrl || window.location.origin);
    if (parsed.pathname.startsWith('/api/') || parsed.pathname.startsWith('/media/')) {
      return `${baseUrl}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Preserve non-URL values for the existing fallback behavior.
  }

  return url;
};

const readJson = async <T>(response: Response): Promise<T | null> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

let refreshPromise: Promise<boolean> | null = null;
let csrfTokenPromise: Promise<string> | null = null;

/**
 * Reuse Django's existing non-HttpOnly CSRF cookie when the browser already
 * has one. This avoids an unnecessary CSRF endpoint request during JWT
 * refresh, while still falling back to Django when no cookie is available.
 */
const readCsrfCookie = (): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
};

/**
 * Django's cookie-authenticated unsafe requests require a CSRF token.
 * The token itself is intentionally non-secret and is obtained from Django;
 * authentication JWTs remain HttpOnly and are never exposed to JavaScript.
 */
const getCsrfToken = async (forceRefresh = false): Promise<string> => {
  if (!forceRefresh) {
    const existingToken = readCsrfCookie();
    if (existingToken) return existingToken;
  }

  if (forceRefresh) csrfTokenPromise = null;
  if (csrfTokenPromise) return csrfTokenPromise;

  csrfTokenPromise = (async () => {
    const baseUrl = await ensureDjangoApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/accounts/csrf/`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const body = await readJson<{ csrfToken?: string }>(response);
    if (!response.ok || !body?.csrfToken) {
      throw new Error(`Unable to obtain Django CSRF token (${response.status}).`);
    }
    return body.csrfToken;
  })().finally(() => {
    csrfTokenPromise = null;
  });

  return csrfTokenPromise;
};

const isUnsafeMethod = (method: string): boolean =>
  !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method.toUpperCase());

/**
 * Rotate the HttpOnly refresh cookie and let the browser store the new
 * access/refresh cookies. The refresh token itself is never exposed to JS.
 * A shared promise prevents concurrent 401 responses from rotating the same
 * refresh token multiple times.
 */
const refreshAuthentication = async (): Promise<boolean> => {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const baseUrl = await ensureDjangoApiBaseUrl();
      const csrfToken = await getCsrfToken();
      const response = await fetch(`${baseUrl}/api/accounts/refresh/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'X-CSRFToken': csrfToken,
        },
      });

      if (response.status === 403) {
        const freshCsrfToken = await getCsrfToken(true);
        const retry = await fetch(`${baseUrl}/api/accounts/refresh/`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'X-CSRFToken': freshCsrfToken,
          },
        });
        return retry.ok;
      }

      return response.ok;
    } catch (error) {
      console.error('Django authentication refresh failed:', error);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

const createApiError = (
  response: Response,
  body: DjangoApiErrorBody | null,
): DjangoApiException => {
  const error = new Error(
    body?.detail || body?.error || body?.message ||
      `Django API request failed (${response.status}).`,
  ) as DjangoApiException;
  error.status = response.status;
  error.authenticated = body?.authenticated;
  return error;
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  if (!path.startsWith('/api/')) {
    throw new Error('Django API paths must target /api/.');
  }

  const baseUrl = await ensureDjangoApiBaseUrl();
  const method = String(init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', headers.get('Accept') || 'application/json');
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (isUnsafeMethod(method)) {
    headers.set('X-CSRFToken', await getCsrfToken());
  }

  const execute = () => fetch(`${baseUrl}${path}`, {
    ...init,
    method,
    credentials: 'include',
    headers,
  });

  let response = await execute();

  if (response.status === 403 && isUnsafeMethod(method)) {
    const body = await readJson<T | DjangoApiErrorBody>(response.clone());
    const detail = body as DjangoApiErrorBody | null;
    if (detail?.detail && /csrf/i.test(detail.detail)) {
      headers.set('X-CSRFToken', await getCsrfToken(true));
      response = await execute();
    }
  }

  if (response.status === 401 && path !== '/api/accounts/refresh/') {
    const refreshed = await refreshAuthentication();
    if (refreshed) {
      if (isUnsafeMethod(method)) {
        headers.set('X-CSRFToken', await getCsrfToken());
      }
      response = await execute();
    }
  }

  const body = await readJson<T | DjangoApiErrorBody>(response);
  if (!response.ok) {
    throw createApiError(response, body as DjangoApiErrorBody | null);
  }

  return body as T;
};

export const djangoRequest = request;

export const protectedBlob = async (
  path: string,
  init: RequestInit = {},
): Promise<Blob> => {
  if (!path.startsWith('/api/')) {
    throw new Error('Django API paths must target /api/.');
  }

  const baseUrl = await ensureDjangoApiBaseUrl();
  const headers = new Headers(init.headers);
  headers.set('Accept', headers.get('Accept') || '*/*');

  const execute = () => fetch(`${baseUrl}${path}`, {
    ...init,
    method: 'GET',
    credentials: 'include',
    headers,
  });

  let response = await execute();

  if (response.status === 401) {
    const refreshed = await refreshAuthentication();
    if (refreshed) response = await execute();
  }

  if (!response.ok) {
    const body = await readJson<DjangoApiErrorBody>(response.clone());
    throw createApiError(response, body);
  }

  return response.blob();
};

const requestMultipart = async <T>(
  path: string,
  formData: FormData,
): Promise<T> => {
  if (!path.startsWith('/api/')) {
    throw new Error('Django API paths must target /api/.');
  }

  const baseUrl = await ensureDjangoApiBaseUrl();
  const csrfToken = await getCsrfToken();
  const headers = new Headers({
    Accept: 'application/json',
    'X-CSRFToken': csrfToken,
  });

  const execute = () => fetch(`${baseUrl}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: formData,
  });

  let response = await execute();

  if (response.status === 403) {
    const body = await readJson<DjangoApiErrorBody>(response.clone());
    if (body?.detail && /csrf/i.test(body.detail)) {
      headers.set('X-CSRFToken', await getCsrfToken(true));
      response = await execute();
    }
  }

  if (response.status === 401) {
    const refreshed = await refreshAuthentication();
    if (refreshed) {
      headers.set('X-CSRFToken', await getCsrfToken());
      response = await execute();
    }
  }

  const body = await readJson<T | DjangoApiErrorBody>(response);
  if (!response.ok) {
    throw createApiError(response, body as DjangoApiErrorBody | null);
  }

  return body as T;
};

export const protectedGet = <T = unknown>(path: string, init: RequestInit = {}) =>
  request<T>(path, { ...init, method: 'GET' });

export const protectedPost = <T = unknown>(path: string, body: unknown, init: RequestInit = {}) =>
  request<T>(path, { ...init, method: 'POST', body: JSON.stringify(body) });

export const protectedPatch = <T = unknown>(path: string, body: unknown, init: RequestInit = {}) =>
  request<T>(path, { ...init, method: 'PATCH', body: JSON.stringify(body) });

export const protectedPut = <T = unknown>(path: string, body: unknown, init: RequestInit = {}) =>
  request<T>(path, { ...init, method: 'PUT', body: JSON.stringify(body) });

export const protectedDelete = <T = unknown>(path: string, init: RequestInit = {}) =>
  request<T>(path, { ...init, method: 'DELETE' });

export const protectedUpload = <T = unknown>(path: string, formData: FormData) =>
  requestMultipart<T>(path, formData);
