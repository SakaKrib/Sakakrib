import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';

import { getCurrentRealEstateSubscription } from '@/lib/RealEstateTs/Realestateservice';
import {
  getRealEstatePMSAccessReason,
  hasRealEstatePMSAccess,
  type RealEstatePMSSubscription,
} from '@/lib/RealEstateTs/Realestatepmsaccess';


// ============================================================
// PROPS
// ============================================================

interface RealEstatePMSAccessGuardProps {
  children: React.ReactNode;
}


// ============================================================
// REAL ESTATE PMS ACCESS GUARD
//
// Mirrors PMSAccessGuard.tsx's structure/copy tone for consistency,
// but gates on role === 'real_estate' and a live call to
// get_current_real_estate_subscription() rather than reading
// useAuth().subscription (that field is populated for the landlord
// path elsewhere in the app; it isn't assumed here for real estate
// since that hasn't been verified against AuthContext's actual
// implementation - fetching directly keeps this guard correct
// regardless of what AuthContext does or doesn't carry).
// ============================================================

export default function RealEstatePMSAccessGuard({
  children,
}: RealEstatePMSAccessGuardProps) {
  const { profile, loading: authLoading } = useAuth();
  const { navigate } = useNav();

  const [subscription, setSubscription] =
    useState<RealEstatePMSSubscription | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || profile.role !== 'real_estate') {
      setLoadingSubscription(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const data = await getCurrentRealEstateSubscription();
        if (!cancelled) setSubscription(data as RealEstatePMSSubscription | null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load subscription status.'
          );
        }
      } finally {
        if (!cancelled) setLoadingSubscription(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile]);


  // ==========================================================
  // AUTH LOADING
  // ==========================================================

  if (authLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Loading property management...
        </div>
      </div>
    );
  }


  // ==========================================================
  // NOT SIGNED IN
  // ==========================================================

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="card p-8 text-center">

          <ShieldCheck className="mx-auto h-10 w-10 text-brand-600" />

          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Sign in required
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Please sign in to access property management.
          </p>

          <button
            type="button"
            onClick={() => navigate('home')}
            className="btn-primary mt-6 inline-flex items-center gap-2"
          >
            Go Home
            <ArrowRight className="h-4 w-4" />
          </button>

        </div>
      </div>
    );
  }


  // ==========================================================
  // REAL ESTATE ONLY
  // ==========================================================

  if (profile.role !== 'real_estate') {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="card p-8 text-center">

          <Building2 className="mx-auto h-10 w-10 text-brand-600" />

          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Real estate access required
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Property management is available to real estate
            accounts.
          </p>

          <button
            type="button"
            onClick={() => navigate('dashboard')}
            className="btn-primary mt-6 inline-flex items-center gap-2"
          >
            Go to Dashboard
            <ArrowRight className="h-4 w-4" />
          </button>

        </div>
      </div>
    );
  }


  // ==========================================================
  // SUBSCRIPTION LOADING / ERROR
  // ==========================================================

  if (loadingSubscription) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Loading property management...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }


  // ==========================================================
  // PMS ACCESS CHECK
  // ==========================================================

  const hasAccess = hasRealEstatePMSAccess(subscription);


  // ==========================================================
  // NO PMS SUBSCRIPTION
  // ==========================================================

  if (!hasAccess) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="card p-8 text-center">

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/30">
            <Building2 className="h-7 w-7 text-brand-600" />
          </div>

          <h2 className="mt-5 text-2xl font-bold text-gray-900 dark:text-white">
            Property Management
          </h2>

          <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {getRealEstatePMSAccessReason(subscription)}
          </p>

          <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4 text-left dark:border-brand-700 dark:bg-brand-900/20">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
              <div>
                <p className="font-semibold text-brand-900 dark:text-brand-200">
                  Continue listing for free
                </p>
                <p className="mt-1 text-sm leading-6 text-brand-700 dark:text-brand-300">
                  You can continue creating and publishing your
                  listings without a property management
                  subscription.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => navigate('subscription-plans')}
              className="btn-primary inline-flex items-center justify-center gap-2"
            >
              View Plans
              <ArrowRight className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => navigate('my-listings')}
              className="btn-secondary"
            >
              Manage Listings
            </button>
          </div>

        </div>
      </div>
    );
  }


  // ==========================================================
  // ACCESS GRANTED
  // ==========================================================

  return <>{children}</>;
}