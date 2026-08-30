export type PMSSubscriptionStatus =
  | 'ACTIVE'
  | 'GRACE_PERIOD'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'PENDING_PAYMENT';

export type PMSPlanName = 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';

export interface PMSSubscription {
  subscription_id?: string;
  plan_id?: string;
  plan_name?: string | null;
  max_listings?: number | null;
  status?: string | null;
  billing_cycle?: 'MONTHLY' | 'ANNUAL' | string | null;
  current_period_end?: string | null;
  grace_period_end?: string | null;
  auto_renew?: boolean;
}

export function hasPMSAccess(
  subscription?: PMSSubscription | null
): boolean {
  if (!subscription) return false;

  const now = new Date();
  const status = String(subscription.status ?? '').toUpperCase();
  const currentPeriodEnd = subscription.current_period_end ?? null;
  const gracePeriodEnd = subscription.grace_period_end ?? null;

  if (status === 'ACTIVE') {
    if (!currentPeriodEnd) return false;
    return new Date(currentPeriodEnd) > now;
  }

  if (status === 'GRACE_PERIOD') {
    if (!gracePeriodEnd) return false;
    return new Date(gracePeriodEnd) > now;
  }

  return false;
}

export function getPMSAccessReason(
  subscription?: PMSSubscription | null
): string {
  if (!subscription) {
    return 'A PMS subscription is required to access property management.';
  }

  const status = String(subscription.status ?? '').toUpperCase();
  const currentPeriodEnd = subscription.current_period_end ?? null;
  const gracePeriodEnd = subscription.grace_period_end ?? null;

  if (status === 'PENDING_PAYMENT') {
    return 'Your PMS subscription is waiting for payment. Complete payment to activate property management.';
  }

  if (status === 'ACTIVE') {
    if (!currentPeriodEnd) {
      return 'Your PMS subscription is active.';
    }
    const now = new Date();
    if (new Date(currentPeriodEnd) <= now) {
      return 'Your PMS subscription has expired. Renew to continue managing your properties.';
    }
    return 'Your PMS subscription is active.';
  }

  if (status === 'GRACE_PERIOD') {
    if (gracePeriodEnd && new Date(gracePeriodEnd) <= new Date()) {
      return 'Your PMS grace period has ended. Renew your subscription to restore access.';
    }
    return 'Your PMS subscription is in the grace period. Renew before it ends to keep your properties active.';
  }

  if (status === 'EXPIRED') {
    return 'Your PMS subscription has expired. Renew your subscription to continue managing your properties.';
  }

  if (status === 'CANCELLED') {
    return 'Your PMS subscription has been cancelled. Subscribe again to continue using property management.';
  }

  return 'A PMS subscription is required to access this feature.';
}