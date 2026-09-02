const API_BASE_URL = (import.meta.env.VITE_DJANGO_API_URL as string | undefined)?.replace(/\/+$/, '') || '';

let csrfToken: string | null = null;

function buildUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function readResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string) {
  if (typeof body === 'string' && body.trim()) return body;
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    for (const key of ['detail', 'error', 'message']) {
      if (typeof record[key] === 'string') return record[key] as string;
    }
    const first = Object.values(record).find((value) => Array.isArray(value) && value.length);
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
  }
  return fallback;
}

export async function getCsrfToken() {
  const response = await fetch(buildUrl('/api/auth/csrf/'), {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  const body = await readResponse(response);
  if (!response.ok) throw new Error(errorMessage(body, 'Unable to initialize security token.'));

  const token = body && typeof body === 'object' && typeof (body as Record<string, unknown>).csrfToken === 'string'
    ? (body as Record<string, string>).csrfToken
    : null;

  if (token) csrfToken = token;
  return csrfToken;
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!csrfToken) await getCsrfToken();
    if (csrfToken) headers.set('X-CSRFToken', csrfToken);
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    method,
    headers,
    credentials: 'include',
  });

  if (response.status === 403 && retry && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    csrfToken = null;
    await getCsrfToken();
    return request<T>(path, options, false);
  }

  const body = await readResponse(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, `Request failed (${response.status}).`));
  }

  return body as T;
}

export const djangoApi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
