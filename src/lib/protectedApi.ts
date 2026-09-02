import { djangoRequest } from '@/lib/djangoApi';

const FUNCTION_NAME = 'protected-api';
export interface ProtectedApiErrorBody extends Record<string, unknown> { error?: string; message?: string; authenticated?: boolean; authorized?: boolean; role?: string | null; }
export interface ProtectedApiException extends Error { status?: number; authenticated?: boolean; authorized?: boolean; }
const getFunctionUrl = (): string => { const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined; if (!baseUrl) throw new Error('VITE_SUPABASE_URL is not configured.'); return `${baseUrl.replace(/\/+$/, '')}/functions/v1/${FUNCTION_NAME}`; };
const getPublishableKey = (): string => { const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined; if (!key) throw new Error('VITE_SUPABASE_ANON_KEY is not configured.'); return key; };
const readJson = async <T>(response: Response): Promise<T | null> => { const text = await response.text(); if (!text) return null; try { return JSON.parse(text) as T; } catch { return null; } };
const getQuery = (path: string): URLSearchParams => { const index = path.indexOf('?'); return new URLSearchParams(index >= 0 ? path.slice(index + 1) : ''); };
const getEqId = (value: string | null): string | null => { if (!value) return null; const match = value.match(/^eq\.(.+)$/); return match ? decodeURIComponent(match[1]) : null; };
const getInIds = (value: string | null): string[] => { if (!value) return []; const match = value.match(/^in\.\((.*)\)$/); return match ? match[1].split(',').map((id) => decodeURIComponent(id.trim())).filter(Boolean) : []; };
const getIlikeTerms = (value: string | null): string[] => { if (!value) return []; const match = value.match(/^\((.*)\)$/); if (!match) return []; return match[1].split(',').map((term) => term.replace(/^[^.]+\.ilike\.\*/, '').replace(/\*$/, '').trim()).filter(Boolean).map((term) => decodeURIComponent(term).toLowerCase()); };
const adminUser = <T>(userId: string) => djangoRequest<T>(`/api/accounts/admin/users/${encodeURIComponent(userId)}/`);
let adminDashboardPromise: Promise<unknown> | null = null;
const adminDashboard = <T>() => { if (!adminDashboardPromise) adminDashboardPromise = djangoRequest<T>('/api/accounts/admin/users/').finally(() => { adminDashboardPromise = null; }); return adminDashboardPromise as Promise<T>; };
const isAdminDetailQuery = (query: URLSearchParams): boolean => { const select = query.get('select') || ''; return select.includes('admin_review_note') && select.includes('national_id'); };
const isLandlordDashboardProfileQuery = (query: URLSearchParams): boolean => { const select = query.get('select') || ''; return select.includes('national_id') && select.includes('landlord_application_status') && !select.includes('admin_review_note'); };

