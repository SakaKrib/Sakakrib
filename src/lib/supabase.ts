import {
  protectedDelete,
  protectedGet,
  protectedPatch,
  protectedPost,
} from '@/lib/djangoApi';

/** Django-only compatibility boundary retained temporarily for legacy imports. */
export type UserRole = 'renter' | 'landlord' | 'mover' | 'real_estate' | 'admin' | string;
export type VerificationStatus = 'unverified' | 'pending_verification' | 'verified' | 'rejected' | string;

export interface Profile extends Record<string, unknown> {
  id: string; email?: string; full_name?: string; first_name?: string; last_name?: string;
  middle_name?: string; is_admin?: boolean; role?: UserRole; kyc_completed?: boolean;
  verification_status?: VerificationStatus; landlord_application_status?: string;
  real_estate_application_status?: string; mover_application_status?: string; national_id?: string;
  dl_number?: string; phone?: string; profile_photo_url?: string; id_photo_url?: string;
  selfie_url?: string; id_document_url?: string; id_document_type?: string; city?: string; county?: string;
  is_agency?: boolean; free_listings_used?: number; created_at?: string; updated_at?: string;
  email_verified?: boolean; admin_review_note?: string;
}

export interface Listing extends Record<string, unknown> {
  id: string; user_id?: string; title?: string; description?: string; city?: string; county?: string;
  price_kes?: number | null; listing_type?: string | null; deposit_required?: boolean | null;
  deposit_structure?: string | null; deposit_amount?: number | null; size?: string | null;
  beds?: number | null; baths?: number | null; contact_phone?: string | null; contact_email?: string | null;
  social_links?: Record<string, unknown> | null; is_property_management?: boolean; property_name?: string | null;
  property_type?: string | null; location_search?: string | null; latitude?: number | null; longitude?: number | null;
  booking_enabled?: boolean; payment_enabled?: boolean; ai_caption?: string | null;
  ai_caption_generated_at?: string | null; created_at?: string; updated_at?: string;
  media?: ListingMedia[]; landlord?: Profile | null;
}

export interface ListingMedia extends Record<string, unknown> {
  id: string; listing_id?: string; user_id?: string; unit_id?: string | null; url: string;
  label?: string | null; media_type?: string; position?: number; created_at?: string;
}

export interface Review extends Record<string, unknown> { id: string; rating: number; }

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
          const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
          const response = await protectedGet<{ results?: T } | T>(`/api/listings/${query}`);
          return { data: (Array.isArray(response) || !response || !('results' in (response as object)) ? response : response.results) as T, error: null };
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

  then<TResult1 = ShimResult<T>, TResult2 = never>(onfulfilled?: ((value: ShimResult<T>) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

async function rpc<T = unknown>(name: string, params: Record<string, unknown> = {}): Promise<ShimResult<T>> {
  try {
    if (name === 'get_my_profile') return { data: await protectedGet<T>('/api/accounts/me/'), error: null };
    if (name === 'get_my_pms_subscription') return { data: await protectedGet<T>('/api/subscriptions/me/'), error: null };
    if (name === 'get_my_pms_unit_count' || name === 'get_my_pms_listings' || name === 'get_my_available_pms_listings') {
      const dashboard = await protectedGet<Record<string, any>>('/api/core/pms/dashboard/');
      const value = name === 'get_my_pms_unit_count' ? dashboard.capacity?.listings_used ?? 0 : name === 'get_my_pms_listings' ? dashboard.pmsListings ?? [] : dashboard.availableListings ?? [];
      return { data: value as T, error: null };
    }
    if (name === 'get_current_real_estate_subscription' || name === 'get_real_estate_listing_entitlement') {
      const dashboard = await protectedGet<Record<string, any>>('/api/core/pms/real-estate/dashboard/');
      return { data: (name === 'get_current_real_estate_subscription' ? dashboard.subscription : dashboard.entitlement) as T, error: null };
    }
    if (name === 'add_listing_to_pms' || name === 'remove_listing_from_pms') {
      const profile = await protectedGet<Profile>('/api/accounts/me/');
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
      try { return { data: { user: await protectedGet<Profile>('/api/accounts/me/') }, error: null }; }
      catch (error) { return { data: { user: null }, error: { message: error instanceof Error ? error.message : 'Unable to load authenticated user.' } }; }
    },
    resetPasswordForEmail: async (email: string, options?: { redirectTo?: string }) => {
      try {
        await protectedPost('/api/accounts/password-reset/', { email, redirect_to: options?.redirectTo ?? window.location.origin });
        return { data: {}, error: null };
      } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : 'Could not send the password reset email.' } }; }
    },
  },
};

export default supabase;
