import {
  X,
  Home,
  Building2,
  Truck,
  Check,
  ArrowRight,
  BriefcaseBusiness,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav, type AppView } from '@/context/NavContext';
import { type UserRole } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface RoleOption {
  value: UserRole;
  label: string;
  description: string;
  icon: typeof Home;
  gradient: string;
  ctaLabel: string;
  redirectView: AppView;
}

const ROLES: RoleOption[] = [
  {
    value: 'renter',
    label: 'Renter',
    description:
      'Browse homes, book movers, and find your next place to live.',
    icon: Home,
    gradient: 'from-brand-500 to-brand-700',
    ctaLabel: 'Browse Listings',
    redirectView: 'home',
  },

  {
    value: 'landlord',
    label: 'Landlord',
    description:
      'Manage your own rental properties, post listings, and manage tenants.',
    icon: Building2,
    gradient: 'from-success-500 to-success-700',
    ctaLabel: 'Complete Your Profile',
    redirectView: 'kyc-verify',
  },

  {
    value: 'real_estate',
    label: 'Real Estate Agent',
    description:
      'Market properties, manage property listings, connect with clients, and grow your real estate business.',
    icon: BriefcaseBusiness,
    gradient: 'from-purple-500 to-purple-700',
    ctaLabel: 'Complete Your Profile',
    redirectView: 'kyc-verify',
  },

  {
    value: 'mover',
    label: 'Mover',
    description:
      'Offer relocation services, accept bookings, and grow your moving business.',
    icon: Truck,
    gradient: 'from-accent-500 to-accent-700',
    ctaLabel: 'Complete Your Profile',
    redirectView: 'kyc-verify',
  },
];

export default function RoleSelectionModal() {
  const { profile, needsRoleSelection, setRole } = useAuth();

  const {
    navigate,
    roleModalOpen,
    setRoleModalOpen,
  } = useNav();

  const [selectedRole, setSelectedRole] =
    useState<UserRole | null>(profile?.role ?? null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile || (!needsRoleSelection && !roleModalOpen)) {
    return null;
  }

  const handleSelect = (role: UserRole) => {
    if (loading) return;

    setError(null);
    setSelectedRole(role);
  };

  const handleConfirm = async () => {
    if (!selectedRole || loading) return;

    setLoading(true);
    setError(null);

    const { error } = await setRole(selectedRole);

    if (error) {
      console.error('Failed to save user role:', error);
      setError(error);
      setLoading(false);
      return;
    }

    const roleOption = ROLES.find(
      (role) => role.value === selectedRole
    );

    if (!roleOption) {
      setError('Unable to determine the destination for this role.');
      setLoading(false);
      return;
    }

    navigate(roleOption.redirectView);

    setRoleModalOpen(false);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop intentionally cannot be dismissed. */}
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm animate-fade-in" />

      <div
        className="relative w-full max-w-2xl animate-scale-in rounded-2xl bg-white shadow-2xl dark:bg-brand-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-selection-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-brand-800">
          <div>
            <h2
              id="role-selection-title"
              className="text-xl font-bold text-gray-900 dark:text-white"
            >
              Choose Your Role
            </h2>

            <p className="text-sm text-gray-500 dark:text-gray-400">
              Select how you want to use Saka Krib. This determines your
              dashboard and features.
            </p>
          </div>

          <div
            className="rounded-full border border-gray-200 p-2 text-gray-300 dark:border-brand-800 dark:text-brand-700"
            aria-hidden="true"
          >
            <X className="h-5 w-5" />
          </div>
        </div>

        {/* Role Options */}
        <div className="space-y-3 p-6">
          {ROLES.map((role) => {
            const isSelected = selectedRole === role.value;

            return (
              <button
                key={role.value}
                type="button"
                onClick={() => handleSelect(role.value)}
                disabled={loading}
                aria-pressed={isSelected}
                className={cn(
                  'flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  isSelected
                    ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-800/30'
                    : 'border-gray-200 hover:border-gray-300 dark:border-brand-700 dark:hover:border-brand-600'
                )}
              >
                {/* Icon */}
                <div
                  className={cn(
                    'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md',
                    role.gradient
                  )}
                >
                  <role.icon className="h-7 w-7" />
                </div>

                {/* Content */}
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    {role.label}
                  </h3>

                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {role.description}
                  </p>

                  {isSelected && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
                      <ArrowRight className="h-3 w-3" />
                      {role.ctaLabel}
                    </p>
                  )}
                </div>

                {/* Selected indicator */}
                {isSelected && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
                    <Check className="h-5 w-5" />
                  </div>
                )}
              </button>
            );
          })}

          {/* Save Error */}
          {error && (
            <p
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 dark:border-brand-800">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              © Copyright Saka Krib. All Rights Reserved.
            </p>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedRole || loading}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Saving...' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}