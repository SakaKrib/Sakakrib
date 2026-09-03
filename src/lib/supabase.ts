import {
  djangoRequest,
  protectedGet,
  protectedPatch,
  protectedPost,
  protectedDelete,
} from '@/lib/djangoApi';

/**
 * Django compatibility boundary.
 *
 * This file intentionally keeps the historical module path so legacy
 * components can be migrated without changing their UI. It contains no
 * Supabase SDK, URL, key, auth session, storage client, or network call.
 * All requests go through Django's HttpOnly-cookie transport.
 */

export type UserRole = 'renter' | 'landlord' | 'mover' | 'real_estate' | 'admin' | string;
export type VerificationStatus = 'unverified' | 'pending_verification' | 'verified' | 'rejected' | string;

export interface Profile extends Record<string, unknown> {
  id: string;
  email?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  is_admin?: boolean;
  role?: UserRole;
  kyc_completed?: boolean;
  verification_status?: VerificationStatus;
  landlord_application_status?: string;
  real_estate_application_status?: string;
  mover_application_status?: string;
  national_id?: string;
  dl_number?: string;
  phone?: string;
  profile_photo_url?: string;
  id_photo_url?: string;
  selfie_url?: string;
  id_document_url?: string;
  id_document_type?: string;
  city?: string;
  county?: string;
  is_agency?: boolean;
  free_listings_used?: number;
  created_at?: string;
  updated_at?: string;
  email_verified?: boolean;
  admin_review_note?: string;
}

export interface Listing extends Record<string, unknown> {
  id: string;
  user_id?: string;
  title?: string;
  description?: string;
  city?: string;
  county?: string;
  price_kes?: number | null;
  listing_type?: string | null;
  deposit_required?: boolean | null;
  deposit_structure?: string | null;
  deposit_amount?: number | null;
  size?: string | null;
  beds?: number | null;
  baths?: number | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  social_links?: Record<string, unknown> | null;
  is_property_management?: boolean;
  property_name?: string | null;
  property_type?: string | null;
  location_search?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  booking_enabled?: boolean;
  payment_enabled?: boolean;
  ai_caption?: string | null;
  ai_caption_generated_at?: string | null;
  created_at?: string;
  updated_at?: string;
  media?: ListingMedia[];
  landlord?: Profile | null;
}

export interface ListingMedia extends Record<string, unknown> {
  id: string;
  listing_id?: string;
  user_id?: string;
  unit_id?: string | null;
  url: string;
  label?: string | null;
  media_type?: 'photo' | 'video' | string;
  position?: number;
  created_at?: string;
}

export interface Review extends Record<string, unknown> {
  id: string;
  rating: number;
  [key: string]: unknown;
}

type ShimError = { message: string };
export interface ShimResult<T = unknown> {
  data: T | null;
  error: ShimError | null;
}

type Filter = { column: string; operator: 'eq' | 'in'; value: unknown };

const encode = (value: unknown) => encodeURIComponent(String(value));

const getEq = (filters: Filter[], column: string): string | null => {
  const filter = filters.find((item) => item.column === column && item.operator === 'eq');
  return filter ? String(filter.value) : null;
};

const getIn = (filters: Filter[], column: string): string[] => {
  const filter = filters.find((item) => item.column === column && item.operator === 'in');
  return filter && Array.isArray(filter.value) ? filter.value.map(String) : [];
};

const errorResult = <T>(error: unknown): ShimResult<T> => ({
  data: null,
  error: { message: error instanceof Error ? error.message : 'Request failed' },
});

