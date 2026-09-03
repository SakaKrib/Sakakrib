import { protectedDelete, protectedGet, protectedPatch, protectedPost } from '@/lib/djangoApi';

/**
 * Django-only compatibility boundary retained for legacy imports.
 * No Supabase SDK, URL, key, auth session or Edge Function is used here.
 */
export type UserRole = string;
export type VerificationStatus = string;
export type Profile = any;
export type Listing = any;
export type ListingMedia = any;
export type Review = any;

type ShimError = { message: string };
export interface ShimResult<T = unknown> { data: T | null; error: ShimError | null; }
type Filter = { column: string; value: unknown; operator: 'eq' | 'in' };
const errorResult = <T>(error: unknown): ShimResult<T> => ({ data: null, error: { message: error instanceof Error ? error.message : 'Request failed' } });
const eq = (filters: Filter[], column: string) => { const item = filters.find((f) => f.column === column && f.operator === 'eq'); return item ? String(item.value) : null; };

class DjangoQuery<T = unknown> {
  private filters: Filter[] = [];
  private operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: unknown;
  private singleMode = false;
  constructor(private readonly table: string) {}
  select(_columns = '*') { return this; }
  eq(column: string, value: unknown) { this.filters.push({ column, value, operator: 'eq' }); return this; }
  in(column: string, values: unknown[]) { this.filters.push({ column, value: values, operator: 'in' }); return this; }
  order(_column: string, _options?: { ascending?: boolean }) { return this; }
  limit(_value: number) { return this; }
  single() { this.singleMode = true; return this; }
  maybeSingle() { this.singleMode = true; return this; }
  insert(payload: Record<string, unknown>) { this.operation = 'insert'; this.payload = payload; return this; }
  update(payload: Record<string, unknown>) { this.operation = 'update'; this.payload = payload; return this; }
  delete() { this.operation = 'delete'; return this; }
  private async execute(): Promise<ShimResult<T>> {
    try {
      if (this.table === 'profiles') {
        if (this.operation === 'select') return { data: await protectedGet<T>('/api/accounts/me/'), error: null };
        if (this.operation === 'update') return { data: await protectedPatch<T>('/api/accounts/me/', this.payload), error: null };
      }
      if (this.table === 'listings') {
        const id = eq(this.filters, 'id');
        if (this.operation === 'select') {
          if (id && this.singleMode) return { data: await protectedGet<T>(`/api/listings/${encodeURIComponent(id)}/`), error: null };
          const userId = eq(this.filters, 'user_id');
          const response = await protectedGet<any>(`/api/listings/${userId ? `?user_id=${encodeURIComponent(userId)}` : ''}`);
          return { data: (response?.results ?? response) as T, error: null };
        }
        if (this.operation === 'update' && id) return { data: await protectedPatch<T>(`/api/listings/${encodeURIComponent(id)}/`, this.payload), error: null };
        if (this.operation === 'insert') return { data: await protectedPost<T>('/api/listings/create/', this.payload), error: null };
      }
      if (this.table === 'listing_media') {
        const id = eq(this.filters, 'id');
        const listingId = eq(this.filters, 'listing_id');
        if (this.operation === 'select') return { data: await protectedGet<T>(`/api/listings/media/${listingId ? `?listing_id=${encodeURIComponent(listingId)}` : ''}`), error: null };
        if (this.operation === 'update' && id) return { data: await protectedPatch<T>(`/api/listings/media/${encodeURIComponent(id)}/`, this.payload), error: null };
        if (this.operation === 'delete' && id) return { data: await protectedDelete<T>(`/api/listings/media/${encodeURIComponent(id)}/`), error: null };
      }
      throw new Error(`Unsupported Django data operation: ${this.table}.${this.operation}`);
    } catch (error) { return errorResult<T>(error); }
  }
  then<TResult1 = ShimResult<T>, TResult2 = never>(onfulfilled?: ((value: ShimResult<T>) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { return this.execute().then(onfulfilled, onrejected); }
}

async function rpc<T = unknown>(name: string, params: Record<string, unknown> = {}): Promise<ShimResult<T>> {
  try {
    if (name === 'get_my_profile') return { data: await protectedGet<T>('/api/accounts/me/'), error: null };
    if (name === 'get_my_pms_subscription') return { data: await protectedGet<T>('/api/subscriptions/me/'), error: null };
    if (name === 'get_my_pms_unit_count' || name === 'get_my_pms_listings' || name === 'get_my_available_pms_listings') {
      const dashboard = await protectedGet<any>('/api/core/pms/dashboard/');
      const value = name === 'get_my_pms_unit_count' ? dashboard.capacity?.listings_used ?? 0 : name === 'get_my_pms_listings' ? dashboard.pmsListings ?? [] : dashboard.availableListings ?? [];
      return { data: value as T, error: null };
    }
    if (name === 'get_current_real_estate_subscription' || name === 'get_real_estate_listing_entitlement') {
      const dashboard = await protectedGet<any>('/api/core/pms/real-estate/dashboard/');
      return { data: (name === 'get_current_real_estate_subscription' ? dashboard.subscription : dashboard.entitlement) as T, error: null };
    }
    if (name === 'add_listing_to_pms' || name === 'remove_listing_from_pms') {
      const profile = await protectedGet<any>('/api/accounts/me/');
      const endpoint = profile.role === 'real_estate' ? '/api/core/pms/real-estate/action/' : '/api/core/pms/action/';
      return { data: await protectedPost<T>(endpoint, { action: name === 'add_listing_to_pms' ? 'add_listing' : 'remove_listing', listing_id: params.p_listing_id }), error: null };
    }
    throw new Error(`Unsupported Django RPC migration: ${name}`);
  } catch (error) { return errorResult<T>(error); }
}

export const supabase = {
  from: <T = unknown>(table: string) => new DjangoQuery<T>(table),
  rpc,
  auth: {
    getUser: async () => {
      try { return { data: { user: await protectedGet<any>('/api/accounts/me/') }, error: null }; }
      catch (error) { return { data: { user: null }, error: { message: error instanceof Error ? error.message : 'Unable to load authenticated user.' } }; }
    },
    resetPasswordForEmail: async (email: string, options?: { redirectTo?: string }) => {
      try { await protectedPost('/api/accounts/password-reset/', { email, redirect_to: options?.redirectTo ?? window.location.origin }); return { data: {}, error: null }; }
      catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : 'Could not send the password reset email.' } }; }
    },
  },
};

export default supabase;