const tryAdminBridge = async <T>(path: string, init: RequestInit): Promise<{ handled: boolean; data?: T }> => {
  const method = String(init.method || 'GET').toUpperCase();
  const resource = path.split('?')[0];
  const query = getQuery(path);

  if (resource === '/rest/v1/platform_settings' && method === 'GET') return { handled: true, data: [await djangoRequest<T>('/api/core/platform-settings/')] as T };
  if (resource === '/rest/v1/listing-payment-stk' && method === 'POST') return { handled: true, data: await djangoRequest<T>('/api/payments/listing/start/', { method: 'POST', body: init.body }) };

  if (resource === '/rest/v1/profiles' && isAdminDetailQuery(query)) {
    if (method === 'GET') {
      const eqId = getEqId(query.get('id')); const inIds = getInIds(query.get('id'));
      if (eqId) { const detail = await adminUser<{ profile: T }>(eqId); return { handled: true, data: [detail.profile] as T }; }
      if (inIds.length) { const rows: unknown[] = []; for (const id of inIds) { const detail = await adminUser<{ profile: unknown }>(id); if (detail.profile) rows.push(detail.profile); } return { handled: true, data: rows as T }; }
      const dashboard = await adminDashboard<{ items: T[] }>(); return { handled: true, data: dashboard.items as T };
    }
    if (method === 'PATCH') {
      const userId = getEqId(query.get('id')); if (!userId || !init.body) return { handled: false };
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      const hasGeneralProfileFields = ['full_name', 'email', 'phone', 'city', 'county', 'role'].some((field) => field in body);
      if (hasGeneralProfileFields) return { handled: true, data: await djangoRequest<T>(`/api/accounts/admin/users/${encodeURIComponent(userId)}/`, { method: 'PATCH', body: JSON.stringify(body) }) };
      const applicationType = 'landlord_application_status' in body ? 'landlord' : 'real_estate_application_status' in body ? 'real_estate' : 'mover_application_status' in body ? 'mover' : null;
      if (!applicationType) return { handled: false };
      const status = String(body[`${applicationType}_application_status`] || '').toLowerCase();
      return { handled: true, data: await djangoRequest<T>(`/api/accounts/admin/users/${encodeURIComponent(userId)}/application-status/`, { method: 'PATCH', body: JSON.stringify({ application_type: applicationType, status, admin_review_note: body.admin_review_note ?? null }) }) };
    }
  }
  if (resource === '/rest/v1/profiles' && isLandlordDashboardProfileQuery(query)) {
    if (method === 'GET') return { handled: true, data: [await djangoRequest<T>('/api/accounts/me/')] as T };
    if (method === 'PATCH') { if (!init.body) return { handled: false }; return { handled: true, data: await djangoRequest<T>('/api/accounts/me/', { method: 'PATCH', body: init.body }) }; }
  }
  if (resource === '/rest/v1/landlord_subscriptions' && method === 'GET') {
    const userId = getEqId(query.get('landlord_id'));
    if (userId) { const data = await djangoRequest<any>('/api/subscriptions/me/'); if (!data.subscription_id) return { handled: true, data: [] as T }; return { handled: true, data: [{ id: data.subscription_id, landlord_id: userId, plan_id: data.plan_id, billing_cycle: data.billing_cycle, status: data.subscription_status, current_period_start: data.current_period_start, current_period_end: data.current_period_end, grace_period_end: data.grace_period_end, auto_renew: data.auto_renew, plan: data.plan_id ? { id: data.plan_id, name: data.plan_name, max_listings: data.max_listings, max_units_per_listing: data.max_units_per_listing } : null }] as T }; }
    const dashboard = await adminDashboard<{ items: Array<{ subscription?: unknown }> }>(); return { handled: true, data: dashboard.items.map((item) => item.subscription).filter(Boolean) as T };
  }
  if (resource === '/rest/v1/real_estate_subscriptions' && method === 'GET') {
    const userId = getEqId(query.get('real_estate_id'));
    if (userId && isAdminDetailQuery(query)) { const detail = await adminUser<{ real_estate_subscription: T }>(userId); return { handled: true, data: (detail.real_estate_subscription ? [detail.real_estate_subscription] : []) as T }; }
    if (userId) { const data = await djangoRequest<any>('/api/subscriptions/me/'); if (!data.subscription_id) return { handled: true, data: [] as T }; return { handled: true, data: [{ id: data.subscription_id, real_estate_id: userId, plan_id: data.plan_id, billing_cycle: data.billing_cycle, status: data.subscription_status, current_period_start: data.current_period_start, current_period_end: data.current_period_end, grace_period_end: data.grace_period_end, auto_renew: data.auto_renew, plan: data.plan_id ? { id: data.plan_id, name: data.plan_name, max_listings: data.max_listings, max_units_per_listing: data.max_units_per_listing } : null }] as T }; }
    const dashboard = await adminDashboard<{ items: Array<{ subscription?: { real_estate_id?: string } | null }> }>(); return { handled: true, data: dashboard.items.map((item) => item.subscription).filter((subscription) => Boolean(subscription?.real_estate_id)) as T };
  }
  if (resource === '/rest/v1/listings' && method === 'GET') {
    const userId = getEqId(query.get('user_id'));
    if (userId && !isAdminDetailQuery(query)) { const data = await djangoRequest<{ results: T }>(`/api/listings/?user_id=${encodeURIComponent(userId)}&limit=100&offset=0`); return { handled: true, data: data.results }; }
    if (userId && isAdminDetailQuery(query)) { const detail = await adminUser<{ listings: T }>(userId); return { handled: true, data: detail.listings }; }
  }
  if (resource === '/rest/v1/listing_media' && method === 'GET') { const listingIds = getInIds(query.get('listing_id')); if (listingIds.length) { const rows: unknown[] = []; for (const listingId of listingIds) rows.push(...await djangoRequest<unknown[]>(`/api/listings/media/?listing_id=${encodeURIComponent(listingId)}`)); return { handled: true, data: rows as T }; } }
  if (resource === '/rest/v1/movers') {
    if (method === 'GET') {
      const userId = getEqId(query.get('user_id')); if (userId && isAdminDetailQuery(query)) { const detail = await adminUser<{ movers: T }>(userId); return { handled: true, data: detail.movers }; }
      const moverId = getEqId(query.get('id')); if (moverId && isAdminDetailQuery(query)) { const data = await djangoRequest<T>(`/api/accounts/admin/movers/${encodeURIComponent(moverId)}/`); return { handled: true, data: [data] as T }; }
      if (moverId) { const data = await djangoRequest<T>(`/api/core/movers/${encodeURIComponent(moverId)}/`); return { handled: true, data: [data] as T }; }
      const movers = await djangoRequest<Array<{ id: string; is_available: boolean; approval_status: string; driver_full_name: string; operating_city: string; vehicle_type: string; [key: string]: unknown }>>('/api/core/movers/'); let rows = movers.filter((mover) => mover.approval_status === 'approved' && mover.is_available);
      const availableFilter = query.get('is_available'); if (availableFilter === 'eq.false') rows = rows.filter((mover) => !mover.is_available); if (availableFilter === 'eq.true') rows = rows.filter((mover) => mover.is_available);
      const city = getEqId(query.get('operating_city')); if (city) rows = rows.filter((mover) => mover.operating_city === city); const vehicle = getEqId(query.get('vehicle_type')); if (vehicle) rows = rows.filter((mover) => mover.vehicle_type === vehicle);
      const searchTerms = getIlikeTerms(query.get('or')); if (searchTerms.length) rows = rows.filter((mover) => { const name = String(mover.driver_full_name || '').toLowerCase(); const operatingCity = String(mover.operating_city || '').toLowerCase(); return searchTerms.some((term) => name.includes(term) || operatingCity.includes(term)); }); rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))); return { handled: true, data: rows as T };
    }
    if (method === 'PATCH') { const moverId = getEqId(query.get('id')); if (moverId) return { handled: true, data: await djangoRequest<T>(`/api/accounts/admin/movers/${encodeURIComponent(moverId)}/`, { method: 'PATCH', body: init.body }) }; }
  }
  if (resource === '/rest/v1/reviews' && method === 'GET') {
    const moverIds = getInIds(query.get('mover_id')); const listingId = getEqId(query.get('listing_id')); const revieweeId = getEqId(query.get('reviewee_id')); const moverId = getEqId(query.get('mover_id')); const reviewType = getEqId(query.get('review_type')); const params = new URLSearchParams(); if (moverId) params.set('mover_id', moverId); if (listingId) params.set('listing_id', listingId); if (revieweeId) params.set('reviewee_id', revieweeId);
    const data = await djangoRequest<{ items: Array<Record<string, unknown>> }>(`/api/core/reviews/${params.toString() ? `?${params.toString()}` : ''}`); let rows = data.items || []; if (moverIds.length) rows = rows.filter((row) => moverIds.includes(String(row.mover_id))); if (reviewType) rows = rows.filter((row) => String(row.review_type) === reviewType); const select = query.get('select'); if (select) { const fields = select.split(',').map((field) => field.trim()).filter(Boolean); rows = rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]]))); } return { handled: true, data: rows as T };
  }
  if (resource === '/rest/v1/mover_applications' && method === 'GET') { const applicantId = getEqId(query.get('applicant_id')); const dashboard = await adminDashboard<{ items: Array<{ moverApplication?: unknown; id: string }> }>(); if (applicantId) { const item = dashboard.items.find((candidate) => candidate.id === applicantId); return { handled: true, data: item?.moverApplication ? [item.moverApplication] as T : [] as T }; } return { handled: true, data: dashboard.items.map((item) => item.moverApplication).filter(Boolean) as T }; }
  return { handled: false };
};

