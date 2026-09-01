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

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  if (!path.startsWith('/api/')) {
    throw new Error('Django API paths must target /api/.');
  }

  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  const body = await readJson<T | DjangoApiErrorBody>(response);
  if (!response.ok) {
    const errorBody = body as DjangoApiErrorBody | null;
    const error = new Error(
      errorBody?.detail || errorBody?.error || errorBody?.message ||
        `Django API request failed (${response.status}).`,
    ) as DjangoApiException;
    error.status = response.status;
    error.authenticated = errorBody?.authenticated;
    throw error;
  }

  return body as T;
};

const requestMultipart = async <T>(
  path: string,
  formData: FormData,
): Promise<T> => {
  if (!path.startsWith('/api/')) {
    throw new Error('Django API paths must target /api/.');
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
    body: formData,
  });

  const body = await readJson<T | DjangoApiErrorBody>(response);
  if (!response.ok) {
    const errorBody = body as DjangoApiErrorBody | null;
    const error = new Error(
      errorBody?.detail || errorBody?.error || errorBody?.message ||
        `Django API request failed (${response.status}).`,
    ) as DjangoApiException;
    error.status = response.status;
    error.authenticated = errorBody?.authenticated;
    throw error;
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
