import { protectedGet, protectedPost } from '@/lib/djangoApi';
import type { RealEstateListingSummary as RealEstateListingSummaryPMS } from '@/lib/RealEstateTs/Realestatepmsaccess';

export interface RealEstatePMSAccess {
  allowed: boolean;
  reason: string;
  read_only: boolean;
  role?: 'landlord' | 'real_estate';
  subscription_id?: string;
  subscription_status?: 'ACTIVE' | 'GRACE_PERIOD';
}

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

export type RealEstateListingSummary = RealEstateListingSummaryPMS;

interface DashboardResponse {
  pms_access?: RealEstatePMSAccess;
  subscription?: {
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
  } | null;
  entitlement?: {
    can_start_listing?: boolean;
    can_create?: boolean;
    requires_subscription?: boolean;
    requires_individual_payment?: boolean;
    free_listings_remaining?: number;
    free_limit?: number;
    individual_listing_price_kes?: number;
  };
  listings?: Array<{
    id: string;
    user_id: string;
    title: string;
    description?: string | null;
    city: string;
    county: string;
    price_kes: number | string | null;
    listing_type: string;
    approval_status: string;
    is_approved: boolean | null;
    is_published: boolean | null;
    is_paid: boolean | null;
    pms_managed?: boolean;
    created_at: string;
    media?: Array<{ url?: string | null }>;
  }>;
}

function mapListing(listing: NonNullable<DashboardResponse['listings']>[number]): RealEstateListingSummary {
  return {
    id: listing.id,
    user_id: listing.user_id,
    title: listing.title,
    description: listing.description ?? null,
    city: listing.city,
    county: listing.county,
    price_kes: listing.price_kes === null ? null : Number(listing.price_kes),
    listing_type: listing.listing_type,
    approval_status: listing.approval_status,
    is_approved: Boolean(listing.is_approved),
    is_published: Boolean(listing.is_published),
    is_paid: Boolean(listing.is_paid),
    pms_managed: Boolean(listing.pms_managed),
    created_at: listing.created_at,
    cover_photo_url: listing.media?.[0]?.url ?? null,
    media: listing.media ?? [],
  };
}

function mapSubscription(row: DashboardResponse['subscription']): RealEstateSubscription | null {
  if (!row?.subscription_id) return null;
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

function mapEntitlement(raw: NonNullable<DashboardResponse['entitlement']>): RealEstateListingEntitlement {
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

export async function getRealEstatePMSAccess(): Promise<RealEstatePMSAccess> {
  const response = await protectedGet<{ pms_access?: RealEstatePMSAccess }>('/api/pms/entitlement/');
  return response.pms_access ?? {
    allowed: false,
    reason: 'PMS_ACCESS_UNAVAILABLE',
    read_only: false,
  };
}

export async function getCurrentRealEstateSubscription(): Promise<RealEstateSubscription | null> {
  const row = await protectedGet<DashboardResponse['subscription']>('/api/subscriptions/me/');
  return mapSubscription(row);
}

export async function getRealEstateListingEntitlement(_userId: string): Promise<RealEstateListingEntitlement> {
  const raw = await protectedGet<NonNullable<DashboardResponse['entitlement']>>('/api/listings/entitlement/');
  return mapEntitlement(raw);
}

export async function getMyRealEstateListings(userId?: string): Promise<RealEstateListingSummary[]> {
  const data = await protectedGet<DashboardResponse>('/api/pms/real-estate/dashboard/');
  return (data.listings ?? [])
    .filter((listing) => !userId || listing.user_id === userId)
    .map(mapListing);
}

export async function manageRealEstatePMSListing(action: 'add_listing' | 'remove_listing', listingId: string) {
  return protectedPost<{ success: boolean; subscription_listing_id?: string; already_managed?: boolean }>('/api/pms/real-estate/action/', {
    action,
    listing_id: listingId,
  });
}

export interface RealEstateDashboardData {
  subscription: RealEstateSubscription | null;
  entitlement: RealEstateListingEntitlement;
  listings: RealEstateListingSummary[];
}

export async function loadRealEstateDashboardData(_userId: string): Promise<RealEstateDashboardData> {
  const data = await protectedGet<DashboardResponse>('/api/pms/real-estate/dashboard/');

  return {
    subscription: mapSubscription(data.subscription),
    entitlement: mapEntitlement(data.entitlement ?? {}),
    listings: (data.listings ?? []).map(mapListing),
  };
}