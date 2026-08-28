const FUNCTION_NAME = 'protected-api';

export interface ProtectedApiErrorBody {
  error?: string;
  message?: string;
  authenticated?: boolean;
}

const getFunctionUrl = (): string => {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!baseUrl) throw new Error('VITE_SUPABASE_URL is not configured.');
  return `${baseUrl.replace(/\/$/, '')}/functions/v1/${FUNCTION_NAME}`;
};

const getPublishableKey = (): string => {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!key) throw new Error('VITE_SUPABASE_ANON_KEY is not configured.');
  return key;
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

/**
 * Authenticated browser transport for protected application data.
 *
 * The browser never reads an access or refresh token. The browser only
 * sends credentials: include, allowing the HttpOnly auth cookies to reach
 * the protected-api Edge Function.
 */
export const protectedApi = async <T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  if (!path.startsWith('/rest/v1/')) {
    throw new Error('Protected API paths must target /rest/v1/.');
  }

  const headers = new Headers(init.headers);
  headers.set('apikey', getPublishableKey());

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${getFunctionUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  const body = await readJson<T & ProtectedApiErrorBody>(response);

  if (!response.ok) {
    const errorBody = body as ProtectedApiErrorBody | null;
    const message =
      errorBody?.error ??
      errorBody?.message ??
      `Protected API request failed (${response.status}).`;

    const error = new Error(message) as Error & {
      status?: number;
      authenticated?: boolean;
    };
    error.status = response.status;
    error.authenticated = errorBody?.authenticated;
    throw error;
  }

  return body as T;
};

export const protectedGet = <T = unknown>(path: string, init: RequestInit = {}) =>
  protectedApi<T>(path, { ...init, method: 'GET' });

export const protectedPost = <T = unknown>(
  path: string,
  body: unknown,
  init: RequestInit = {},
) =>
  protectedApi<T>(path, {
    ...init,
    method: 'POST',
    body: JSON.stringify(body),
  });

export const protectedPatch = <T = unknown>(
  path: string,
  body: unknown,
  init: RequestInit = {},
) =>
  protectedApi<T>(path, {
    ...init,
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const protectedDelete = <T = unknown>(path: string, init: RequestInit = {}) =>
  protectedApi<T>(path, { ...init, method: 'DELETE' });
