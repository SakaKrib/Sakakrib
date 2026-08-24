import { supabase } from '@/lib/supabase';

// ============================================================
// TYPES
//
// These match the live RPC/table shapes exactly, verified against
// the live database before writing this file:
//
// - get_current_real_estate_subscription(p_real_estate_id) returns
//   a row ONLY when status is ACTIVE (and not past current_period_end)
//   or GRACE_PERIOD (and not past grace_period_end). No row means no
//   usable subscription right now — not necessarily "never subscribed".
// - get_real_estate_listing_entitlement(p_real_estate_id) is the
//   same entitlement RPC already used by listingEntitlement.ts for
//   the listing creation flow — reused here, not duplicated.
// - listings has no landlord_id/location/image_url/bedrooms/bathrooms
//   columns. Real columns: user_id, city, county, beds, baths,
//   approval_status, is_approved, is_published, is_paid.
// - Photos come from listing_media (listing_id, url, media_type,
//   position), not a column on listings itself.
// ============================================================

export interface RealEstateSubscription {
  subscription_id: string;
  plan_id: string;
  plan_name: string;
  // NOTE: this RPC's column is named subscription_status, not status
  // (different from the landlord PMS RPC's `status` field — do not
  // assume the two are interchangeable).
  subscription_status: string;
  billing_cycle: 'MONTHLY' | 'ANNUAL';
  max_listings: number | null;
  max_units_per_listing: number | null;
  current_period_start: string;
  current_period_end: string;
  grace_period_end: string | null;
}

export interface RealEstateListingEntitlement {
  canStartListing: boolean;
  canCreate: boolean;
  requiresSubscription: boolean;
  requiresIndividualPayment: boolean;
  freeListingsRemaining: number;
  freeLimit: number;
  individualListingPriceKes: number;
}

export interface RealEstateListingSummary {
  id: string;
  title: string;
  city: string;
  county: string;
  price_kes: number | null;
  listing_type: string;
  approval_status: string;
  is_approved: boolean;
  is_published: boolean;
  is_paid: boolean;
  created_at: string;
  cover_photo_url: string | null;
}

// ============================================================
// SUBSCRIPTION
// ============================================================

export async function getCurrentRealEstateSubscription(): Promise<
  RealEstateSubscription | null
> {
  const { data, error } = await supabase.rpc(
    'get_current_real_estate_subscription'
  );

  if (error) {
    console.error(
      'Failed to load real estate subscription:',
      error
    );
    throw new Error(
      error.message || 'Unable to load subscription.'
    );
  }

  const row = Array.isArray(data) ? data[0] : data;

  return (row as RealEstateSubscription | undefined) ?? null;
}

// ============================================================
// LISTING ENTITLEMENT
//
// Reuses the same RPC listingEntitlement.ts already calls for the
// listing creation flow (get_real_estate_listing_entitlement) — this
// is intentionally not a new/duplicate entitlement source.
// ============================================================

export async function getRealEstateListingEntitlement(
  userId: string
): Promise<RealEstateListingEntitlement> {
  const { data, error } = await supabase.rpc(
    'get_real_estate_listing_entitlement',
    { p_real_estate_id: userId }
  );

  if (error) {
    throw new Error(
      error.message || 'Unable to load listing entitlement.'
    );
  }

  const raw = Array.isArray(data) ? data[0] : data;

  if (!raw) {
    throw new Error('Unable to determine listing entitlement.');
  }

  return {
    canStartListing: Boolean(raw.can_start_listing),
    canCreate: Boolean(raw.can_create),
    requiresSubscription: Boolean(raw.requires_subscription),
    requiresIndividualPayment: Boolean(raw.requires_individual_payment),
    freeListingsRemaining: Number(raw.free_listings_remaining ?? 0),
    freeLimit: Number(raw.free_limit ?? 0),
    individualListingPriceKes: Number(
      raw.individual_listing_price_kes ?? 1000
    ),
  };
}

// ============================================================
// LISTINGS
//
// Direct table query (RLS-scoped to the caller's own rows via
// user_id = auth.uid() — no service-role bypass, no cross-account
// access). listing_media is joined separately per listing since a
// single query with an embedded relationship risks pulling every
// photo; we only need one cover photo per listing here.
// ============================================================

export async function getMyRealEstateListings(): Promise<
  RealEstateListingSummary[]
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated.');
  }

  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, title, city, county, price_kes, listing_type, approval_status, is_approved, is_published, is_paid, created_at'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Unable to load listings.');
  }

  const listings = data ?? [];

  if (listings.length === 0) {
    return [];
  }

  const listingIds = listings.map((l) => l.id);

  const { data: media, error: mediaError } = await supabase
    .from('listing_media')
    .select('listing_id, url, position')
    .in('listing_id', listingIds)
    .eq('media_type', 'photo')
    .order('position', { ascending: true });

  if (mediaError) {
    console.error(
      'Unable to load listing photos:',
      mediaError
    );
  }

  const coverByListing = new Map<string, string>();

  for (const item of media ?? []) {
    if (!coverByListing.has(item.listing_id)) {
      coverByListing.set(item.listing_id, item.url);
    }
  }

  return listings.map((listing) => ({
    id: listing.id,
    title: listing.title,
    city: listing.city,
    county: listing.county,
    price_kes:
      listing.price_kes === null ? null : Number(listing.price_kes),
    listing_type: listing.listing_type,
    approval_status: listing.approval_status,
    is_approved: Boolean(listing.is_approved),
    is_published: Boolean(listing.is_published),
    is_paid: Boolean(listing.is_paid),
    created_at: listing.created_at,
    cover_photo_url: coverByListing.get(listing.id) ?? null,
  }));
}

// ============================================================
// DASHBOARD AGGREGATE
// ============================================================

export interface RealEstateDashboardData {
  subscription: RealEstateSubscription | null;
  entitlement: RealEstateListingEntitlement;
  listings: RealEstateListingSummary[];
}

export async function loadRealEstateDashboardData(
  userId: string
): Promise<RealEstateDashboardData> {
  const [subscription, entitlement, listings] = await Promise.all([
    getCurrentRealEstateSubscription(),
    getRealEstateListingEntitlement(userId),
    getMyRealEstateListings(),
  ]);

  return { subscription, entitlement, listings };
}