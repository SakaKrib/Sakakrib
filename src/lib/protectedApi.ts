const FUNCTION_NAME = 'protected-api';

export interface ProtectedApiErrorBody extends Record<string, unknown> {
  error?: string;
  message?: string;
  authenticated?: boolean;
  authorized?: boolean;
  role?: string | null;
}

export interface ProtectedApiException extends Error {
  status?: number;
  authenticated?: boolean;
  authorized?: boolean;
}

const getFunctionUrl = (): string => {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!baseUrl) throw new Error('VITE_SUPABASE_URL is not configured.');
  return `${baseUrl.replace(/\/+$/, '')}/functions/v1/${FUNCTION_NAME}`;
};

const getPublishableKey = (): string => {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!key) throw new Error('VITE_SUPABASE_ANON_KEY is not configured.');
  return key;
};

const getDjangoBaseUrl = (): string => {
  const value = import.meta.env.VITE_DJANGO_API_URL as string | undefined;
  return (value || '').replace(/\/+$/, '');
};

const readJson = async <T>(response: Response): Promise<T | null> => {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
};

const djangoRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${getDjangoBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body != null ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await readJson<T | ProtectedApiErrorBody>(response);
  if (!response.ok) {
    const errorBody = body as ProtectedApiErrorBody | null;
    const error = new Error(
      errorBody?.error || errorBody?.message || `Django API request failed (${response.status}).`,
    ) as ProtectedApiException;
    error.status = response.status;
    error.authenticated = errorBody?.authenticated;
    error.authorized = errorBody?.authorized;
    throw error;
  }
  return body as T;
};

const getQuery = (path: string): URLSearchParams => {
  const index = path.indexOf('?');
  return new URLSearchParams(index >= 0 ? path.slice(index + 1) : '');
};

