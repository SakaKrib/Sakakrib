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
 * Django is the only API source of truth. Keep the configured value as an
 * origin, not an /api path, because every caller already supplies /api/...
 * This also makes the Docker/Vite same-origin proxy the safe default when no
 * browser-facing API origin is configured.
 */
const getBaseUrl = (): string => {
  const configured = import.meta.env.VITE_DJANGO_API_URL as string | undefined;
  const fallback = typeof window !== 'undefined' ? window.location.origin : '';
  return (configured || fallback)
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
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
 * Django's cookie-authenticated unsafe requests require a CSRF token.
 * The token itself is intentionally non-secret and is obtained from Django;
 * authentication JWTs remain HttpOnly and are never exposed to JavaScript.
 */
const getCsrfToken = async (forceRefresh = false): Promise<string> => {
  if (forceRefresh) csrfTokenPromise = null;
  if (csrfTokenPromise) return csrfTokenPromise;

  csrfTokenPromise = (async () => {
    const response = await fetch(`${getBaseUrl()}/api/accounts/csrf/`, {
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
      const csrfToken = await getCsrfToken();
      const response = await fetch(`${getBaseUrl()}/api/accounts/refresh/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'X-CSRFToken': csrfToken,
        },
      });

      if (response.status === 403) {
        const freshCsrfToken = await getCsrfToken(true);
        const retry = await fetch(`${getBaseUrl()}/api/accounts/refresh/`, {
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

  const method = String(init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', headers.get('Accept') || 'application/json');
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (isUnsafeMethod(method)) {
    headers.set('X-CSRFToken', await getCsrfToken());
  }

  const execute = () => fetch(`${getBaseUrl()}${path}`, {
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

  const headers = new Headers(init.headers);
  headers.set('Accept', headers.get('Accept') || '*/*');

  const execute = () => fetch(`${getBaseUrl()}${path}`, {
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

  const csrfToken = await getCsrfToken();
  const headers = new Headers({
    Accept: 'application/json',
    'X-CSRFToken': csrfToken,
  });

  const execute = () => fetch(`${getBaseUrl()}${path}`, {
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
