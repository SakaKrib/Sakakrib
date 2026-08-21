import { supabase } from '@/lib/supabase';

// ============================================================
// TYPES
// ============================================================

export type ListingRole = 'landlord' | 'real_estate';

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'none';

export interface ListingEntitlement {
  role: ListingRole;

  canStartListing: boolean;
  canCreate: boolean;

  requiresSubscription: boolean;
  requiresIndividualPayment: boolean;

  freeLimit: number;
  freeListingsUsed: number;
  freeListingsRemaining: number;

  subscriptionId: string | null;
  subscriptionPlan: string | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionLimit: number | null;
  subscriptionListingsUsed: number;
  subscriptionListingsRemaining: number | null;

  individualPaidListings: number;
  individualListingPriceKes: number;

  // Only ever true for landlords with an active subscription. Real Estate
  // accounts can never create PMS listings, matching the DB-side rule in
  // create_role_aware_listing / create_listing_payment_intent.
  pmsAccess: boolean;

  upgradeAvailable: boolean;
  upgradeTarget: string | null;
}

// ============================================================
// NORMALIZATION
// ============================================================

function normalizeSubscriptionStatus(raw: unknown): SubscriptionStatus {
  const value = typeof raw === 'string' ? raw.toLowerCase() : '';

  if (value === 'active') return 'active';
  if (value === 'trial') return 'trial';
  if (value === 'expired') return 'expired';

  return 'none';
}

function normalizeNullableNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  const value = Number(raw);

  return Number.isFinite(value) ? value : null;
}

// ============================================================
// ENTITLEMENT
//
// IMPORTANT:
//
// This is UI information only. It MUST NOT be treated as
// authorization. create_role_aware_listing / create_listing_payment_intent
// remain the authoritative server-side checks.
// ============================================================

export async function fetchListingEntitlement(
  role: ListingRole,
  userId: string
): Promise<ListingEntitlement> {
  const rpcName =
    role === 'landlord'
      ? 'get_landlord_listing_entitlement'
      : 'get_real_estate_listing_entitlement';

  const rpcParams =
    role === 'landlord'
      ? { p_landlord_id: userId }
      : { p_real_estate_id: userId };

  const { data, error } = await supabase.rpc(rpcName, rpcParams);

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Entitlement check returned no data.');
  }

  const raw = Array.isArray(data) ? data[0] : data;

  if (!raw) {
    throw new Error('Unable to determine listing entitlement.');
  }

  if (role === 'landlord' && raw.authorized_landlord === false) {
    throw new Error(
      raw.reason === 'REAL_ESTATE_USES_SEPARATE_ENTITLEMENTS'
        ? 'This account must use the real estate listing flow.'
        : 'This account is not authorized for landlord listings.'
    );
  }

  if (role === 'real_estate' && raw.authorized_real_estate === false) {
    throw new Error('This account is not authorized for real estate listings.');
  }

  return {
    role,

    canStartListing: Boolean(raw.can_start_listing),
    canCreate: Boolean(raw.can_create),

    requiresSubscription: Boolean(raw.requires_subscription),
    requiresIndividualPayment: Boolean(raw.requires_individual_payment),

    freeLimit: Number(raw.free_limit ?? 0),
    freeListingsUsed: Number(raw.free_listings_used ?? 0),
    freeListingsRemaining: Number(raw.free_listings_remaining ?? 0),

    subscriptionId: raw.subscription_id ?? null,
    subscriptionPlan: raw.subscription_plan ?? null,
    subscriptionStatus: normalizeSubscriptionStatus(raw.subscription_status),
    subscriptionLimit: normalizeNullableNumber(raw.subscription_limit),
    subscriptionListingsUsed: Number(raw.subscription_listings_used ?? 0),
    subscriptionListingsRemaining: normalizeNullableNumber(
      raw.subscription_listings_remaining
    ),

    individualPaidListings: Number(raw.individual_paid_listings ?? 0),
    individualListingPriceKes: Number(raw.individual_listing_price_kes ?? 1000),

    // get_real_estate_listing_entitlement never returns pms_access — Real
    // Estate accounts cannot create PMS listings, so this is correctly
    // false for that role.
    pmsAccess: Boolean(raw.pms_access),

    upgradeAvailable: Boolean(raw.upgrade_available),
    upgradeTarget: raw.upgrade_target ?? null,
  };
}

