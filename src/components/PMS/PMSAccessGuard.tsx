import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';

import {
  getPMSAccessReason,
  hasPMSAccess,
} from '@/lib/PMSAccess';


// ============================================================
// PROPS
// ============================================================

interface PMSAccessGuardProps {
  children: React.ReactNode;
}


// ============================================================
// PMS ACCESS GUARD
// ============================================================

export default function PMSAccessGuard({
  children,
}: PMSAccessGuardProps) {
  const {
    profile,
    subscription,
    loading,
  } = useAuth();

  const { navigate } = useNav();


  // ==========================================================
  // AUTH LOADING
  // ==========================================================

  if (loading) {
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
  // LANDLORD ONLY
  // ==========================================================

  if (profile.role !== 'landlord') {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="card p-8 text-center">

          <Building2 className="mx-auto h-10 w-10 text-brand-600" />

          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Landlord access required
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Property management is available to landlord
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
  // PMS ACCESS CHECK
  // ==========================================================

  const hasAccess =
    hasPMSAccess(subscription);


  // ==========================================================
  // NO PMS SUBSCRIPTION
  // ==========================================================

  if (!hasAccess) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="card p-8 text-center">

          {/* Icon */}

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/30">
            <Building2 className="h-7 w-7 text-brand-600" />
          </div>


          {/* Title */}

          <h2 className="mt-5 text-2xl font-bold text-gray-900 dark:text-white">
            Property Management
          </h2>


          {/* Explanation */}

          <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {getPMSAccessReason(subscription)}
          </p>


          {/* Free Listing Notice */}

          <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4 text-left dark:border-brand-700 dark:bg-brand-900/20">

            <div className="flex gap-3">

              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />

              <div>

                <p className="font-semibold text-brand-900 dark:text-brand-200">
                  Continue listing for free
                </p>

                <p className="mt-1 text-sm leading-6 text-brand-700 dark:text-brand-300">
                  You can continue creating and publishing
                  your property listings without a PMS
                  subscription.
                </p>

              </div>

            </div>

          </div>


          {/* Actions */}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">

            <button
              type="button"
              onClick={() => navigate('subscription')}
              className="btn-primary inline-flex items-center justify-center gap-2"
            >
              View PMS Plans

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
  // PMS ACCESS GRANTED
  // ==========================================================

  return <>{children}</>;
}