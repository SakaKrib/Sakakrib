import {
  protectedGet,
  protectedPost,
} from '@/lib/protectedApi';

// ============================================================
// TYPES
//
// The application has TWO separate listing entitlement systems.
//
// LANDLORD
//   -> get_landlord_listing_entitlement()
//   -> get_current_landlord_subscription()
//
// REAL ESTATE
//   -> get_real_estate_listing_entitlement()
//   -> get_current_real_estate_subscription()
//
// Do not merge these database entitlement systems.
//
// Field naming: free_limit / free_listings_used /
// free_listings_remaining are kept snake_case here to match the
// shape utils.ts's normalizeListingEntitlement already produces and
// type-checks against - this file and utils.ts share the same
// ListingEntitlement type, so the two must agree.
// ============================================================

export type ListingRole = 'landlord' | 'real_estate';

export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'pending_payment'
  | 'grace_period'
  | 'expired'
  | 'cancelled'
  | 'none';

export interface ListingEntitlement {
  role: ListingRole;

  canStartListing: boolean;
  canCreate: boolean;

  requiresSubscription: boolean;
  requiresIndividualPayment: boolean;

  free_limit: number;
  free_listings_used: number;
  free_listings_remaining: number;

  subscriptionId: string | null;
  subscriptionPlan: string | null;
  subscriptionStatus: SubscriptionStatus;

  subscriptionLimit: number | null;
  subscriptionListingsUsed: number;
  subscriptionListingsRemaining: number | null;

  individualPaidListings: number;
  individualListingPriceKes: number;

  /**
   * PMS access is currently meaningful for landlords.
   * Real-estate entitlement safely returns false.
   */
  pmsAccess: boolean;

  upgradeAvailable: boolean;
  upgradeTarget: string | null;
}

/**
 * Subscription plans are shared by the platform table,
 * but filtered by audience.
 */
export interface SubscriptionPlan {
  id: string;
  name: string;
  audience: 'LANDLORD' | 'REAL_ESTATE';

  monthly_price_kes: number;
  annual_price_kes: number;

  max_listings: number | null;
  max_units_per_listing: number | null;
}

// ============================================================
// RAW DATABASE TYPES
// ============================================================

interface RawEntitlement {
  authorized_landlord?: boolean;
  authorized_real_estate?: boolean;
  reason?: string;

  free_limit?: number | string | null;
  free_listings_used?: number | string | null;
  free_listings_remaining?: number | string | null;

  subscription_id?: string | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;

  subscription_limit?: number | string | null;
  subscription_listings_used?: number | string | null;
  subscription_listings_remaining?: number | string | null;

  individual_paid_listings?: number | string | null;
  individual_listing_price_kes?: number | string | null;

  can_start_listing?: boolean;
  can_create?: boolean;

  requires_subscription?: boolean;
  requires_individual_payment?: boolean;

  pms_access?: boolean;

  upgrade_available?: boolean;
  upgrade_target?: string | null;
}

interface RawSubscriptionPlan {
  id: unknown;
  name: unknown;
  audience: unknown;
  monthly_price_kes: unknown;
  annual_price_kes: unknown;
  max_listings: unknown;
  max_units_per_listing: unknown;
}

// ============================================================
// NORMALIZATION HELPERS
// ============================================================

function normalizeSubscriptionStatus(
  raw: unknown
): SubscriptionStatus {
  const value =
    typeof raw === 'string' ? raw.trim().toLowerCase() : '';

  switch (value) {
    case 'trial':
      return 'trial';
    case 'active':
      return 'active';
    case 'pending_payment':
    case 'pending payment':
    case 'pending-payment':
      return 'pending_payment';
    case 'grace_period':
    case 'grace period':
    case 'grace-period':
      return 'grace_period';
    case 'expired':
      return 'expired';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return 'none';
  }
}

function normalizeNumber(raw: unknown, fallback = 0): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeNullableNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function normalizeNullableString(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  return String(raw);
}

