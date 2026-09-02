import { protectedGet, protectedPost } from '@/lib/djangoApi';

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
  pmsAccess: boolean;
  upgradeAvailable: boolean;
  upgradeTarget: string | null;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  audience: 'LANDLORD' | 'REAL_ESTATE';
  monthly_price_kes: number;
  annual_price_kes: number;
  max_listings: number | null;
  max_units_per_listing: number | null;
}

interface RawEntitlement {
  authorized?: boolean;
  authorized_landlord?: boolean;
  authorized_real_estate?: boolean;
  role?: string;
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

function normalizeStatus(raw: unknown): SubscriptionStatus {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'trial') return 'trial';
  if (value === 'active') return 'active';
  if (['pending_payment', 'pending payment', 'pending-payment'].includes(value)) return 'pending_payment';
  if (['grace_period', 'grace period', 'grace-period'].includes(value)) return 'grace_period';
  if (value === 'expired') return 'expired';
  if (['cancelled', 'canceled'].includes(value)) return 'cancelled';
  return 'none';
}

function numberValue(raw: unknown, fallback = 0): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function nullableNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function nullableString(raw: unknown): string | null {
  return raw === null || raw === undefined || raw === '' ? null : String(raw);
}

function normalizeEntitlement(role: ListingRole, raw: RawEntitlement): ListingEntitlement {
  return {
    role,
    canStartListing: Boolean(raw.can_start_listing),
    canCreate: Boolean(raw.can_create),
    requiresSubscription: Boolean(raw.requires_subscription),
    requiresIndividualPayment: Boolean(raw.requires_individual_payment),
    free_limit: numberValue(raw.free_limit),
    free_listings_used: numberValue(raw.free_listings_used),
    free_listings_remaining: numberValue(raw.free_listings_remaining),
    subscriptionId: nullableString(raw.subscription_id),
    subscriptionPlan: nullableString(raw.subscription_plan),
    subscriptionStatus: normalizeStatus(raw.subscription_status),
    subscriptionLimit: nullableNumber(raw.subscription_limit),
    subscriptionListingsUsed: numberValue(raw.subscription_listings_used),
    subscriptionListingsRemaining: nullableNumber(raw.subscription_listings_remaining),
    individualPaidListings: numberValue(raw.individual_paid_listings),
    individualListingPriceKes: numberValue(raw.individual_listing_price_kes),
    // PMS is deliberately derived only from the backend decision. A
    // subscription ID alone is not proof of PMS access because the account
    // may be pending approval, in grace, expired, or otherwise ineligible.
    pmsAccess: Boolean(raw.pms_access),
    upgradeAvailable: Boolean(raw.upgrade_available),
    upgradeTarget: nullableString(raw.upgrade_target),
  };
}

export async function fetchLandlordListingEntitlement(_landlordId?: string): Promise<ListingEntitlement> {
  const raw = await protectedGet<RawEntitlement>('/api/listings/entitlement/');
  if (raw.authorized === false || raw.authorized_landlord === false) {
    throw new Error(raw.reason || 'This account is not authorized for landlord listings.');
  }
  return normalizeEntitlement('landlord', raw);
}

export async function fetchRealEstateListingEntitlement(_realEstateId?: string): Promise<ListingEntitlement> {
  const raw = await protectedGet<RawEntitlement>('/api/listings/entitlement/');
  if (raw.authorized === false || raw.authorized_real_estate === false) {
    throw new Error(raw.reason || 'This account is not authorized for real estate listings.');
  }
  return normalizeEntitlement('real_estate', raw);
}

export async function fetchListingEntitlement(role: ListingRole, userId?: string): Promise<ListingEntitlement> {
  return role === 'landlord'
    ? fetchLandlordListingEntitlement(userId)
    : fetchRealEstateListingEntitlement(userId);
}

export async function fetchSubscriptionPlans(role: ListingRole): Promise<SubscriptionPlan[]> {
  const audience = role === 'landlord' ? 'LANDLORD' : 'REAL_ESTATE';
  const rows = await protectedGet<SubscriptionPlan[]>(`/api/subscriptions/plans/?audience=${audience}`);
  return (rows ?? []).map((row) => ({
    ...row,
    id: String(row.id),
    name: String(row.name),
    audience: row.audience === 'REAL_ESTATE' ? 'REAL_ESTATE' : 'LANDLORD',
    monthly_price_kes: numberValue(row.monthly_price_kes),
    annual_price_kes: numberValue(row.annual_price_kes),
    max_listings: nullableNumber(row.max_listings),
    max_units_per_listing: nullableNumber(row.max_units_per_listing),
  }));
}

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
  listing_entitlement?: 'FREE' | 'SUBSCRIPTION' | 'INDIVIDUAL_PAID';
  payment_required?: boolean;
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

export async function createRoleAwareListing(payload: ListingFormPayload): Promise<RoleAwareListingResult> {
  return protectedPost<RoleAwareListingResult>('/api/listings/', payload);
}

export async function createListingPaymentIntent(payload: ListingFormPayload): Promise<{ paymentIntentId: string; amountKes: number }> {
  const data = await protectedPost<{ payment_intent_id?: string; amount_kes?: unknown }>(
    '/api/listings/payment-intents/',
    payload,
  );
  if (!data?.payment_intent_id) {
    throw new Error('The payment service did not return a payment intent.');
  }
  const amountKes = numberValue(data.amount_kes);
  if (amountKes <= 0) throw new Error('The payment service returned an invalid listing payment amount.');
  return { paymentIntentId: String(data.payment_intent_id), amountKes };
}

export type ListingPaymentIntentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

export async function getListingPaymentIntent(paymentIntentId: string): Promise<{
  id: string;
  status: ListingPaymentIntentStatus;
  listing_id: string | null;
}> {
  if (!paymentIntentId) throw new Error('A payment intent is required.');
  return protectedGet(`/api/listings/payment-intents/${encodeURIComponent(paymentIntentId)}/`);
}

export async function waitForListingPaymentIntent(
  paymentIntentId: string,
  { maxAttempts = 30, intervalMs = 3000 }: { maxAttempts?: number; intervalMs?: number } = {},
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const intent = await getListingPaymentIntent(paymentIntentId);
      if (intent.status === 'PAID') return true;
      if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(intent.status)) return false;
    } catch (error) {
      console.warn('Unable to read listing payment intent status:', error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

export async function getListingIdFromPaymentIntent(paymentIntentId: string): Promise<string | null> {
  try {
    const intent = await getListingPaymentIntent(paymentIntentId);
    return intent.status === 'PAID' ? intent.listing_id : null;
  } catch (error) {
    console.warn('Unable to read listing payment intent:', error);
    return null;
  }
}

/** @deprecated Payment intents are now owner-scoped through Django. Use getListingIdFromPaymentIntent(). */
export async function findRecentlyPaidListing(_userId: string): Promise<string | null> {
  return null;
}
