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

const getBaseUrl = (): string => {
  const configured = import.meta.env.VITE_DJANGO_API_URL as string | undefined;
  return (configured || '').replace(/\/+$/, '');
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
      const response = await fetch(`${getBaseUrl()}/api/accounts/refresh/`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

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

  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const execute = () => fetch(`${getBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  let response = await execute();

  // Access JWTs are intentionally short-lived. If an authenticated request
  // reaches Django after expiry, rotate the HttpOnly refresh cookie once and
  // retry the exact original request. Never retry more than once.
  if (response.status === 401 && path !== '/api/accounts/refresh/') {
    const refreshed = await refreshAuthentication();
    if (refreshed) {
      response = await execute();
    }
  }

  const body = await readJson<T | DjangoApiErrorBody>(response);
  if (!response.ok) {
    throw createApiError(response, body as DjangoApiErrorBody | null);
  }

  return body as T;
};

/** Generic Django transport for transitional compatibility bridges. */
export const djangoRequest = request;

const requestMultipart = async <T>(
  path: string,
  formData: FormData,
): Promise<T> => {
  if (!path.startsWith('/api/')) {
    throw new Error('Django API paths must target /api/.');
  }

  const execute = () => fetch(`${getBaseUrl()}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
    body: formData,
  });

  let response = await execute();

  if (response.status === 401 && path !== '/api/accounts/refresh/') {
    const refreshed = await refreshAuthentication();
    if (refreshed) {
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
