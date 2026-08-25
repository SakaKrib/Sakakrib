// ============================================================
// REAL ESTATE PMS ACCESS
//
// Real-estate-specific subscription access and listing contracts.
//
// Source of truth:
//   Supabase project: zrhvapntshgmhynqtbma
//
// The subscription RPC:
//   get_current_real_estate_subscription()
//
// Only returns a subscription when:
//   ACTIVE       && current_period_end > now()
//   OR
//   GRACE_PERIOD && grace_period_end > now()
//
// Therefore:
//   Boolean(subscription) === PMS access
//
// Do NOT add a second client-side expiry calculation here.
// ============================================================

/* ============================================================
 * SUBSCRIPTION
 * ============================================================ */

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

/* ============================================================
 * LISTING SUMMARY
 *
 * This is the shared listing contract used by:
 *
 *   Realestatepmsaccess.ts
 *   Realestateservice.ts
 *   RealEstatePMS.tsx
 *   RealEstateListings.tsx
 *
 * Keep this interface aligned with the actual Supabase
 * dashboard/listing RPC response.
 * ============================================================ */

export interface RealEstateListingSummary {
  /* ----------------------------------------------------------
   * Identity
   * ---------------------------------------------------------- */

  id: string;

  user_id: string;

  /* ----------------------------------------------------------
   * Basic listing information
   * ---------------------------------------------------------- */

  title: string;

  description: string | null;

  listing_type: 'rent' | 'sale' | string | null;

  /* ----------------------------------------------------------
   * Location
   * ---------------------------------------------------------- */

  city: string | null;

  county: string | null;

  /* ----------------------------------------------------------
   * Pricing
   * ---------------------------------------------------------- */

  price_kes: number | null;

  /* ----------------------------------------------------------
   * Property details
   *
   * Optional because the dashboard summary may intentionally
   * return only lightweight listing information.
   * ---------------------------------------------------------- */

  size?: string | null;

  beds?: number | null;

  bathrooms?: number | null;

  parking_spaces?: number | null;

  /* ----------------------------------------------------------
   * Media
   * ---------------------------------------------------------- */

  cover_photo_url: string | null;

  /* ----------------------------------------------------------
   * Approval / moderation
   * ---------------------------------------------------------- */

  is_approved: boolean;

  approval_status: string | null;

  /* ----------------------------------------------------------
   * Publishing
   * ---------------------------------------------------------- */

  is_published: boolean;

  /* ----------------------------------------------------------
   * Listing payment
   * ---------------------------------------------------------- */

  is_paid: boolean;

  payment_verified?: boolean | null;

  payment_status?: string | null;

  /* ----------------------------------------------------------
   * Optional timestamps
   * ---------------------------------------------------------- */

  created_at?: string | null;

  updated_at?: string | null;

  /* ----------------------------------------------------------
   * Forward compatibility
   *
   * Supabase RPCs/views may expose additional listing fields.
   * The known fields above remain strongly typed while allowing
   * the service to retain extra backend fields.
   * ---------------------------------------------------------- */

  [key: string]: unknown;
}

/* ============================================================
 * ACCESS
 * ============================================================ */

export function hasRealEstatePMSAccess(
  subscription?: RealEstatePMSSubscription | null,
): boolean {
  /*
   * The RPC only returns a row when access is currently valid.
   *
   * Therefore the presence of the subscription is sufficient.
   */
  return Boolean(subscription);
}

/* ============================================================
 * ACCESS REASON
 * ============================================================ */

export function getRealEstatePMSAccessReason(
  subscription?: RealEstatePMSSubscription | null,
): string {
  if (!subscription) {
    return 'A property management subscription is required to access this feature.';
  }

  if (
    subscription.subscription_status ===
    'GRACE_PERIOD'
  ) {
    if (subscription.grace_period_end) {
      const graceEnd = new Date(
        subscription.grace_period_end,
      );

      if (!Number.isNaN(graceEnd.getTime())) {
        return `Your subscription is in its grace period. Renew before ${new Intl.DateTimeFormat(
          'en-KE',
          {
            dateStyle: 'medium',
          },
        ).format(
          graceEnd,
        )} to keep property management access.`;
      }
    }

    return 'Your subscription is in its grace period. Renew soon to keep property management access.';
  }

  return 'Your subscription is active.';
}

/* ============================================================
 * STATUS HELPERS
 * ============================================================ */

export function isRealEstateSubscriptionActive(
  subscription?: RealEstatePMSSubscription | null,
): boolean {
  return (
    subscription?.subscription_status ===
    'ACTIVE'
  );
}

export function isRealEstateSubscriptionInGracePeriod(
  subscription?: RealEstatePMSSubscription | null,
): boolean {
  return (
    subscription?.subscription_status ===
    'GRACE_PERIOD'
  );
}

/* ============================================================
 * LISTING ENTITLEMENT
 *
 * This contract is intentionally separate from the subscription
 * contract because real-estate listings can also be governed by
 * individual listing payment entitlement.
 * ============================================================ */

export interface RealEstateListingEntitlement {
  canCreate: boolean;

  freeListingsRemaining: number;

  freeLimit: number;

  requiresIndividualPayment: boolean;

  individualListingPriceKes: number;

  requiresSubscription: boolean;
}

/* ============================================================
 * DASHBOARD DATA
 *
 * Shared contract for loadRealEstateDashboardData().
 * ============================================================ */

export interface RealEstateDashboardData {
  subscription: RealEstatePMSSubscription | null;

  entitlement: RealEstateListingEntitlement;

  listings: RealEstateListingSummary[];
};