// ============================================================
// NORMALIZE ENTITLEMENT
// ============================================================

function normalizeEntitlement(
  role: ListingRole,
  raw: RawEntitlement
): ListingEntitlement {
  return {
    role,

    canStartListing: Boolean(raw.can_start_listing),
    canCreate: Boolean(raw.can_create),

    requiresSubscription: Boolean(raw.requires_subscription),
    requiresIndividualPayment: Boolean(raw.requires_individual_payment),

    free_limit: normalizeNumber(raw.free_limit),
    free_listings_used: normalizeNumber(raw.free_listings_used),
    free_listings_remaining: normalizeNumber(raw.free_listings_remaining),

    subscriptionId: normalizeNullableString(raw.subscription_id),
    subscriptionPlan: normalizeNullableString(raw.subscription_plan),
    subscriptionStatus: normalizeSubscriptionStatus(raw.subscription_status),

    subscriptionLimit: normalizeNullableNumber(raw.subscription_limit),
    subscriptionListingsUsed: normalizeNumber(raw.subscription_listings_used),
    subscriptionListingsRemaining: normalizeNullableNumber(
      raw.subscription_listings_remaining
    ),

    individualPaidListings: normalizeNumber(raw.individual_paid_listings),
    individualListingPriceKes: normalizeNumber(
      raw.individual_listing_price_kes
    ),

    // PMS access belongs to landlord entitlement - real-estate
    // accounts must not inherit landlord PMS access.
    pmsAccess: role === 'landlord' ? Boolean(raw.pms_access) : false,

    upgradeAvailable: Boolean(raw.upgrade_available),
    upgradeTarget: normalizeNullableString(raw.upgrade_target),
  };
}

// ============================================================
// LANDLORD / REAL ESTATE ENTITLEMENT
//
// Migrated from raw supabase.rpc() to protectedPost() - auth now
// flows through the HttpOnly-cookie-backed protected-api Edge
// Function (see protectedApi.ts), not a client-readable session
// token. Same RPCs, same payload shape, different transport.
// ============================================================

export async function fetchLandlordListingEntitlement(
  landlordId?: string
): Promise<ListingEntitlement> {
  const payload = landlordId ? { p_landlord_id: landlordId } : {};

  const response = await protectedPost<RawEntitlement | RawEntitlement[]>(
    '/rest/v1/rpc/get_landlord_listing_entitlement',
    payload
  );

  const raw = Array.isArray(response) ? response[0] : response;

  if (!raw) {
    throw new Error('The database did not return landlord listing entitlement.');
  }

  if (raw.authorized_landlord === false) {
    throw new Error(
      raw.reason === 'REAL_ESTATE_USES_SEPARATE_ENTITLEMENTS'
        ? 'This account must use the real estate listing flow.'
        : raw.reason || 'This account is not authorized for landlord listings.'
    );
  }

  return normalizeEntitlement('landlord', raw);
}

export async function fetchRealEstateListingEntitlement(
  realEstateId?: string
): Promise<ListingEntitlement> {
  const payload = realEstateId ? { p_real_estate_id: realEstateId } : {};

  const response = await protectedPost<RawEntitlement | RawEntitlement[]>(
    '/rest/v1/rpc/get_real_estate_listing_entitlement',
    payload
  );

  const raw = Array.isArray(response) ? response[0] : response;

  if (!raw) {
    throw new Error('The database did not return real estate listing entitlement.');
  }

  if (raw.authorized_real_estate === false) {
    throw new Error(
      raw.reason || 'This account is not authorized for real estate listings.'
    );
  }

  return normalizeEntitlement('real_estate', raw);
}

/**
 * Fetch the correct entitlement for the account role. Does NOT
 * merge the landlord and real-estate database entitlement systems
 * - only dispatches to the correct RPC.
 */
export async function fetchListingEntitlement(
  role: ListingRole,
  userId?: string
): Promise<ListingEntitlement> {
  if (role === 'landlord') {
    return fetchLandlordListingEntitlement(userId);
  }
  return fetchRealEstateListingEntitlement(userId);
}

