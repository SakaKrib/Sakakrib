import { protectedGet } from '@/lib/djangoApi';

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

interface SubscriptionResponse {
  subscription_id?: string | null;
  plan_id?: string | null;
  plan_name?: string | null;
  subscription_status?: string | null;
  billing_cycle?: 'MONTHLY' | 'ANNUAL' | null;
  max_listings?: number | null;
  max_units_per_listing?: number | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  grace_period_end?: string | null;
}

interface EntitlementResponse {
  can_start_listing?: boolean;
  can_create?: boolean;
  requires_subscription?: boolean;
  requires_individual_payment?: boolean;
  free_listings_remaining?: number;
  free_limit?: number;
  individual_listing_price_kes?: number;
}

interface ListingRow {
  id: string;
  user_id: string;
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

export async function getCurrentRealEstateSubscription(): Promise<RealEstateSubscription | null> {
  const row = await protectedGet<SubscriptionResponse>('/api/subscriptions/me/');
  if (!row.subscription_id) return null;
  return {
    subscription_id: String(row.subscription_id),
    plan_id: String(row.plan_id ?? ''),
    plan_name: String(row.plan_name ?? ''),
    subscription_status: String(row.subscription_status ?? ''),
    billing_cycle: (row.billing_cycle ?? 'MONTHLY') as 'MONTHLY' | 'ANNUAL',
    max_listings: row.max_listings == null ? null : Number(row.max_listings),
    max_units_per_listing: row.max_units_per_listing == null ? null : Number(row.max_units_per_listing),
    current_period_start: String(row.current_period_start ?? ''),
    current_period_end: String(row.current_period_end ?? ''),
    grace_period_end: row.grace_period_end ? String(row.grace_period_end) : null,
  };
}

export async function getRealEstateListingEntitlement(_userId: string): Promise<RealEstateListingEntitlement> {
  const raw = await protectedGet<EntitlementResponse>('/api/listings/entitlement/');
  return {
    canStartListing: Boolean(raw.can_start_listing),
    canCreate: Boolean(raw.can_create),
    requiresSubscription: Boolean(raw.requires_subscription),
    requiresIndividualPayment: Boolean(raw.requires_individual_payment),
    freeListingsRemaining: Number(raw.free_listings_remaining ?? 0),
    freeLimit: Number(raw.free_limit ?? 0),
    individualListingPriceKes: Number(raw.individual_listing_price_kes ?? 1000),
  };
}

export async function getMyRealEstateListings(userId?: string): Promise<RealEstateListingSummary[]> {
  const data = await protectedGet<{ results?: ListingRow[] }>('/api/listings/?limit=100&offset=0');
  const listings = (data.results ?? []).filter((listing) => !userId || listing.user_id === userId);
  return listings.map((listing) => ({
    id: listing.id,
    title: listing.title,
    city: listing.city,
    county: listing.county,
    price_kes: listing.price_kes === null ? null : Number(listing.price_kes),
    listing_type: listing.listing_type,
    approval_status: listing.approval_status,
    is_approved: Boolean(listing.is_approved),
    is_published: Boolean(listing.is_published),
    is_paid: Boolean(listing.is_paid),
    created_at: listing.created_at,
    cover_photo_url: null,
  }));
}

export interface RealEstateDashboardData {
  subscription: RealEstateSubscription | null;
  entitlement: RealEstateListingEntitlement;
  listings: RealEstateListingSummary[];
}

export async function loadRealEstateDashboardData(userId: string): Promise<RealEstateDashboardData> {
  const [subscription, entitlement, listings] = await Promise.all([
    getCurrentRealEstateSubscription(),
    getRealEstateListingEntitlement(userId),
    getMyRealEstateListings(userId),
  ]);
  return { subscription, entitlement, listings };
}