export const protectedApi = async <T = unknown>(path: string, init: RequestInit = {}): Promise<T> => {
  const normalizedPath = path === 'listing_media_insert_response' ? '/rest/v1/listing_media' : path;
  if (!normalizedPath.startsWith('/rest/v1/')) throw new Error('Protected API paths must target /rest/v1/.');
  const bridge = await tryAdminBridge<T>(normalizedPath, init); if (bridge.handled) return bridge.data as T;
  const headers = new Headers(init.headers); headers.set('apikey', getPublishableKey()); if (init.body !== undefined && init.body !== null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${getFunctionUrl()}${normalizedPath}`, { ...init, credentials: 'include', headers }); const body = await readJson<T | ProtectedApiErrorBody>(response);
  if (!response.ok) { const errorBody = body as ProtectedApiErrorBody | null; const error = new Error(errorBody?.error ?? errorBody?.message ?? `Protected API request failed (${response.status}).`) as ProtectedApiException; error.status = response.status; error.authenticated = errorBody?.authenticated; error.authorized = errorBody?.authorized; throw error; }
  return body as T;
};

export const protectedFunctionPost = async <T = unknown>(functionPath: string, body: unknown): Promise<T> => {
  if (functionPath === '/send-notification-emails') return djangoRequest<T>('/api/accounts/admin/application-notifications/', { method: 'POST', body: JSON.stringify(body) });
  if (!functionPath.startsWith('/')) throw new Error('Protected function paths must start with /. ');
  const response = await fetch(`${getFunctionUrl()}${functionPath}`, { method: 'POST', credentials: 'include', headers: { apikey: getPublishableKey(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await readJson<T | ProtectedApiErrorBody>(response);
  if (!response.ok) { const errorBody = data as ProtectedApiErrorBody | null; const error = new Error(errorBody?.error ?? errorBody?.message ?? `Protected function request failed (${response.status}).`) as ProtectedApiException; error.status = response.status; error.authenticated = errorBody?.authenticated; error.authorized = errorBody?.authorized; throw error; } return data as T;
};
export const protectedGet = async <T = unknown>(path: string, init: RequestInit = {}) => protectedApi<T>(path, { ...init, method: 'GET' });
export const protectedPost = async <T = unknown>(path: string, body: unknown, init: RequestInit = {}) => protectedApi<T>(path, { ...init, method: 'POST', body: JSON.stringify(body) });
export const protectedPatch = async <T = unknown>(path: string, body: unknown, init: RequestInit = {}) => protectedApi<T>(path, { ...init, method: 'PATCH', body: JSON.stringify(body) });
export const protectedPut = async <T = unknown>(path: string, body: unknown, init: RequestInit = {}) => protectedApi<T>(path, { ...init, method: 'PUT', body: JSON.stringify(body) });
export const protectedDelete = async <T = unknown>(path: string, init: RequestInit = {}) => protectedApi<T>(path, { ...init, method: 'DELETE' });