// ============================================================
// LISTING PAYLOAD
//
// Shared between create_role_aware_listing (RPC params, p_-prefixed)
// and create_listing_payment_intent (jsonb, unprefixed keys read by
// process_listing_payment). Keep these two shapes in sync — see
// toIntentListingData() below, which derives one from the other.
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
  social_links?: { platform: string; url: string }[];
  booking_enabled?: boolean;
  payment_enabled?: boolean;
  is_property_management?: boolean;
}

export interface RoleAwareListingResult {
  success: boolean;
  listing_created: boolean;

  listing_id?: string;
  listing_entitlement?: 'FREE' | 'SUBSCRIPTION';
  is_paid?: boolean;
  is_published?: boolean;
  approval_status?: string;
  subscription_id?: string | null;

  // Returned instead, unauthorized, when payment is required. The listing
  // is intentionally NOT created in this case.
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

/**
 * Authoritative listing creation for FREE / SUBSCRIPTION entitlement.
 *
 * If neither entitlement is available, this does NOT create a listing —
 * it returns { listing_created: false, requires_individual_payment: true, ... }
 * so the caller can fall through to createListingPaymentIntent().
 */
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

  const { data, error } = await supabase.rpc(
    'create_role_aware_listing',
    rpcPayload
  );

  if (error) {
    throw new Error(error.message || 'The database rejected the listing.');
  }

  if (!data) {
    throw new Error(
      'The listing function completed but did not return listing information.'
    );
  }

  return (Array.isArray(data) ? data[0] : data) as RoleAwareListingResult;
}

/**
 * Creates a server-controlled KES 1,000 payment intent for a listing.
 *
 * The listing itself is NOT created here. It is created by
 * process_listing_payment (service-role only, invoked from the
 * listing-payment-stk webhook / equivalent) once payment is verified,
 * using the listing_data payload stored on the intent.
 */
export async function createListingPaymentIntent(
  payload: ListingFormPayload
): Promise<{ paymentIntentId: string; amountKes: number }> {
  const { data, error } = await supabase.rpc('create_listing_payment_intent', {
    p_listing_data: payload,
  });

  if (error) {
    throw new Error(error.message || 'Unable to start the listing payment.');
  }

  const raw = Array.isArray(data) ? data[0] : data;

  if (!raw?.payment_intent_id) {
    throw new Error('The payment service did not return a payment intent.');
  }

  return {
    paymentIntentId: String(raw.payment_intent_id),
    amountKes: Number(raw.amount_kes ?? 1000),
  };
}

export type ListingPaymentIntentStatus =
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

/**
 * Polls the payment intent (not listing_payments — no listing_payments
 * row exists yet under this flow) until it resolves.
 *
 * Once PAID, the listing has already been created server-side by
 * process_listing_payment. This function does not return the listing_id
 * (listing_payment_intents has no such column) — the caller should look
 * up the user's most recently created listing after this resolves true.
 */
export async function waitForListingPaymentIntent(
  paymentIntentId: string,
  { maxAttempts = 30, intervalMs = 3000 }: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase
        .from('listing_payment_intents')
        .select('status')
        .eq('id', paymentIntentId)
        .single();

      if (error) {
        console.error('Payment intent status check failed:', error);
      }

      const status = data?.status as ListingPaymentIntentStatus | undefined;

      if (status === 'PAID') {
        return true;
      }

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

/**
 * Best-effort lookup of the listing created by a just-confirmed payment
 * intent. listing_payment_intents does not store the resulting listing_id,
 * so this correlates by ownership + recency instead.
 *
 * NOTE: this is not fully race-proof if a user has two listing payment
 * flows in flight at once (not currently possible — create_listing_payment_intent
 * cancels any prior PENDING intent for the user first). Consider adding a
 * listing_id column to listing_payment_intents, set by process_listing_payment,
 * as a small follow-up migration to make this exact instead of best-effort.
 */
export async function findRecentlyPaidListing(
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('listings')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Unable to look up the created listing:', error);
    return null;
  }

  return data?.id ?? null;
}