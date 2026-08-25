export type PMSSubscriptionStatus =
  | 'ACTIVE'
  | 'GRACE_PERIOD'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'PENDING_PAYMENT';

export type PMSPlanName = 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';

// Matches the row shape returned by get_my_pms_subscription() exactly.
// The RPC returns `subscription_id`, not `id` — do not rename this back.
export interface PMSSubscription {
  subscription_id: string;
  plan_id: string;
  plan_name: PMSPlanName;
  // Maximum listings/units allowed by the subscription (subscription_plans.max_listings).
  max_listings: number | null;
  status: PMSSubscriptionStatus;
  billing_cycle: 'MONTHLY' | 'ANNUAL';
  current_period_end: string;
  grace_period_end: string | null;
  auto_renew: boolean;
}

export function hasPMSAccess(
  subscription?: PMSSubscription | null
): boolean {
  if (!subscription) return false;

  const now = new Date();

  if (subscription.status === 'ACTIVE') {
    return new Date(subscription.current_period_end) > now;
  }

  if (subscription.status === 'GRACE_PERIOD') {
    if (!subscription.grace_period_end) return false;
    return new Date(subscription.grace_period_end) > now;
  }

  return false;
}

export function getPMSAccessReason(
  subscription?: PMSSubscription | null
): string {
  if (!subscription) {
    return 'A PMS subscription is required to access property management.';
  }

  if (subscription.status === 'PENDING_PAYMENT') {
    return 'Your PMS subscription is waiting for payment. Complete payment to activate property management.';
  }

  if (subscription.status === 'ACTIVE') {
    const now = new Date();
    if (new Date(subscription.current_period_end) <= now) {
      return 'Your PMS subscription has expired. Renew to continue managing your properties.';
    }
    return 'Your PMS subscription is active.';
  }

  if (subscription.status === 'GRACE_PERIOD') {
    if (subscription.grace_period_end && new Date(subscription.grace_period_end) <= new Date()) {
      return 'Your PMS grace period has ended. Renew your subscription to restore access.';
    }
    return 'Your PMS subscription is in the grace period. Renew before it ends to keep your properties active.';
  }

  if (subscription.status === 'EXPIRED') {
    return 'Your PMS subscription has expired. Renew your subscription to continue managing your properties.';
  }

  if (subscription.status === 'CANCELLED') {
    return 'Your PMS subscription has been cancelled. Subscribe again to continue using property management.';
  }

  return 'A PMS subscription is required to access this feature.';
}