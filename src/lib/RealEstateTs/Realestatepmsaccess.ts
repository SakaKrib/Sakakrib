// ============================================================
// REAL ESTATE PMS ACCESS
//
// Real-estate-specific subscription access and listing contracts.
//
// Django is the application source of truth on the migration branch.
// Supabase remains reference evidence only.
// ============================================================

export type RealEstatePMSSubscriptionStatus =
  | 'ACTIVE'
  | 'GRACE_PERIOD';

export type RealEstatePMSBillingCycle =
  | 'MONTHLY'
  | 'ANNUAL';

export interface RealEstatePMSSubscription {
  subscription_id: string;
  plan_id: string;
  plan_name: string;
  subscription_status: RealEstatePMSSubscriptionStatus;
  billing_cycle: RealEstatePMSBillingCycle;
  max_listings: number | null;
  max_units_per_listing: number | null;
  current_period_start: string;
  current_period_end: string;
  grace_period_end: string | null;
}

export interface RealEstateListingSummary {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  listing_type: 'rent' | 'sale' | string | null;
  city?: string | null;
  county?: string | null;
  price_kes: number | null;
  size?: string | null;
  beds?: number | null;
  bathrooms?: number | null;
  parking_spaces?: number | null;
  cover_photo_url: string | null;
  is_approved: boolean;
  approval_status: string | null;
  is_published: boolean;
  is_paid: boolean;

  /** True when the listing consumes real-estate subscription capacity. */
  pms_managed: boolean;

  payment_verified?: boolean | null;
  payment_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export function hasRealEstatePMSAccess(
  subscription?: RealEstatePMSSubscription | null,
): boolean {
  return Boolean(subscription);
}

export function getRealEstatePMSAccessReason(
  subscription?: RealEstatePMSSubscription | null,
): string {
  if (!subscription) {
    return 'A property management subscription is required to access this feature.';
  }

  if (subscription.subscription_status === 'GRACE_PERIOD') {
    if (subscription.grace_period_end) {
      const graceEnd = new Date(subscription.grace_period_end);
      if (!Number.isNaN(graceEnd.getTime())) {
        return `Your subscription is in its grace period. Renew before ${new Intl.DateTimeFormat(
          'en-KE',
          { dateStyle: 'medium' },
        ).format(graceEnd)} to keep property management access.`;
      }
    }
    return 'Your subscription is in its grace period. Renew soon to keep property management access.';
  }

  return 'Your subscription is active.';
}

export function isRealEstateSubscriptionActive(
  subscription?: RealEstatePMSSubscription | null,
): boolean {
  return subscription?.subscription_status === 'ACTIVE';
}

export function isRealEstateSubscriptionInGracePeriod(
  subscription?: RealEstatePMSSubscription | null,
): boolean {
  return subscription?.subscription_status === 'GRACE_PERIOD';
}

export interface RealEstateListingEntitlement {
  canCreate: boolean;
  freeListingsRemaining: number;
  freeLimit: number;
  requiresIndividualPayment: boolean;
  individualListingPriceKes: number;
  requiresSubscription: boolean;
}

export interface RealEstateDashboardData {
  subscription: RealEstatePMSSubscription | null;
  entitlement: RealEstateListingEntitlement;
  listings: RealEstateListingSummary[];
}
