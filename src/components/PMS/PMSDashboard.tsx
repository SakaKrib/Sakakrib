import { Building2, ArrowRight, Construction } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';

import PMSAccessGuard from '@/components/PMS/PMSAccessGuard';
import LandlordPMS from './Landlordpms';


// ============================================================
// LANDLORD PMS
//
// PMSAccessGuard is unchanged — already correctly gates this to
// landlord role + active/grace PMS subscription (can_manage_pms's
// own logic, mirrored client-side in PMSAccess.ts's hasPMSAccess).
// The stub content is now replaced with the real shell.
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
// IMPORTANT:
//
// There is currently no Real Estate PMS backend. can_manage_pms()
// is hardcoded to role = 'landlord' and reads exclusively from
// landlord_subscriptions — there is no real_estate_subscriptions
// branch anywhere in the PMS RPC layer. This is an honest "not yet
// available" state, not a working PMS UI wired to nothing.
//
// The underlying data RPCs/RLS (property_units, renter_unit_
// associations, rent_payments, rent_invoices) are ownership-scoped
// rather than role-restricted, so extending PMS to real estate
// later is a narrow backend change (extend can_manage_pms with a
// real_estate_subscriptions branch) — not a rebuild. Worth knowing
// if/when this gets built out for real.
// ============================================================

function RealEstatePMS() {
  const { navigate } = useNav();

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="card p-8 text-center">

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/30">
          <Construction className="h-7 w-7 text-brand-600" />
        </div>

        <h2 className="mt-5 text-2xl font-bold text-gray-900 dark:text-white">
          Property Management
        </h2>

        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Property/unit management (PMS) isn't available for Real
          Estate accounts yet. You can still create and manage your
          listings from your dashboard.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => navigate('dashboard')}
            className="btn-primary inline-flex items-center justify-center gap-2"
          >
            Back to Dashboard
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

      </div>
    </div>
  );
}


// ============================================================
// SPLIT ENTRY POINT
//
// Role-aware routing only — the actual authorization for each
// branch still lives server-side (PMSAccessGuard/can_manage_pms
// for landlord; there is simply no grantable path for real_estate
// yet). This component decides which shell to show, not whether
// access is allowed.
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
    return <RealEstatePMS />;
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