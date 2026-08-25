import { Building2 } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';

import PMSAccessGuard from '@/components/PMS/LandlordPms/LandlordPMSAccessGuard';
import LandlordPMS from '@/components/PMS/LandlordPms/ Landlordpms';

import RealEstatePMSAccessGuard from '@/components/PMS/RealEstate/Realestatepmsaccessguard';
import RealEstatePMS from '@/components/PMS/RealEstate/Realestatepms';


// ============================================================
// LANDLORD PMS
//
// Unchanged - PMSAccessGuard already correctly gates this to
// landlord role + active/grace PMS subscription.
// ============================================================

function LandlordPMSEntry() {
  return (
    <PMSAccessGuard>
      <LandlordPMS />
    </PMSAccessGuard>
  );
}


// ============================================================
// REAL ESTATE PMS
//
// UPDATED per live-database audit (project zrhvapntshgmhynqtbma):
//
// real_estate_subscriptions billing/entitlement IS real and
// working (get_current_real_estate_subscription, PayPal recurring
// checkout, subscription payment notifications all verified
// against the live schema/functions). What's still missing is
// specifically the PMS *listing/unit management* layer -
// can_manage_pms() and every add/remove/list PMS RPC are hard-wired
// to landlord_subscriptions only, verified by reading each function
// body. RealEstatePMSAccessGuard + RealEstatePMS reflect that split
// honestly: real subscription data, a clearly-labeled "not
// available yet" state for property/unit management (no fabricated
// listings/units), and a real activity feed (user_notifications,
// populated by an existing trigger for both landlord and real
// estate subscription payments).
//
// Known gap carried forward, not solved here: real estate can only
// subscribe via PayPal right now - create_real_estate_subscription_
// checkout exists as an RPC but no edge function calls it (M-Pesa
// init only exists for landlords via subscription-stk). Needs its
// own edge function before real estate M-Pesa checkout can work.
// ============================================================

function RealEstatePMSEntry() {
  return (
    <RealEstatePMSAccessGuard>
      <RealEstatePMS />
    </RealEstatePMSAccessGuard>
  );
}


// ============================================================
// SPLIT ENTRY POINT
//
// Role-aware routing only - the actual authorization for each
// branch still lives server-side (each guard's own access check).
// This component decides which shell to show, not whether access
// is allowed.
// ============================================================

export default function PMSDashboard() {
  const { profile, loading } = useAuth();
  const { navigate } = useNav();

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Loading property management...
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Please sign in to access property management.
        </p>
      </div>
    );
  }

  if (profile.role === 'landlord') {
    return <LandlordPMSEntry />;
  }

  if (profile.role === 'real_estate') {
    return <RealEstatePMSEntry />;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="card p-8">
        <Building2 className="mx-auto h-10 w-10 text-brand-600" />

        <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
          Property management not available
        </h2>

        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          PMS is available to landlord and real estate accounts.
        </p>

        <button
          type="button"
          onClick={() => navigate('dashboard')}
          className="btn-primary mt-6"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}