// ============================================================
// SUBSCRIPTION PLANS
// ============================================================

export async function fetchSubscriptionPlans(
  role: ListingRole
): Promise<SubscriptionPlan[]> {
  const audience = role === 'landlord' ? 'LANDLORD' : 'REAL_ESTATE';

  const query =
    '/rest/v1/subscription_plans' +
    '?select=id,name,audience,monthly_price_kes,annual_price_kes,max_listings,max_units_per_listing' +
    `&audience=eq.${audience}` +
    '&order=monthly_price_kes.asc';

  const rows = await protectedGet<RawSubscriptionPlan[]>(query);

  return (rows ?? []).map(
    (row): SubscriptionPlan => ({
      id: String(row.id),
      name: String(row.name),
      audience: row.audience === 'REAL_ESTATE' ? 'REAL_ESTATE' : 'LANDLORD',

      monthly_price_kes: normalizeNumber(row.monthly_price_kes),
      annual_price_kes: normalizeNumber(row.annual_price_kes),

      max_listings: normalizeNullableNumber(row.max_listings),
      max_units_per_listing: normalizeNullableNumber(row.max_units_per_listing),
    })
  );
}

// ============================================================
// LISTING PAYLOAD
// ============================================================

export interface ListingFormPayload {
  title: string;
  description: string;
  city: string;
  county: string;

  location_search?: string | null;
  latitude?: number | null;
  longitude?: number | null;

  property_name?: string | null;
  property_type?: string | null;

  price_kes?: number | null;

  listing_type?: string;

  deposit_required?: boolean;
  deposit_structure?: string | null;
  deposit_amount?: number;

  size?: string | null;
  beds?: number;
  baths?: number;

  contact_phone?: string | null;
  contact_email?: string | null;

  social_links?: {
    platform: string;
    url: string;
  }[];

  booking_enabled?: boolean;
  payment_enabled?: boolean;

  is_property_management?: boolean;
}

// ============================================================
// ROLE-AWARE LISTING RESULT
// ============================================================

export interface RoleAwareListingResult {
  success: boolean;
  listing_created: boolean;

  listing_id?: string;

  listing_entitlement?: 'FREE' | 'SUBSCRIPTION';

  is_paid?: boolean;
  is_published?: boolean;
  approval_status?: string;

  subscription_id?: string | null;

  can_start_listing?: boolean;
  can_create?: boolean;

  requires_individual_payment?: boolean;
  requires_subscription?: boolean;

  individual_listing_price_kes?: number;

  subscription_plan?: string | null;
  subscription_status?: string | null;

  subscription_limit?: number | null;

  subscription_listings_used?: number;

  subscription_listings_remaining?: number | null;
}

// ============================================================
// CREATE ROLE-AWARE LISTING
//
// RESTORED - was missing from the last revision of this file.
// Migrated to protectedPost.
// ============================================================

export async function createRoleAwareListing(
  payload: ListingFormPayload
): Promise<RoleAwareListingResult> {
  const rpcPayload = {
    p_title: payload.title,
    p_description: payload.description,
    p_city: payload.city,
    p_county: payload.county,

    p_location_search: payload.location_search ?? null,
    p_latitude: payload.latitude ?? null,
    p_longitude: payload.longitude ?? null,

    p_property_name: payload.property_name ?? null,
    p_property_type: payload.property_type ?? null,

    p_price_kes: payload.price_kes ?? null,

    p_listing_type: payload.listing_type ?? 'rent',

    p_deposit_required: payload.deposit_required ?? false,
    p_deposit_structure: payload.deposit_structure ?? null,
    p_deposit_amount: payload.deposit_amount ?? 0,

    p_size: payload.size ?? null,
    p_beds: payload.beds ?? 0,
    p_baths: payload.baths ?? 0,

    p_contact_phone: payload.contact_phone ?? null,
    p_contact_email: payload.contact_email ?? null,

    p_social_links: payload.social_links ?? [],

    p_booking_enabled: payload.booking_enabled ?? false,
    p_payment_enabled: payload.payment_enabled ?? false,

    p_is_property_management: payload.is_property_management ?? false,
  };

  const data = await protectedPost<
    RoleAwareListingResult | RoleAwareListingResult[]
  >('/rest/v1/rpc/create_role_aware_listing', rpcPayload);

  if (!data) {
    throw new Error(
      'The listing function completed but did not return listing information.'
    );
  }

  return Array.isArray(data) ? data[0] : data;
}

