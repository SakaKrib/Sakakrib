import { useEffect, useState } from 'react';
import {
  Activity,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  Home,
  Loader2,
  MapPin,
  Plus,
  ShieldAlert,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';

import {
  getCurrentRealEstateSubscription,
  type RealEstateDashboardData,
  type RealEstateListingSummary,
} from '@/lib/RealEstateTs/Realestateservice';

import { protectedGet } from '@/lib/djangoApi';

import {
  fetchListingEntitlement,
  type ListingEntitlement,
} from '@/lib/ListingEntitlement';

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

function listingStatusBadge(listing: RealEstateListingSummary) {
  if (listing.is_published) {
    return {
      label: 'Published',
      className:
        'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    };
  }

  if (listing.approval_status === 'pending_review') {
    return {
      label: 'Pending review',
      className:
        'bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
    };
  }

  if (listing.approval_status === 'rejected') {
    return {
      label: 'Rejected',
      className:
        'bg-error-50 text-error-700 dark:bg-error-900/30 dark:text-error-400',
    };
  }

  if (!listing.is_paid) {
    return {
      label: 'Payment pending',
      className:
        'bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
    };
  }

  return {
    label: listing.approval_status || 'In review',
    className:
      'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300',
  };
}

export default function RealEstateDashboard() {
  const { profile } = useAuth();
  const { navigate } = useNav();

  const [data, setData] = useState<RealEstateDashboardData | null>(null);
  const [listingEntitlement, setListingEntitlement] =
    useState<ListingEntitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!profile?.id) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (profile.role !== 'real_estate') {
        if (!cancelled) setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [listingsResponse, subscription, entitlementResult] =
          await Promise.all([
            protectedGet<{
              results?: Array<{
                id: string;
                user_id: string;
                title: string;
                description?: string | null;
                city: string;
                county: string;
                price_kes: number | string | null;
                listing_type: string;
                approval_status: string;
                is_approved: boolean | null;
                is_published: boolean | null;
                is_paid: boolean | null;
                created_at: string;
                media?: Array<{ url?: string | null }>;
              }>;
            }>(`/api/listings/?user_id=${encodeURIComponent(profile.id)}`),
            getCurrentRealEstateSubscription(),
            fetchListingEntitlement('real_estate', profile.id),
          ]);

        const listings: RealEstateListingSummary[] =
          (listingsResponse.results ?? []).map((listing) => ({
            id: listing.id,
            user_id: listing.user_id,
            title: listing.title,
            description: listing.description ?? null,
            listing_type: listing.listing_type,
            city: listing.city,
            county: listing.county,
            price_kes:
              listing.price_kes === null ? null : Number(listing.price_kes),
            cover_photo_url: listing.media?.[0]?.url ?? null,
            is_approved: Boolean(listing.is_approved),
            approval_status: listing.approval_status?.trim().toLowerCase() || null,
            is_published: Boolean(listing.is_published),
            is_paid: Boolean(listing.is_paid),
            pms_managed: false,
            created_at: listing.created_at,
          }));

        const dashboardResult: RealEstateDashboardData = {
          subscription,
          entitlement: {
            canStartListing: entitlementResult.canStartListing,
            canCreate: entitlementResult.canCreate,
            requiresSubscription: entitlementResult.requiresSubscription,
            requiresIndividualPayment: entitlementResult.requiresIndividualPayment,
            freeListingsRemaining: entitlementResult.free_listings_remaining,
            freeLimit: entitlementResult.free_limit,
            individualListingPriceKes: entitlementResult.individualListingPriceKes,
          },
          listings,
        };

        if (!cancelled) {
          setData(dashboardResult);
          setListingEntitlement(entitlementResult);
        }
      } catch (err) {
        console.error('Failed to load real estate dashboard:', err);

        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Unable to load your dashboard.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.role]);

  if (profile && profile.role !== 'real_estate') {
    return (
      <div className="mx-auto max-w-7xl px-2 py-20 text-center sm:px-6 lg:px-8">
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

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
        <div className="card flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" />
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Loading your real estate dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-2 py-20 text-center sm:px-6 lg:px-8">
        <div className="card p-8">
          <XCircle className="mx-auto h-10 w-10 text-error-600" />
          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Unable to load dashboard
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  const subscription = data?.subscription ?? null;
  const listings = data?.listings ?? [];
  const publishedCount = listings.filter((listing) => listing.is_published).length;
  const pendingCount = listings.filter(
    (listing) => !listing.is_published && listing.approval_status === 'pending_review'
  ).length;
  const rejectedCount = listings.filter(
    (listing) => !listing.is_published && listing.approval_status === 'rejected'
  ).length;

  const freeListingLimit = listingEntitlement?.free_limit ?? 0;
  const freeListingsUsed = listingEntitlement?.free_listings_used ?? 0;
  const freeListingsRemaining = listingEntitlement?.free_listings_remaining ?? 0;
  const listingFeeKes = listingEntitlement?.individualListingPriceKes ?? null;
  const requiresListingPayment =
    listingEntitlement?.requiresIndividualPayment === true;
  const canStartListing = listingEntitlement?.canStartListing === true;
  const canCreateListing = listingEntitlement?.canCreate === true;

  const freeListingMessage =
    freeListingsRemaining > 0
      ? `You have ${freeListingsRemaining} free listing${freeListingsRemaining === 1 ? '' : 's'} remaining.`
      : requiresListingPayment && listingFeeKes !== null
        ? `Your ${freeListingLimit}-listing free allowance has been used. Additional listings cost ${formatKES(listingFeeKes)} each.`
        : 'Your free listing allowance has been used.';

  const statCards = [
    {
      label: 'Approved Listings',
      value: publishedCount,
      icon: CheckCircle2,
      iconClass: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    },
    {
      label: 'Pending Listings',
      value: pendingCount,
      icon: Clock3,
      iconClass: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
    },
    {
      label: 'Rejected Listings',
      value: rejectedCount,
      icon: XCircle,
      iconClass: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
    },
    {
      label: 'Total Listings',
      value: listings.length,
      icon: Home,
      iconClass: 'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200',
    },
  ];

  const recentActivity = listings.slice(0, 5);

  return (
    <div className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
      {/* PROFILE / WELCOME */}
      <div className="card mb-4 overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200">
              <Building2 className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-gray-900 dark:text-white">
                {profile?.full_name || 'Real Estate Dashboard'}
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Manage your properties, listings, and business account.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* POST LISTING — deliberately on its own row */}
      <div className="card mb-6 p-4">
        <button
          type="button"
          onClick={() => navigate('post-listing')}
          disabled={!canStartListing && !canCreateListing}
          className="btn-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Post New Listing
        </button>
      </div>

      {/* STATS */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                    {stat.value}
                  </p>
                </div>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.iconClass}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* LISTINGS — one full-width card, never sharing the row with sidebar cards */}
      <div className="card mb-6 overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                <Home className="h-5 w-5 text-brand-600" />
                Your Listings
              </h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {listings.length} {listings.length === 1 ? 'listing' : 'listings'} on your account.
              </p>
            </div>
            {listingEntitlement && (
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {freeListingsUsed} / {freeListingLimit} free used
              </span>
            )}
          </div>
        </div>

        <div className="p-5">
          {listings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center dark:border-brand-800">
              <Home className="mx-auto h-12 w-12 text-gray-300 dark:text-brand-700" />
              <h3 className="mt-4 font-semibold text-gray-800 dark:text-gray-200">No listings yet</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
                Create your first listing to get started.
              </p>
              <button
                type="button"
                onClick={() => navigate('post-listing')}
                disabled={!canStartListing && !canCreateListing}
                className="btn-primary mt-5 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Post New Listing
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {listings.map((listing) => {
                const badge = listingStatusBadge(listing);
                return (
                  <button
                    key={listing.id}
                    type="button"
                    onClick={() => navigate('listing-detail', { listingId: listing.id } as never)}
                    className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 p-4 text-left transition hover:bg-gray-50 dark:border-brand-800 dark:hover:bg-brand-900/30"
                  >
                    <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-brand-100 dark:bg-brand-800">
                      {listing.cover_photo_url ? (
                        <img
                          src={listing.cover_photo_url}
                          alt={listing.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Home className="h-8 w-8 text-brand-400" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-gray-900 dark:text-white">
                          {listing.title || 'Untitled Listing'}
                        </h3>
                        <span className={`badge ${badge.className}`}>{badge.label}</span>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <MapPin className="h-3.5 w-3.5" />
                        {listing.city}, {listing.county}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span className="font-semibold text-brand-600 dark:text-brand-400">
                          {formatKES(listing.price_kes)}
                        </span>
                        <span>{listing.listing_type}</span>
                        <span>{formatDate(listing.created_at)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ACTIVITY + PMS — same separated two-card row as Landlord Dashboard */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* ACTIVITY */}
        <div className="card overflow-hidden">
          <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
            <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
              <Activity className="h-5 w-5 text-brand-600" />
              Recent Activity
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Recent activity from your Real Estate account.
            </p>
          </div>

          <div className="p-5">
            {recentActivity.length === 0 ? (
              <div className="py-8 text-center">
                <Activity className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
                <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  No activity yet
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Listing activity will appear here as you create and update listings.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-brand-800">
                {recentActivity.map((listing) => {
                  const badge = listingStatusBadge(listing);
                  return (
                    <button
                      key={`activity-${listing.id}`}
                      type="button"
                      onClick={() => navigate('listing-detail', { listingId: listing.id } as never)}
                      className="flex w-full items-start gap-3 py-4 text-left first:pt-0 last:pb-0"
                    >
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                        <Home className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                          {listing.title || 'Untitled Listing'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {badge.label} · {formatDate(listing.created_at)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* PMS / PROPERTY MANAGEMENT */}
        <div className="card overflow-hidden">
          <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
            <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
              <Building2 className="h-5 w-5 text-brand-600" />
              Property Management (PMS)
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Property and unit management remains separate from this normal dashboard.
            </p>
          </div>
          <div className="p-5">
            <div className="rounded-2xl border border-gray-200 p-5 dark:border-brand-800">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    Real Estate PMS workspace
                  </p>
                  <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    PMS access and subscription are handled through the dedicated PMS flow. Your normal listings remain managed in this dashboard.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ACCESS / SUBSCRIPTION / ACCOUNT — separate cards, never overlapping */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* LISTING ACCESS */}
        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
            <Building2 className="h-5 w-5 text-brand-600" />
            Listing Access
          </h2>
          {listingEntitlement ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Free listings</span>
                <span className="font-semibold text-gray-900 dark:text-white">{freeListingsUsed} / {freeListingLimit}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Remaining</span>
                <span className="font-semibold text-gray-900 dark:text-white">{freeListingsRemaining}</span>
              </div>
              {requiresListingPayment && listingFeeKes !== null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Additional listing</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{formatKES(listingFeeKes)}</span>
                </div>
              )}
              {listingEntitlement.subscriptionPlan && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Plan</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{listingEntitlement.subscriptionPlan}</span>
                </div>
              )}
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-800/30">
                <p className="text-xs leading-5 text-gray-600 dark:text-gray-400">{freeListingMessage}</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking listing access...
            </div>
          )}
        </div>

        {/* SUBSCRIPTION */}
        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
            <CreditCard className="h-5 w-5 text-brand-600" />
            Subscription
          </h2>
          {subscription ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Plan</span>
                <span className="font-semibold text-gray-900 dark:text-white">{subscription.plan_name}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Status</span>
                <span className="inline-flex items-center gap-1 font-medium text-success-600">
                  <CheckCircle2 className="h-4 w-4" />
                  {subscription.subscription_status === 'GRACE_PERIOD' ? 'Grace period' : 'Active'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Listing limit</span>
                <span className="font-semibold text-gray-900 dark:text-white">{subscription.max_listings === null ? 'Unlimited' : subscription.max_listings}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Renews</span>
                <span className="font-semibold text-gray-900 dark:text-white">{formatDate(subscription.current_period_end)}</span>
              </div>
              <button type="button" onClick={() => navigate('subscription-plans')} className="btn-secondary mt-2 w-full">
                Manage subscription
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex items-start gap-3 rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
                <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No active subscription</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{freeListingMessage}</p>
                </div>
              </div>
              <button type="button" onClick={() => navigate('subscription-plans')} className="btn-primary mt-3 w-full">
                View plans
              </button>
            </div>
          )}
        </div>

        {/* BUSINESS ACCOUNT */}
        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
            <User className="h-5 w-5 text-brand-600" />
            Business Account
          </h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">Name</span>
              <span className="truncate font-medium text-gray-900 dark:text-white">{profile?.full_name || 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">Verification</span>
              <span className={`font-medium ${profile?.verification_status === 'verified' ? 'text-success-600' : 'text-warning-600'}`}>
                {profile?.verification_status === 'verified' ? 'Verified' : 'Unverified'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">Location</span>
              <span className="text-right font-medium text-gray-900 dark:text-white">
                {profile?.city ? `${profile.city}, ${profile.county ?? ''}` : 'Not set'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
