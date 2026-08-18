export type SubscriptionStatus =
  | 'active'
  | 'trial'
  | 'cancelled'
  | 'expired'
  | 'pending';

export type SubscriptionPlan =
  | 'free'
  | 'basic'
  | 'pro'
  | 'enterprise';

export interface PMSSubscription {
  id: string;
  user_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  starts_at?: string | null;
  expires_at?: string | null;
}

export function hasPMSAccess(
  subscription?: PMSSubscription | null
): boolean {
  if (!subscription) {
    return false;
  }

  // Only active/trial subscriptions can access PMS.
  if (
    subscription.status !== 'active' &&
    subscription.status !== 'trial'
  ) {
    return false;
  }

  // Free plan does not include PMS management.
  if (subscription.plan === 'free') {
    return false;
  }

  // If an expiry date exists, make sure it has not passed.
  if (subscription.expires_at) {
    const expiresAt = new Date(subscription.expires_at);

    if (expiresAt <= new Date()) {
      return false;
    }
  }

  return true;
}

export function getPMSAccessReason(
  subscription?: PMSSubscription | null
): string {
  if (!subscription) {
    return 'A PMS subscription is required to access property management.';
  }

  if (subscription.status === 'expired') {
    return 'Your PMS subscription has expired. Renew your subscription to continue managing your properties.';
  }

  if (subscription.status === 'cancelled') {
    return 'Your PMS subscription has been cancelled. Subscribe again to continue using property management.';
  }

  if (subscription.status === 'pending') {
    return 'Your PMS subscription is still being processed.';
  }

  if (subscription.status === 'trial') {
    if (
      subscription.expires_at &&
      new Date(subscription.expires_at) <= new Date()
    ) {
      return 'Your PMS trial has expired. Subscribe to continue using property management.';
    }

    return 'Your PMS trial is active.';
  }

  if (subscription.plan === 'free') {
    return 'Property management is available with a paid PMS subscription.';
  }

  if (subscription.expires_at) {
    if (new Date(subscription.expires_at) <= new Date()) {
      return 'Your PMS subscription has expired. Renew your subscription to continue.';
    }
  }

  return 'A PMS subscription is required to access this feature.';
}