// ============================================================
// LISTING PAYMENT INTENT
//
// RESTORED - was missing from the last revision of this file.
// Migrated to protectedPost/protectedGet.
// ============================================================

export async function createListingPaymentIntent(
  payload: ListingFormPayload
): Promise<{
  paymentIntentId: string;
  amountKes: number;
}> {
  const data = await protectedPost<
    { payment_intent_id?: string; amount_kes?: unknown } |
    { payment_intent_id?: string; amount_kes?: unknown }[]
  >('/rest/v1/rpc/create_listing_payment_intent', {
    p_listing_data: payload,
  });

  const raw = Array.isArray(data) ? data[0] : data;

  if (!raw?.payment_intent_id) {
    throw new Error('The payment service did not return a payment intent.');
  }

  const amountKes = Number(raw.amount_kes);

  if (!Number.isFinite(amountKes) || amountKes <= 0) {
    throw new Error(
      'The payment service returned an invalid listing payment amount.'
    );
  }

  return {
    paymentIntentId: String(raw.payment_intent_id),
    amountKes,
  };
}

// ============================================================
// PAYMENT INTENT STATUS
//
// RESTORED - was missing from the last revision of this file.
// Migrated to protectedGet.
// ============================================================

export type ListingPaymentIntentStatus =
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

export async function waitForListingPaymentIntent(
  paymentIntentId: string,
  {
    maxAttempts = 30,
    intervalMs = 3000,
  }: {
    maxAttempts?: number;
    intervalMs?: number;
  } = {}
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const rows = await protectedGet<{ status: string }[]>(
        `/rest/v1/listing_payment_intents?select=status&id=eq.${paymentIntentId}`
      );

      const status = rows?.[0]?.status as ListingPaymentIntentStatus | undefined;

      if (status === 'PAID') return true;

      if (
        status === 'FAILED' ||
        status === 'CANCELLED' ||
        status === 'EXPIRED'
      ) {
        return false;
      }
    } catch (err) {
      console.error('Error checking listing payment intent:', err);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

// ============================================================
// GET LISTING CREATED FROM PAYMENT
//
// RESTORED - was missing from the last revision of this file.
// ============================================================

export async function getListingIdFromPaymentIntent(
  paymentIntentId: string
): Promise<string | null> {
  try {
    const rows = await protectedGet<
      { status: string; listing_id: string | null }[]
    >(
      `/rest/v1/listing_payment_intents?select=status,listing_id&id=eq.${paymentIntentId}`
    );

    const row = rows?.[0];

    if (row?.status !== 'PAID') return null;

    return row.listing_id ?? null;
  } catch (err) {
    console.error('Unable to read listing payment intent:', err);
    return null;
  }
}

// ============================================================
// RECENTLY PAID LISTING
//
// RESTORED - was missing from the last revision of this file.
// ============================================================

export async function findRecentlyPaidListing(
  userId: string
): Promise<string | null> {
  try {
    const rows = await protectedGet<{ listing_id: string | null }[]>(
      '/rest/v1/listing_payment_intents' +
        '?select=listing_id' +
        `&user_id=eq.${userId}` +
        '&status=eq.PAID' +
        '&listing_id=not.is.null' +
        '&order=paid_at.desc' +
        '&limit=1'
    );

    return rows?.[0]?.listing_id ?? null;
  } catch (err) {
    console.error('Unable to look up the paid listing intent:', err);
    return null;
  }
}