const getEqId = (value: string | null): string | null => {
  if (!value) return null;
  const match = value.match(/^eq\.(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const getInIds = (value: string | null): string[] => {
  if (!value) return [];
  const match = value.match(/^in\.\((.*)\)$/);
  return match ? match[1].split(',').map((id) => decodeURIComponent(id.trim())).filter(Boolean) : [];
};

const adminUser = <T>(userId: string) =>
  djangoRequest<T>(`/api/accounts/admin/users/${encodeURIComponent(userId)}/`);

let adminDashboardPromise: Promise<unknown> | null = null;

const adminDashboard = <T>() => {
  if (!adminDashboardPromise) {
    adminDashboardPromise = djangoRequest<T>('/api/accounts/admin/users/').finally(() => {
      adminDashboardPromise = null;
    });
  }
  return adminDashboardPromise as Promise<T>;
};

const isAdminDetailQuery = (query: URLSearchParams): boolean => {
  const select = query.get('select') || '';
  return select.includes('admin_review_note') && select.includes('national_id');
};

/** Transitional transport bridge for legacy admin pages. */
const tryAdminBridge = async <T>(path: string, init: RequestInit): Promise<{ handled: boolean; data?: T }> => {
  const method = String(init.method || 'GET').toUpperCase();
  const resource = path.split('?')[0];
  const query = getQuery(path);

  if (resource === '/rest/v1/profiles' && isAdminDetailQuery(query)) {
    if (method === 'GET') {
      const eqId = getEqId(query.get('id'));
      const inIds = getInIds(query.get('id'));
      if (eqId) {
        const detail = await adminUser<{ profile: T }>(eqId);
        return { handled: true, data: [detail.profile] as T };
      }
      if (inIds.length) {
        const rows: unknown[] = [];
        for (const id of inIds) {
          const detail = await adminUser<{ profile: unknown }>(id);
          if (detail.profile) rows.push(detail.profile);
        }
        return { handled: true, data: rows as T };
      }
      const dashboard = await adminDashboard<{ items: T[] }>();
      return { handled: true, data: dashboard.items as T };
    }

    if (method === 'PATCH') {
      const userId = getEqId(query.get('id'));
      if (!userId || !init.body) return { handled: false };
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;

      const hasGeneralProfileFields = [
        'full_name', 'email', 'phone', 'city', 'county', 'role',
      ].some((field) => field in body);
      if (hasGeneralProfileFields) {
        const data = await djangoRequest<T>(
          `/api/accounts/admin/users/${encodeURIComponent(userId)}/`,
          { method: 'PATCH', body: JSON.stringify(body) },
        );
        return { handled: true, data };
      }

      const applicationType =
        'landlord_application_status' in body ? 'landlord' :
        'real_estate_application_status' in body ? 'real_estate' :
        'mover_application_status' in body ? 'mover' : null;
      if (!applicationType) return { handled: false };
      const status = String(body[`${applicationType}_application_status`] || '').toLowerCase();
      const data = await djangoRequest<T>(
        `/api/accounts/admin/users/${encodeURIComponent(userId)}/application-status/`,
        {
          method: 'PATCH',
          body: JSON.stringify({ application_type: applicationType, status, admin_review_note: body.admin_review_note ?? null }),
        },
      );
      return { handled: true, data };
    }
  }

  if (resource === '/rest/v1/landlord_subscriptions' && method === 'GET') {
    const userId = getEqId(query.get('landlord_id'));
    if (userId) {
      const detail = await adminUser<{ landlord_subscription: T }>(userId);
      return { handled: true, data: (detail.landlord_subscription ? [detail.landlord_subscription] : []) as T };
    }
    const dashboard = await adminDashboard<{ items: Array<{ subscription?: unknown }> }>();
    const rows = dashboard.items.map((item) => item.subscription).filter(Boolean);
    return { handled: true, data: rows as T };
  }

  if (resource === '/rest/v1/real_estate_subscriptions' && method === 'GET') {
    const userId = getEqId(query.get('real_estate_id'));
    if (userId) {
      const detail = await adminUser<{ real_estate_subscription: T }>(userId);
      return { handled: true, data: (detail.real_estate_subscription ? [detail.real_estate_subscription] : []) as T };
    }
    const dashboard = await adminDashboard<{ items: Array<{ subscription?: { real_estate_id?: string } | null }> }>();
    const rows = dashboard.items.map((item) => item.subscription).filter((subscription) => Boolean(subscription?.real_estate_id));
    return { handled: true, data: rows as T };
  }

  if (resource === '/rest/v1/listings' && method === 'GET') {
    const userId = getEqId(query.get('user_id'));
    if (userId && isAdminDetailQuery(query)) {
      const detail = await adminUser<{ listings: T }>(userId);
      return { handled: true, data: detail.listings };
    }
  }

  if (resource === '/rest/v1/listing_media' && method === 'GET') {
    const listingIds = getInIds(query.get('listing_id'));
    if (listingIds.length) {
      const rows: unknown[] = [];
      for (const listingId of listingIds) {
        const media = await djangoRequest<unknown[]>(`/api/listings/media/?listing_id=${encodeURIComponent(listingId)}`);
        rows.push(...media);
      }
      return { handled: true, data: rows as T };
    }
  }

  if (resource === '/rest/v1/movers') {
    if (method === 'GET') {
      const userId = getEqId(query.get('user_id'));
      if (userId && isAdminDetailQuery(query)) {
        const detail = await adminUser<{ movers: T }>(userId);
        return { handled: true, data: detail.movers };
      }
      const moverId = getEqId(query.get('id'));
      if (moverId && isAdminDetailQuery(query)) {
        const data = await djangoRequest<T>(`/api/accounts/admin/movers/${encodeURIComponent(moverId)}/`);
        return { handled: true, data: [data] as T };
      }
      const dashboard = await adminDashboard<{ items: Array<{ moverRecord?: unknown }> }>();
      const rows = dashboard.items.map((item) => item.moverRecord).filter(Boolean);
      return { handled: true, data: rows as T };
    }
    if (method === 'PATCH') {
      const moverId = getEqId(query.get('id'));
      if (moverId) {
        const data = await djangoRequest<T>(
          `/api/accounts/admin/movers/${encodeURIComponent(moverId)}/`,
          { method: 'PATCH', body: init.body },
        );
        return { handled: true, data };
      }
    }
  }

  if (resource === '/rest/v1/mover_applications' && method === 'GET') {
    const applicantId = getEqId(query.get('applicant_id'));
    const dashboard = await adminDashboard<{ items: Array<{ moverApplication?: unknown; id: string }> }>();
    if (applicantId) {
      const item = dashboard.items.find((candidate) => candidate.id === applicantId);
      return { handled: true, data: item?.moverApplication ? [item.moverApplication] as T : [] as T };
    }
    const rows = dashboard.items.map((item) => item.moverApplication).filter(Boolean);
    return { handled: true, data: rows as T };
  }

  return { handled: false };
};

export const protectedApi = async <T = unknown>(path: string, init: RequestInit = {}): Promise<T> => {
  const normalizedPath = path === 'listing_media_insert_response' ? '/rest/v1/listing_media' : path;
  if (!normalizedPath.startsWith('/rest/v1/')) throw new Error('Protected API paths must target /rest/v1/.');
  const bridge = await tryAdminBridge<T>(normalizedPath, init);
  if (bridge.handled) return bridge.data as T;

  const headers = new Headers(init.headers);
  headers.set('apikey', getPublishableKey());
  if (init.body !== undefined && init.body !== null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${getFunctionUrl()}${normalizedPath}`, { ...init, credentials: 'include', headers });
  const body = await readJson<T | ProtectedApiErrorBody>(response);
  if (!response.ok) {
    const errorBody = body as ProtectedApiErrorBody | null;
    const error = new Error(errorBody?.error ?? errorBody?.message ?? `Protected API request failed (${response.status}).`) as ProtectedApiException;
    error.status = response.status;
    error.authenticated = errorBody?.authenticated;
    error.authorized = errorBody?.authorized;
    throw error;
  }
  return body as T;
};

export const protectedFunctionPost = async <T = unknown>(functionPath: string, body: unknown): Promise<T> => {
  if (functionPath === '/send-notification-emails') {
    return djangoRequest<T>('/api/accounts/admin/application-notifications/', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
  if (!functionPath.startsWith('/')) throw new Error('Protected function paths must start with /. ');
  const response = await fetch(`${getFunctionUrl()}${functionPath}`, {
    method: 'POST', credentials: 'include',
    headers: { apikey: getPublishableKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await readJson<T | ProtectedApiErrorBody>(response);
  if (!response.ok) {
    const errorBody = data as ProtectedApiErrorBody | null;
    const error = new Error(errorBody?.error ?? errorBody?.message ?? `Protected function request failed (${response.status}).`) as ProtectedApiException;
    error.status = response.status;
    error.authenticated = errorBody?.authenticated;
    error.authorized = errorBody?.authorized;
    throw error;
  }
  return data as T;
};

export const protectedGet = async <T = unknown>(path: string, init: RequestInit = {}) => protectedApi<T>(path, { ...init, method: 'GET' });
export const protectedPost = async <T = unknown>(path: string, body: unknown, init: RequestInit = {}) => protectedApi<T>(path, { ...init, method: 'POST', body: JSON.stringify(body) });
export const protectedPatch = async <T = unknown>(path: string, body: unknown, init: RequestInit = {}) => protectedApi<T>(path, { ...init, method: 'PATCH', body: JSON.stringify(body) });
export const protectedPut = async <T = unknown>(path: string, body: unknown, init: RequestInit = {}) => protectedApi<T>(path, { ...init, method: 'PUT', body: JSON.stringify(body) });
export const protectedDelete = async <T = unknown>(path: string, init: RequestInit = {}) => protectedApi<T>(path, { ...init, method: 'DELETE' });
