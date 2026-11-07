/**
 * Single source of truth for who may become what.
 *   - A renter can become a landlord, real-estate professional or mover.
 *   - Landlords, real-estate users and movers keep their role. No second account type.
 * The backend (SetRoleView) enforces the same rules; this module only drives the UI.
 */
export type ProfessionalTarget = 'post-listing' | 'register-mover' | 'register-landlord';

type RoleProfile = { role?: string | null; is_admin?: boolean | null } | null | undefined;

export type RoleDecision =
  | { kind: 'auth' }
  | { kind: 'proceed' }
  | { kind: 'choose-role' }
  | { kind: 'blocked'; message: string };

const isLister = (role: string) => role === 'landlord' || role === 'real_estate';

export function isAdminProfile(profile: RoleProfile): boolean {
  return profile?.is_admin === true || profile?.role === 'admin';
}

/** Which "How Saka Krib works" cards a signed-in role should see. */
export function visibleHomeCards(profile: RoleProfile): Array<'renter' | 'landlord' | 'mover'> {
  const role = String(profile?.role ?? '').toLowerCase();
  if (isLister(role)) return ['renter', 'landlord'];
  if (role === 'mover') return ['renter', 'mover'];
  return ['renter', 'landlord', 'mover'];
}

export function decideProfessionalAction(profile: RoleProfile, target: ProfessionalTarget): RoleDecision {
  if (!profile) return { kind: 'auth' };
  if (isAdminProfile(profile)) return { kind: 'blocked', message: 'Administrator accounts cannot use this option.' };
  const role = String(profile.role ?? '').toLowerCase();

  if (target === 'post-listing') {
    if (isLister(role)) return { kind: 'proceed' };
    if (role === 'mover') return { kind: 'blocked', message: 'Movers cannot post listings. A mover account cannot also be a landlord.' };
    return { kind: 'choose-role' };
  }
  if (target === 'register-mover') {
    if (role === 'mover') return { kind: 'proceed' };
    if (isLister(role)) return { kind: 'blocked', message: 'Landlord and real-estate accounts cannot become movers.' };
    return { kind: 'choose-role' };
  }
  // register-landlord
  if (isLister(role)) return { kind: 'proceed' };
  if (role === 'mover') return { kind: 'blocked', message: 'Mover accounts cannot become landlords.' };
  return { kind: 'choose-role' };
}