class DjangoQueryBuilder<T = unknown> {
  private readonly table: string;
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean }[] = [];
  private limitValue: number | null = null;
  private singleMode: 'none' | 'single' | 'maybeSingle' = 'none';
  private operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: unknown = null;

  constructor(table: string) {
    this.table = table;
  }

  select(_columns = '*') {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, operator: 'eq', value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, operator: 'in', value: values });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  single() {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybeSingle';
    return this;
  }

  insert(payload: Record<string, unknown>) {
    this.operation = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  private async execute(): Promise<ShimResult<T>> {
    try {
      if (this.table === 'profiles') {
        if (this.operation === 'select') {
          return { data: await protectedGet<T>('/api/accounts/me/'), error: null };
        }
        if (this.operation === 'update') {
          return { data: await protectedPatch<T>('/api/accounts/me/', this.payload), error: null };
        }
        throw new Error('Unsupported profiles operation.');
      }

      if (this.table === 'listings') {
        const listingId = getEq(this.filters, 'id');
        if (this.operation === 'select') {
          if (listingId && this.singleMode !== 'none') {
            return { data: await protectedGet<T>(`/api/listings/${encode(listingId)}/`), error: null };
          }
          const params = new URLSearchParams();
          const userId = getEq(this.filters, 'user_id');
          if (userId) params.set('user_id', userId);
          if (this.limitValue !== null) params.set('limit', String(this.limitValue));
          const response = await protectedGet<{ results?: T }>(`/api/listings/${params.toString() ? `?${params}` : ''}`);
          const data = (response as { results?: T })?.results ?? response as unknown as T;
          return { data, error: null };
        }
        if (this.operation === 'update') {
          if (!listingId) throw new Error('A listing id is required for update.');
          return { data: await protectedPatch<T>(`/api/listings/${encode(listingId)}/`, this.payload), error: null };
        }
        if (this.operation === 'insert') {
          return { data: await protectedPost<T>('/api/listings/create/', this.payload), error: null };
        }
        if (this.operation === 'delete') {
          throw new Error('Listing deletion must use the dedicated Django listing workflow.');
        }
      }

      if (this.table === 'listing_media') {
        const mediaId = getEq(this.filters, 'id');
        const listingId = getEq(this.filters, 'listing_id');
        if (this.operation === 'select') {
          if (mediaId && this.singleMode !== 'none') {
            return { data: await protectedGet<T>(`/api/listings/media/${encode(mediaId)}/`), error: null };
          }
          const query = listingId ? `?listing_id=${encode(listingId)}` : '';
          return { data: await protectedGet<T>(`/api/listings/media/${query}`), error: null };
        }
        if (this.operation === 'update') {
          if (!mediaId) throw new Error('A media id is required for update.');
          return { data: await protectedPatch<T>(`/api/listings/media/${encode(mediaId)}/`, this.payload), error: null };
        }
        if (this.operation === 'delete') {
          if (!mediaId) throw new Error('A media id is required for delete.');
          return { data: await protectedDelete<T>(`/api/listings/media/${encode(mediaId)}/`), error: null };
        }
        if (this.operation === 'insert') {
          return { data: await protectedPost<T>('/api/listings/media/', this.payload), error: null };
        }
      }

      if (this.table === 'movers') {
        const moverId = getEq(this.filters, 'id');
        if (this.operation !== 'select') throw new Error('Mover mutation must use the dedicated Django mover workflow.');
        const path = moverId ? `/api/core/movers/${encode(moverId)}/` : '/api/core/movers/';
        const data = await protectedGet<T>(path);
        return { data: moverId && this.singleMode !== 'none' ? data : data, error: null };
      }

      if (this.table === 'reviews') {
        if (this.operation !== 'select') throw new Error('Review mutations must use the dedicated Django review workflow.');
        const params = new URLSearchParams();
        for (const filter of this.filters) {
          if (filter.operator === 'eq') params.set(filter.column, String(filter.value));
        }
        return { data: await protectedGet<T>(`/api/core/reviews/${params.toString() ? `?${params}` : ''}`), error: null };
      }

      if (this.table === 'bookings') {
        if (this.operation !== 'select') throw new Error('Booking mutations must use the dedicated Django booking workflow.');
        const bookingId = getEq(this.filters, 'id');
        const data = await protectedGet<T>(bookingId ? `/api/core/bookings/${encode(bookingId)}/` : '/api/core/bookings/');
        return { data, error: null };
      }

      throw new Error(`Django migration adapter does not support table: ${this.table}`);
    } catch (error) {
      return errorResult<T>(error);
    }
  }

  then<TResult1 = ShimResult<T>, TResult2 = never>(
    onfulfilled?: ((value: ShimResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

const dashboard = async () => protectedGet<Record<string, any>>('/api/core/pms/dashboard/');
const realEstateDashboard = async () => protectedGet<Record<string, any>>('/api/core/pms/real-estate/dashboard/');

async function rpc<T = unknown>(name: string, params: Record<string, unknown> = {}): Promise<ShimResult<T>> {
  try {
    switch (name) {
      case 'get_my_profile':
        return { data: await protectedGet<T>('/api/accounts/me/'), error: null };
      case 'get_my_pms_subscription':
        return { data: await protectedGet<T>('/api/subscriptions/me/'), error: null };
      case 'get_my_pms_unit_count': {
        const data = await dashboard();
        return { data: (data.capacity?.listings_used ?? 0) as T, error: null };
      }
      case 'get_my_pms_listings': {
        const data = await dashboard();
        return { data: (data.pmsListings ?? []) as T, error: null };
      }
      case 'get_my_available_pms_listings': {
        const data = await dashboard();
        return { data: (data.availableListings ?? []) as T, error: null };
      }
      case 'get_current_real_estate_subscription': {
        const data = await realEstateDashboard();
        return { data: (data.subscription ?? null) as T, error: null };
      }
      case 'get_real_estate_listing_entitlement': {
        const data = await realEstateDashboard();
        return { data: (data.entitlement ?? null) as T, error: null };
      }
      case 'add_listing_to_pms': {
        const profile = await protectedGet<Profile>('/api/accounts/me/');
        const path = profile.role === 'real_estate' ? '/api/core/pms/real-estate/action/' : '/api/core/pms/action/';
        const data = await protectedPost<T>(path, { action: 'add_listing', listing_id: params.p_listing_id });
        return { data, error: null };
      }
      case 'remove_listing_from_pms': {
        const profile = await protectedGet<Profile>('/api/accounts/me/');
        const path = profile.role === 'real_estate' ? '/api/core/pms/real-estate/action/' : '/api/core/pms/action/';
        const data = await protectedPost<T>(path, { action: 'remove_listing', listing_id: params.p_listing_id });
        return { data, error: null };
      }
      default:
        throw new Error(`Unsupported Django RPC migration: ${name}`);
    }
  } catch (error) {
    return errorResult<T>(error);
  }
}

export const supabase = {
  from: <T = unknown>(table: string) => new DjangoQueryBuilder<T>(table),
  rpc,
  auth: {
    getUser: async (): Promise<{ data: { user: Profile | null }; error: ShimError | null }> => {
      try {
        const profile = await protectedGet<Profile>('/api/accounts/me/');
        return { data: { user: profile }, error: null };
      } catch (error) {
        return { data: { user: null }, error: { message: error instanceof Error ? error.message : 'Unable to load authenticated user.' } };
      }
    },
  },
};

export default supabase;
