import {
  djangoRequest,
  protectedDelete as djangoDelete,
  protectedGet as djangoGet,
  protectedPatch as djangoPatch,
  protectedPost as djangoPost,
  protectedPut as djangoPut,
  protectedUpload as djangoUpload,
} from '@/lib/djangoApi';

/**
 * Django-only compatibility transport for legacy call sites.
 *
 * The public function names are retained so existing screens keep their
 * current behaviour while their old /rest/v1 paths are translated to the
 * corresponding Django API boundary. No Supabase URL, key, SDK or Edge
 * Function is used here.
 *
 * This module is transitional. Consumers should migrate directly to
 * djangoApi.ts/domain services as each endpoint contract is verified.
 */

export interface ProtectedApiErrorBody extends Record<string, unknown> {
  error?: string;
  message?: string;
  detail?: string;
  authenticated?: boolean;
  authorized?: boolean;
  role?: string | null;
}

export interface ProtectedApiException extends Error {
  status?: number;
  authenticated?: boolean;
  authorized?: boolean;
}

const getEq = (query: URLSearchParams, field: string): string | null => {
  const value = query.get(field);
  if (!value) return null;
  const match = value.match(/^eq\.(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const getQuery = (path: string) => {
  const index = path.indexOf('?');
  return new URLSearchParams(index >= 0 ? path.slice(index + 1) : '');
};

const getResource = (path: string) => path.split('?')[0].replace(/^\/rest\/v1\//, '');

const json = (init: RequestInit) => init.body == null ? undefined : init.body;

const getAdminDashboard = () =>
  djangoGet<{ items: Array<Record<string, any>> }>('/api/accounts/admin/users/');

const requestLegacy = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  if (path.startsWith('/api/')) return djangoRequest<T>(path, init);
  if (!path.startsWith('/rest/v1/')) throw new Error('Django API paths must target /api/.');

  const resource = getResource(path);
  const query = getQuery(path);
  const method = String(init.method || 'GET').toUpperCase();

  if (resource === 'platform_settings' && method === 'GET') {
    return djangoGet<T>('/api/core/platform-settings/');
  }

  if (resource === 'profiles') {
    const userId = getEq(query, 'id');
    if (method === 'GET') {
      const profile = await djangoGet<Record<string, unknown>>('/api/accounts/me/');
      if (userId && String(profile.id) !== userId) return [] as T;
      return [profile] as T;
    }
    if ((method === 'PATCH' || method === 'PUT') && userId) {
      // Legacy self-profile updates must never use an administrator endpoint.
      // Compare the requested id with the authenticated /me/ identity first;
      // only a different target is allowed to use the admin compatibility path.
      const profile = await djangoGet<Record<string, unknown>>('/api/accounts/me/');
      if (String(profile.id) === userId) {
        return djangoRequest<T>('/api/accounts/me/', { ...init, method });
      }
      return djangoRequest<T>(`/api/accounts/admin/users/${encodeURIComponent(userId)}/`, {
        ...init,
        method,
      });
    }
    if (method === 'PATCH' || method === 'PUT') return djangoRequest<T>('/api/accounts/me/', { ...init, method });
  }

  if (resource === 'landlord_subscriptions' && method === 'GET') {
    const subscription = await djangoGet<Record<string, unknown>>('/api/subscriptions/me/');
    if (!subscription?.subscription_id) return [] as T;

    const normalized = {
      id: subscription.subscription_id,
      subscription_id: subscription.subscription_id,
      landlord_id: subscription.landlord_id,
      plan_id: subscription.plan_id,
      status: subscription.subscription_status,
      billing_cycle: subscription.billing_cycle,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      grace_period_end: subscription.grace_period_end,
      auto_renew: subscription.auto_renew,
      paypal_subscription_id: subscription.paypal_subscription_id,
      paypal_status: subscription.paypal_status,
      next_billing_at: subscription.next_billing_at,
      cancel_at_period_end: subscription.cancel_at_period_end,
      plan: subscription.plan_id ? {
        id: subscription.plan_id,
        name: subscription.plan_name,
        max_listings: subscription.max_listings,
        max_units_per_listing: subscription.max_units_per_listing,
      } : null,
    };

    return [normalized] as T;
  }

  if (resource === 'listings') {
    const listingId = getEq(query, 'id');
    if (method === 'GET') {
      if (listingId) return djangoGet<T>(`/api/listings/${encodeURIComponent(listingId)}/`);
      const params = new URLSearchParams();
      const userId = getEq(query, 'user_id');
      if (userId) params.set('user_id', userId);
      const limit = query.get('limit');
      const offset = query.get('offset');
      if (limit) params.set('limit', limit);
      if (offset) params.set('offset', offset);
      const response = await djangoGet<{ results?: T }>(`/api/listings/${params.toString() ? `?${params}` : ''}`);
      return (Array.isArray(response?.results) ? response.results : []) as T;
    }
    if (listingId && method === 'PATCH') return djangoPatch<T>(`/api/listings/${encodeURIComponent(listingId)}/`, json(init));
  }

  if (resource === 'listing_media') {
    const mediaId = getEq(query, 'id');
    const listingId = getEq(query, 'listing_id');
    if (method === 'GET') {
      return djangoGet<T>(`/api/listings/media/${listingId ? `?listing_id=${encodeURIComponent(listingId)}` : ''}`);
    }
    if (mediaId && method === 'PATCH') return djangoPatch<T>(`/api/listings/media/${encodeURIComponent(mediaId)}/`, json(init));
    if (mediaId && method === 'DELETE') return djangoDelete<T>(`/api/listings/media/${encodeURIComponent(mediaId)}/`);
    if (method === 'POST') return djangoPost<T>('/api/listings/media/', json(init));
  }

  if (resource === 'movers') {
    const moverId = getEq(query, 'id');
    if (method === 'GET') return djangoGet<T>(moverId ? `/api/core/movers/${encodeURIComponent(moverId)}/` : '/api/core/movers/');
    if (moverId && method === 'PATCH') return djangoPatch<T>(`/api/accounts/admin/movers/${encodeURIComponent(moverId)}/`, json(init));
  }

  if (resource === 'reviews' && method === 'GET') {
    const params = new URLSearchParams();
    for (const [key, value] of query.entries()) {
      if (key === 'select' || key === 'order' || key === 'limit') continue;
      if (value.startsWith('eq.')) params.set(key, decodeURIComponent(value.slice(3)));
    }
    const response = await djangoGet<T | { items?: T }>(`/api/core/reviews/${params.toString() ? `?${params}` : ''}`);
    return response as T;
  }

  if (resource === 'bookings' && method === 'GET') {
    const response = await djangoGet<T>('/api/core/bookings/');
    if (!Array.isArray(response)) return response;
    const renterId = getEq(query, 'renter_id');
    const moverId = getEq(query, 'mover_id');
    const filtered = (response as Array<Record<string, unknown>>).filter((row) =>
      (!renterId || String(row.renter_id) === renterId) &&
      (!moverId || String(row.mover_id) === moverId)
    );
    return filtered as T;
  }

  if (resource === 'mover_schedule_events' && method === 'GET') {
    const response = await djangoGet<T>('/api/core/mover-schedule-events/');
    if (!Array.isArray(response)) return response;
    const moverId = getEq(query, 'mover_id');
    return (response as Array<Record<string, unknown>>).filter((row) => !moverId || String(row.mover_id) === moverId) as T;
  }

  if (resource === 'chat_messages' && method === 'GET') {
    const conversationId = getEq(query, 'conversation_id');
    const response = await djangoGet<{ messages: T }>(`/api/core/chat/?conversation_id=${encodeURIComponent(conversationId || '')}`);
    return response.messages;
  }

  if (resource === 'mover_applications') {
    const applicationId = getEq(query, 'id');
    const applicantId = getEq(query, 'applicant_id');
    if (method === 'GET') {
      const dashboard = await getAdminDashboard();
      if (applicationId) {
        return dashboard.items
          .map((item) => item.moverApplication)
          .filter((application) => application && String(application.id) === applicationId) as T;
      }
      if (applicantId) {
        const item = dashboard.items.find((candidate) => String(candidate.id) === applicantId);
        return (item?.moverApplication ? [item.moverApplication] : []) as T;
      }
      return dashboard.items.map((item) => item.moverApplication).filter(Boolean) as T;
    }
    if (method === 'PATCH' && applicationId) {
      const dashboard = await getAdminDashboard();
      const item = dashboard.items.find((candidate) => String(candidate.moverApplication?.id) === applicationId);
      if (!item) throw new Error('Mover application was not found.');
      const body = JSON.parse(String(init.body || '{}')) as Record<string, unknown>;
      return djangoPatch<T>(`/api/accounts/admin/users/${encodeURIComponent(String(item.id))}/application-status/`, {
        application_type: 'mover',
        status: String(body.status || 'pending'),
        admin_review_note: body.review_notes ?? '',
      });
    }
  }

  throw new Error(`No Django mapping exists for legacy endpoint: ${path}`);
};

export const protectedApi = requestLegacy;

export const protectedGet = <T = unknown>(path: string, init: RequestInit = {}) =>
  requestLegacy<T>(path, { ...init, method: 'GET' });

export const protectedPost = <T = unknown>(path: string, body: unknown, init: RequestInit = {}) =>
  requestLegacy<T>(path, { ...init, method: 'POST', body: JSON.stringify(body) });

export const protectedPatch = <T = unknown>(path: string, body: unknown, init: RequestInit = {}) =>
  requestLegacy<T>(path, { ...init, method: 'PATCH', body: JSON.stringify(body) });

export const protectedPut = <T = unknown>(path: string, body: unknown, init: RequestInit = {}) =>
  requestLegacy<T>(path, { ...init, method: 'PUT', body: JSON.stringify(body) });

export const protectedDelete = <T = unknown>(path: string, init: RequestInit = {}) =>
  requestLegacy<T>(path, { ...init, method: 'DELETE' });

export const protectedUpload = djangoUpload;

export const protectedFunctionPost = async <T = unknown>(functionPath: string, body: unknown): Promise<T> => {
  if (functionPath === '/send-notification-emails') {
    return djangoPost<T>('/api/accounts/admin/application-notifications/', body);
  }
  throw new Error(`No Django endpoint exists for legacy function: ${functionPath}`);
};
