import {
  protectedGet,
  protectedPost,
} from '@/lib/protectedApi';

// ============================================================
// TYPES
// ============================================================
//
// This service uses the application's HttpOnly-cookie transport
// exclusively. It does NOT use the browser Supabase Auth session.
// protectedApi forwards the authenticated cookie context through
// the protected-api Edge Function to PostgREST/RPC.
// ============================================================

export interface RealEstateSubscription {
  subscription_id: string;
  plan_id: string;
  plan_name: string;
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

interface RealEstateSubscriptionRow {
  subscription_id: string;
  plan_id: string;
  plan_name: string;
  subscription_status: string;
  billing_cycle: 'MONTHLY' | 'ANNUAL';
  max_listings: number | null;
  max_units_per_listing: number | null;
  current_period_start: string;
  current_period_end: string;
  grace_period_end: string | null;
}

interface RealEstateListingEntitlementRow {
  can_start_listing: boolean | null;
  can_create: boolean | null;
  requires_subscription: boolean | null;
  requires_individual_payment: boolean | null;
  free_listings_remaining: number | null;
  free_limit: number | null;
  individual_listing_price_kes: number | null;
}

interface RealEstateListingRow {
  id: string;
  title: string;
  city: string;
  county: string;
  price_kes: number | string | null;
  listing_type: string;
  approval_status: string;
  is_approved: boolean | null;
  is_published: boolean | null;
  is_paid: boolean | null;
  created_at: string;
}

interface ListingMediaRow {
  listing_id: string;
  url: string;
  position: number | null;
}

type RpcResult<T> = T | T[] | null;

function firstRpcRow<T>(data: RpcResult<T>): T | null {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return data;
}

// ============================================================
// SUBSCRIPTION
// ============================================================

export async function getCurrentRealEstateSubscription(): Promise<
  RealEstateSubscription | null
> {
  try {
    const data = await protectedPost<
      RpcResult<RealEstateSubscriptionRow>
    >('/rest/v1/rpc/get_current_real_estate_subscription', {});

    const row = firstRpcRow(data);
    return row ? { ...row } : null;
  } catch (error) {
    console.error(
      'Failed to load real estate subscription:',
      error
    );

    throw new Error(
      error instanceof Error
        ? error.message
        : 'Unable to load subscription.'
    );
  }
}

// ============================================================
// LISTING ENTITLEMENT
// ============================================================

export async function getRealEstateListingEntitlement(
  userId: string
): Promise<RealEstateListingEntitlement> {
  const data = await protectedPost<
    RpcResult<RealEstateListingEntitlementRow>
  >(
    '/rest/v1/rpc/get_real_estate_listing_entitlement',
    { p_real_estate_id: userId }
  );

  const raw = firstRpcRow(data);

  if (!raw) {
    throw new Error('Unable to determine listing entitlement.');
  }

  return {
    canStartListing: Boolean(raw.can_start_listing),
    canCreate: Boolean(raw.can_create),
    requiresSubscription: Boolean(raw.requires_subscription),
    requiresIndividualPayment: Boolean(
      raw.requires_individual_payment
    ),
    freeListingsRemaining: Number(
      raw.free_listings_remaining ?? 0
    ),
    freeLimit: Number(raw.free_limit ?? 0),
    individualListingPriceKes: Number(
      raw.individual_listing_price_kes ?? 1000
    ),
  };
}

// ============================================================
// LISTINGS
// ============================================================
//
// Do not call supabase.auth.getUser() here. The browser has no
// Supabase Auth session in the HttpOnly architecture.
//
// The protected-api Edge Function carries the authenticated user
// context to PostgREST, so RLS scopes the listings query to the
// current user. No client-derived user ID is required for this
// read.
// ============================================================

export async function getMyRealEstateListings(): Promise<
  RealEstateListingSummary[]
> {
  const data = await protectedGet<RealEstateListingRow[]>(
    '/rest/v1/listings?select=id,title,city,county,price_kes,listing_type,approval_status,is_approved,is_published,is_paid,created_at&order=created_at.desc'
  );

  const listings: RealEstateListingRow[] = Array.isArray(data)
    ? data
    : [];

  if (listings.length === 0) {
    return [];
  }

  const listingIds = listings.map(
    (listing: RealEstateListingRow) => listing.id
  );

  const mediaFilter = listingIds
    .map((id) => encodeURIComponent(id))
    .join(',');

  let media: ListingMediaRow[] = [];

  try {
    const mediaData = await protectedGet<ListingMediaRow[]>(
      `/rest/v1/listing_media?select=listing_id,url,position&listing_id=in.(${mediaFilter})&media_type=eq.photo&order=position.asc`
    );

    media = Array.isArray(mediaData) ? mediaData : [];
  } catch (error) {
    console.error('Unable to load listing photos:', error);
  }

  const coverByListing = new Map<string, string>();

  for (const item of media) {
    if (!coverByListing.has(item.listing_id)) {
      coverByListing.set(item.listing_id, item.url);
    }
  }

  return listings.map(
    (listing: RealEstateListingRow): RealEstateListingSummary => ({
      id: listing.id,
      title: listing.title,
      city: listing.city,
      county: listing.county,
      price_kes:
        listing.price_kes === null
          ? null
          : Number(listing.price_kes),
      listing_type: listing.listing_type,
      approval_status: listing.approval_status,
      is_approved: Boolean(listing.is_approved),
      is_published: Boolean(listing.is_published),
      is_paid: Boolean(listing.is_paid),
      created_at: listing.created_at,
      cover_photo_url:
        coverByListing.get(listing.id) ?? null,
    })
  );
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

  return {
    subscription,
    entitlement,
    listings,
  };
}
