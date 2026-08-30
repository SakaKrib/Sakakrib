import { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock3,
  Home,
  Loader2,
  MapPin,
  Plus,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';

import {
  loadRealEstateDashboardData,
  type RealEstateDashboardData,
  type RealEstateListingSummary,
} from '@/lib/RealEstateTs/Realestateservice';

import {
  fetchListingEntitlement,
  type ListingEntitlement,
} from '@/lib/ListingEntitlement';


// ============================================================
// HELPERS
// ============================================================

function formatKES(value: number | null) {
  if (value === null) return 'Not set';

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function listingStatusBadge(
  listing: RealEstateListingSummary
) {
  if (listing.is_published) {
    return {
      label: 'Published',
      className:
        'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    };
  }

  if (listing.approval_status === 'pending_review') {
    return {
      label: 'Pending review',
      className:
        'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
    };
  }

  if (listing.approval_status === 'rejected') {
    return {
      label: 'Rejected',
      className:
        'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
    };
  }

  if (!listing.is_paid) {
    return {
      label: 'Payment pending',
      className:
        'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
    };
  }

  return {
    label: listing.approval_status || 'In review',
    className:
      'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300',
  };
}


// ============================================================
// COMPONENT
// ============================================================

export default function RealEstateDashboard() {
  const { profile } = useAuth();
  const { navigate } = useNav();

  const [data, setData] =
    useState<RealEstateDashboardData | null>(null);

  const [listingEntitlement, setListingEntitlement] =
    useState<ListingEntitlement | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);


  // ==========================================================
  // LOAD DASHBOARD + REAL ESTATE ENTITLEMENT
  //
  // The dashboard and posting flow use the same DB-backed
  // entitlement system:
  //
  //   fetchListingEntitlement('real_estate', profile.id)
  //
  // This does NOT directly query Supabase from this component.
  // The entitlement helper uses protectedPost().
  // ==========================================================

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!profile?.id) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      if (profile.role !== 'real_estate') {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [dashboardResult, entitlementResult] =
          await Promise.all([
            loadRealEstateDashboardData(profile.id),

            fetchListingEntitlement(
              'real_estate',
              profile.id
            ),
          ]);

        if (!cancelled) {
          setData(dashboardResult);
          setListingEntitlement(entitlementResult);
        }
      } catch (err) {
        console.error(
          'Failed to load real estate dashboard:',
          err
        );

        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load your dashboard.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.role]);


  // ==========================================================
  // ROLE GATE
  //
  // Presentation only.
  // The database independently enforces authorization.
  // ==========================================================

  if (profile && profile.role !== 'real_estate') {
    return (
      <div className="mx-auto max-w-md px-2 py-20 text-center">
        <div className="card p-8">
          <ShieldAlert className="mx-auto h-10 w-10 text-warning-600" />

          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Real Estate access required
          </h2>

          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            This dashboard is only available to Real Estate accounts.
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


  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading your dashboard...
        </div>
      </div>
    );
  }


  // ==========================================================
  // ERROR
  // ==========================================================

  if (error) {
    return (
      <div className="mx-auto max-w-md px-2 py-20 text-center">
        <div className="card p-8">
          <XCircle className="mx-auto h-10 w-10 text-error-600" />

          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Unable to load dashboard
          </h2>

          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {error}
          </p>
        </div>
      </div>
    );
  }


  // ==========================================================
  // DATA
  // ==========================================================

  const subscription = data?.subscription ?? null;

  const listings = data?.listings ?? [];

  const publishedCount = listings.filter(
    (l) => l.is_published
  ).length;

  const pendingCount = listings.filter(
    (l) =>
      !l.is_published &&
      l.approval_status === 'pending_review'
  ).length;


  // ==========================================================
  // ENTITLEMENT
  //
  // IMPORTANT:
  // These values come directly from the normalized entitlement
  // returned by get_real_estate_listing_entitlement().
  //
  // Do not calculate these from listings.length.
  // ==========================================================

  const freeListingLimit =
    listingEntitlement?.free_limit ?? 0;

  const freeListingsUsed =
    listingEntitlement?.free_listings_used ?? 0;

  const freeListingsRemaining =
    listingEntitlement?.free_listings_remaining ?? 0;

  const listingFeeKes =
    listingEntitlement?.individualListingPriceKes ?? null;

  const requiresListingPayment =
    listingEntitlement?.requiresIndividualPayment === true;

  const canStartListing =
    listingEntitlement?.canStartListing === true;

  const canCreateListing =
    listingEntitlement?.canCreate === true;


  // ==========================================================
  // FREE-LISTING DISPLAY
  // ==========================================================

  const freeListingMessage =
    freeListingsRemaining > 0
      ? `You have ${freeListingsRemaining} free listing${
          freeListingsRemaining === 1 ? '' : 's'
        } remaining.`
      : requiresListingPayment && listingFeeKes !== null
        ? `Your ${freeListingLimit}-listing free allowance has been used. Additional listings cost ${formatKES(
            listingFeeKes
          )} each.`
        : 'Your free listing allowance has been used.';


  return (
    <div className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">

      {/* ==========================================================
          HEADER
      ========================================================== */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 dark:bg-brand-800/50">
            <Building2 className="h-6 w-6 text-brand-600 dark:text-brand-400" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {profile?.full_name || 'Real Estate Dashboard'}
            </h1>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage your listings and business account.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('post-listing')}
          disabled={!canStartListing && !canCreateListing}
          className="btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          New Listing
        </button>
      </div>


      {/* ==========================================================
          STATS
      ========================================================== */}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">

        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Total listings
          </p>

          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
            {listings.length}
          </p>
        </div>


        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Published
          </p>

          <p className="mt-2 text-2xl font-bold text-success-600">
            {publishedCount}
          </p>
        </div>


        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Pending review
          </p>

          <p className="mt-2 text-2xl font-bold text-warning-600">
            {pendingCount}
          </p>
        </div>

      </div>


      <div className="mt-8 grid gap-6 lg:grid-cols-3">

        {/* ========================================================
            LISTINGS
        ========================================================= */}

        <div className="lg:col-span-2">

          <div className="rounded-xl border border-gray-200 bg-white dark:border-brand-700 dark:bg-brand-900">

            <div className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-brand-700">

              <h2 className="font-semibold text-gray-900 dark:text-white">
                Your listings
              </h2>

              {listingEntitlement && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {freeListingsUsed} / {freeListingLimit} free used
                </span>
              )}

            </div>


            {listings.length === 0 ? (

              <div className="p-10 text-center">

                <Home className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />

                <p className="mt-3 font-medium text-gray-700 dark:text-gray-300">
                  No listings yet
                </p>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Create your first listing to get started.
                </p>

                <button
                  type="button"
                  onClick={() => navigate('post-listing')}
                  disabled={!canStartListing && !canCreateListing}
                  className="btn-primary mt-4 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  New Listing
                </button>

              </div>

            ) : (

              <div className="divide-y divide-gray-200 dark:divide-brand-800">

                {listings.map((listing) => {

                  const badge =
                    listingStatusBadge(listing);

                  return (
                    <button
                      key={listing.id}
                      type="button"
                      onClick={() =>
                        navigate(
                          'listing-detail',
                          {
                            listingId: listing.id,
                          } as never
                        )
                      }
                      className="flex w-full items-center gap-4 p-5 text-left transition hover:bg-gray-50 dark:hover:bg-brand-800/50"
                    >

                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-brand-800">

                        {listing.cover_photo_url ? (

                          <img
                            src={listing.cover_photo_url}
                            alt={listing.title}
                            className="h-full w-full object-cover"
                          />

                        ) : (

                          <div className="flex h-full w-full items-center justify-center">
                            <Home className="h-6 w-6 text-gray-400" />
                          </div>

                        )}

                      </div>


                      <div className="min-w-0 flex-1">

                        <h3 className="truncate font-semibold text-gray-900 dark:text-white">
                          {listing.title}
                        </h3>

                        <div className="mt-1 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">

                          <MapPin className="h-3.5 w-3.5" />

                          <span>
                            {listing.city}, {listing.county}
                          </span>

                        </div>


                        <div className="mt-2 flex flex-wrap items-center gap-2">

                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatKES(listing.price_kes)}
                          </span>

                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                          >
                            {badge.label}
                          </span>

                        </div>

                      </div>

                    </button>
                  );

                })}

              </div>

            )}

          </div>

        </div>


        {/* ========================================================
            SIDEBAR
        ========================================================= */}

        <div className="space-y-6">


          {/* ======================================================
              LISTING ENTITLEMENT
          ====================================================== */}

          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">

            <h2 className="font-semibold text-gray-900 dark:text-white">
              Listing access
            </h2>


            {listingEntitlement ? (

              <div className="mt-4 space-y-3">

                <div className="flex items-center justify-between">

                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Free listings
                  </span>

                  <span className="font-medium text-gray-900 dark:text-white">
                    {freeListingsUsed} / {freeListingLimit}
                  </span>

                </div>


                <div className="flex items-center justify-between">

                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Remaining
                  </span>

                  <span className="font-medium text-gray-900 dark:text-white">
                    {freeListingsRemaining}
                  </span>

                </div>


                {requiresListingPayment &&
                  listingFeeKes !== null && (

                    <div className="flex items-center justify-between">

                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Additional listing
                      </span>

                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatKES(listingFeeKes)}
                      </span>

                    </div>

                  )}


                {listingEntitlement.subscriptionPlan && (

                  <div className="flex items-center justify-between">

                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Plan
                    </span>

                    <span className="font-medium text-gray-900 dark:text-white">
                      {listingEntitlement.subscriptionPlan}
                    </span>

                  </div>

                )}


                <div className="rounded-lg bg-gray-50 p-3 dark:bg-brand-800/30">

                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {freeListingMessage}
                  </p>

                </div>


                {!canStartListing &&
                  !canCreateListing &&
                  !requiresListingPayment && (

                    <p className="text-xs text-error-600 dark:text-error-400">
                      You currently cannot start another listing.
                    </p>

                  )}

              </div>

            ) : (

              <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking listing access...
              </div>

            )}

          </div>


          {/* ======================================================
              SUBSCRIPTION
          ====================================================== */}

          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">

            <h2 className="font-semibold text-gray-900 dark:text-white">
              Subscription
            </h2>


            {subscription ? (

              <div className="mt-4 space-y-3">

                <div className="flex items-center justify-between">

                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Plan
                  </span>

                  <span className="font-semibold text-gray-900 dark:text-white">
                    {subscription.plan_name}
                  </span>

                </div>


                <div className="flex items-center justify-between">

                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Status
                  </span>

                  <span className="inline-flex items-center gap-1 text-sm font-medium text-success-600">

                    <CheckCircle2 className="h-4 w-4" />

                    {subscription.subscription_status ===
                    'GRACE_PERIOD'
                      ? 'Grace period'
                      : 'Active'}

                  </span>

                </div>


                <div className="flex items-center justify-between">

                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Listing limit
                  </span>

                  <span className="font-medium text-gray-900 dark:text-white">

                    {subscription.max_listings === null
                      ? 'Unlimited'
                      : subscription.max_listings}

                  </span>

                </div>


                <div className="flex items-center justify-between">

                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Renews
                  </span>

                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatDate(
                      subscription.current_period_end
                    )}
                  </span>

                </div>


                <button
                  type="button"
                  onClick={() =>
                    navigate('subscription-plans')
                  }
                  className="btn-secondary mt-2 w-full"
                >
                  Manage subscription
                </button>

              </div>

            ) : (

              <div className="mt-4">

                <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-4 dark:bg-brand-800/30">

                  <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />

                  <div>

                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      No active subscription
                    </p>

                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {freeListingMessage}
                    </p>

                  </div>

                </div>


                <button
                  type="button"
                  onClick={() =>
                    navigate('subscription-plans')
                  }
                  className="btn-primary mt-3 w-full"
                >
                  View plans
                </button>

              </div>

            )}

          </div>


          {/* ======================================================
              PROPERTY MANAGEMENT
          ====================================================== */}

          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">

            <h2 className="font-semibold text-gray-900 dark:text-white">
              Property Management
            </h2>

            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Unit and renter management (PMS) isn't available for
              Real Estate accounts yet. You can still create and
              manage your listings above.
            </p>

          </div>


          {/* ======================================================
              ACCOUNT
          ====================================================== */}

          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">

            <h2 className="font-semibold text-gray-900 dark:text-white">
              Business account
            </h2>


            <div className="mt-4 space-y-3 text-sm">

              <div className="flex items-center justify-between">

                <span className="text-gray-500 dark:text-gray-400">
                  Name
                </span>

                <span className="font-medium text-gray-900 dark:text-white">
                  {profile?.full_name || 'Not set'}
                </span>

              </div>


              <div className="flex items-center justify-between">

                <span className="text-gray-500 dark:text-gray-400">
                  Verification
                </span>

                <span
                  className={`font-medium ${
                    profile?.verification_status ===
                    'verified'
                      ? 'text-success-600'
                      : 'text-warning-600'
                  }`}
                >
                  {profile?.verification_status ===
                  'verified'
                    ? 'Verified'
                    : 'Unverified'}
                </span>

              </div>


              <div className="flex items-center justify-between">

                <span className="text-gray-500 dark:text-gray-400">
                  Location
                </span>

                <span className="font-medium text-gray-900 dark:text-white">

                  {profile?.city
                    ? `${profile.city}, ${
                        profile.county ?? ''
                      }`
                    : 'Not set'}

                </span>

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}