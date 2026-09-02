import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { getRealEstatePMSAccess, type RealEstatePMSAccess } from '@/lib/RealEstateTs/Realestateservice';

interface RealEstatePMSAccessGuardProps {
  children: React.ReactNode;
}

function accessReason(access: RealEstatePMSAccess) {
  switch (access.reason) {
    case 'AUTHENTICATION_REQUIRED':
      return 'Please sign in to access property management.';
    case 'PMS_ROLE_REQUIRED':
      return 'Property management is available to landlord and real-estate accounts.';
    case 'IDENTITY_VERIFICATION_REQUIRED':
      return 'Complete identity verification before accessing property management.';
    case 'LANDLORD_APPLICATION_NOT_APPROVED':
      return 'Your landlord application must be approved before accessing property management.';
    case 'REAL_ESTATE_APPLICATION_NOT_APPROVED':
      return 'Your real-estate application must be approved before accessing property management.';
    case 'ACTIVE_SUBSCRIPTION_REQUIRED':
      return 'A property management subscription is required to access this feature.';
    case 'SUBSCRIPTION_GRACE_PERIOD':
      return 'Your subscription is in its grace period. Property management is read-only until payment is restored.';
    default:
      return 'Unable to verify property management access.';
  }
}

export default function RealEstatePMSAccessGuard({ children }: RealEstatePMSAccessGuardProps) {
  const { profile, loading: authLoading } = useAuth();
  const { navigate } = useNav();
  const [access, setAccess] = useState<RealEstatePMSAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || profile.role !== 'real_estate') {
      setAccess(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getRealEstatePMSAccess()
      .then((result) => {
        if (!cancelled) setAccess(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to verify property management access.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profile]);

  if (authLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading property management...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-2 py-20">
        <div className="card p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-brand-600" />
          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Sign in required</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Please sign in to access property management.</p>
          <button type="button" onClick={() => navigate('home')} className="btn-primary mt-6 inline-flex items-center gap-2">
            Go Home <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (profile.role !== 'real_estate') {
    return (
      <div className="mx-auto max-w-md px-2 py-20">
        <div className="card p-8 text-center">
          <Building2 className="mx-auto h-10 w-10 text-brand-600" />
          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Real estate access required</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Property management is available to real estate accounts.</p>
          <button type="button" onClick={() => navigate('dashboard')} className="btn-primary mt-6 inline-flex items-center gap-2">
            Go to Dashboard <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">Checking property management access...</div>
      </div>
    );
  }

  if (error || !access) {
    return (
      <div className="mx-auto max-w-md px-2 py-20 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error ?? 'Unable to verify property management access.'}</p>
      </div>
    );
  }

  if (!access.allowed) {
    return (
      <div className="mx-auto max-w-lg px-2 py-16">
        <div className="card p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/30">
            <Building2 className="h-7 w-7 text-brand-600" />
          </div>
          <h2 className="mt-5 text-2xl font-bold text-gray-900 dark:text-white">Property Management</h2>
          <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">{accessReason(access)}</p>
          <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4 text-left dark:border-brand-700 dark:bg-brand-900/20">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
              <div>
                <p className="font-semibold text-brand-900 dark:text-brand-200">Continue listing without PMS</p>
                <p className="mt-1 text-sm leading-6 text-brand-700 dark:text-brand-300">You can continue creating and publishing listings without a property management subscription.</p>
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button type="button" onClick={() => navigate('subscription-plans')} className="btn-primary inline-flex items-center justify-center gap-2">
              View Plans <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => navigate('my-listings')} className="btn-secondary">Manage Listings</button>
          </div>
        </div>
      </div>
    );
  }

  // The backend is authoritative. Grace-period access is intentionally
  // exposed to the page as read-only state rather than being inferred here.
  return <>{children}</>;
}
