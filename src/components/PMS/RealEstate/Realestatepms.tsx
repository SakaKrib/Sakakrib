import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldAlert,
  Users,
  WalletCards,
  XCircle,
} from 'lucide-react';

import {
  loadRealEstateDashboardData,
  type RealEstateDashboardData,
} from '@/lib/RealEstateTs/Realestateservice';

import {
  getMyNotifications,
  markNotificationRead,
  type UserNotification,
} from '@/lib/RealEstateTs/Usernotifications';

import type {
  RealEstatePMSSubscription,
} from '@/lib/RealEstateTs/Realestatepmsaccess';

import RealEstateListings from './RealEstateListings';
import RealEstatePMSTeam from './RealEstatePMSTeam';
import RealEstatePMSSettingsPanel from './RealEstatePMSSettingsPanel';

type TabKey = 'overview' | 'listings' | 'activity' | 'team' | 'settings';

interface RealEstatePMSProps {
  onCreateListing?: () => void;
  onOpenListing?: (listingId: string) => void;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(date);
}

function formatKES(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'KES 0';
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(value);
}

function getListingStatus(listing: {
  is_paid: boolean;
  is_approved: boolean;
  approval_status: string | null;
  is_published: boolean;
}) {
  if (!listing.is_paid) {
    return { label: 'Payment required', icon: WalletCards, className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' };
  }
  if (!listing.is_approved || listing.approval_status !== 'APPROVED') {
    return { label: 'Pending approval', icon: Clock3, className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' };
  }
  if (!listing.is_published) {
    return { label: 'Unpublished', icon: XCircle, className: 'bg-gray-100 text-gray-700 dark:bg-brand-800 dark:text-gray-300' };
  }
  return { label: 'Published', icon: CheckCircle2, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' };
}

function StatCard({ icon: Icon, label, value, description }: { icon: typeof Building2; label: string; value: string; description?: string }) {
  return (
    <div className="rounded-xl border bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          {description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>}
        </div>
        <div className="shrink-0 rounded-lg bg-brand-50 p-2.5 dark:bg-brand-800"><Icon className="h-5 w-5 text-brand-600 dark:text-brand-300" /></div>
      </div>
    </div>
  );
}

function SubscriptionCard({ subscription }: { subscription: RealEstatePMSSubscription }) {
  const isGrace = subscription.subscription_status === 'GRACE_PERIOD';
  const endDate = isGrace && subscription.grace_period_end ? subscription.grace_period_end : subscription.current_period_end;
  const isActive = subscription.subscription_status === 'ACTIVE';
  const statusLabel = isGrace ? 'Grace period' : isActive ? 'Active' : subscription.subscription_status;
  const statusClass = isGrace ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' : isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-700 dark:bg-brand-800 dark:text-gray-300';

  return (
    <div className="rounded-xl border bg-white p-6 dark:border-brand-700 dark:bg-brand-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Current subscription</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{subscription.plan_name}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><CalendarDays className="h-4 w-4 shrink-0" /><span>{isGrace ? 'Grace ends' : 'Period ends'} <strong className="font-semibold text-gray-900 dark:text-white">{formatDate(endDate)}</strong></span></div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-gray-50 p-4 dark:bg-brand-800/60"><p className="text-xs text-gray-500 dark:text-gray-400">Billing cycle</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{subscription.billing_cycle}</p></div>
        <div className="rounded-lg bg-gray-50 p-4 dark:bg-brand-800/60"><p className="text-xs text-gray-500 dark:text-gray-400">Listing limit</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{subscription.max_listings === null ? 'Unlimited' : subscription.max_listings}</p></div>
        <div className="rounded-lg bg-gray-50 p-4 dark:bg-brand-800/60"><p className="text-xs text-gray-500 dark:text-gray-400">Units / listing</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{subscription.max_units_per_listing === null ? 'Unlimited' : subscription.max_units_per_listing}</p></div>
      </div>
    </div>
  );
}

function ListingEntitlementCard({ entitlement }: { entitlement: RealEstateDashboardData['entitlement'] }) {
  const hasFreeListings = entitlement.freeListingsRemaining > 0;
  return (
    <div className="rounded-xl border bg-white p-6 dark:border-brand-700 dark:bg-brand-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Listing entitlement</p>
          <h3 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{entitlement.canCreate ? 'You can create listings' : 'Listing creation requires action'}</h3>
        </div>
        {entitlement.canCreate ? <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" /> : <ShieldAlert className="h-6 w-6 shrink-0 text-orange-500" />}
      </div>
      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-4 text-sm"><span className="text-gray-500 dark:text-gray-400">Free listings remaining</span><span className="font-semibold text-gray-900 dark:text-white">{entitlement.freeListingsRemaining}</span></div>
        <div className="flex items-center justify-between gap-4 text-sm"><span className="text-gray-500 dark:text-gray-400">Free listing limit</span><span className="font-semibold text-gray-900 dark:text-white">{entitlement.freeLimit}</span></div>
        {!hasFreeListings && entitlement.requiresIndividualPayment && <div className="rounded-lg bg-orange-50 p-3 text-sm text-orange-800 dark:bg-orange-900/20 dark:text-orange-300">Additional listings currently require individual payment of <strong>{formatKES(entitlement.individualListingPriceKes)}</strong>.</div>}
        {entitlement.requiresSubscription && <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">A subscription is required for this listing action.</div>}
      </div>
    </div>
  );
}

function ListingPreview({ listings, onOpenListing, onViewAll }: { listings: RealEstateDashboardData['listings']; onOpenListing?: (listingId: string) => void; onViewAll: () => void }) {
  const previewListings = listings.slice(0, 3);
  if (listings.length === 0) return <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center dark:border-brand-700 dark:bg-brand-900/40"><Building2 className="mx-auto h-10 w-10 text-gray-400" /><h3 className="mt-3 font-semibold text-gray-800 dark:text-gray-200">No listings yet</h3><p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">Your real-estate listings will appear here once you create them.</p></div>;
  return (
    <div className="space-y-4">
      {previewListings.map((listing) => { const status = getListingStatus(listing); const StatusIcon = status.icon; return (
        <button key={listing.id} type="button" onClick={() => onOpenListing?.(listing.id)} disabled={!onOpenListing} className={`flex w-full items-center gap-4 rounded-xl border bg-white p-4 text-left transition dark:border-brand-700 dark:bg-brand-900 ${onOpenListing ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : 'cursor-default'}`}>
          <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-brand-800">{listing.cover_photo_url ? <img src={listing.cover_photo_url} alt={listing.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Building2 className="h-7 w-7 text-gray-300 dark:text-brand-600" /></div>}</div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold text-gray-900 dark:text-white">{listing.title}</h3><span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}><StatusIcon className="h-3 w-3" />{status.label}</span></div><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{listing.city}{listing.county ? `, ${listing.county}` : ''}</p><div className="mt-2 flex items-center gap-3"><span className="text-sm font-semibold text-gray-900 dark:text-white">{listing.price_kes !== null ? formatKES(listing.price_kes) : 'Price on request'}</span><span className="text-xs capitalize text-gray-500 dark:text-gray-400">{listing.listing_type}</span></div></div>
        </button>
      ); })}
      {listings.length > 3 && <button type="button" onClick={onViewAll} className="w-full rounded-lg border border-dashed px-2 py-3 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-800">View all {listings.length} listings</button>}
    </div>
  );
}

function ActivityFeed() {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { setNotifications(await getMyNotifications()); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load activity.'); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const handleRead = async (id: string) => { try { await markNotificationRead(id); setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, read_at: new Date().toISOString() } : notification)); } catch { /* Notification read state is intentionally non-critical. */ } };
  if (loading) return <div className="flex items-center justify-center gap-2 py-16 text-gray-500 dark:text-gray-400"><Loader2 className="h-5 w-5 animate-spin" />Loading activity...</div>;
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">{error}</div>;
  if (notifications.length === 0) return <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center dark:border-brand-700 dark:bg-brand-900/40"><Bell className="mx-auto h-10 w-10 text-gray-400" /><p className="mt-3 font-semibold text-gray-700 dark:text-gray-300">No activity yet</p><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Subscription, payment, and account updates will appear here.</p></div>;
  return <div className="overflow-hidden rounded-xl border bg-white dark:divide-brand-800 dark:border-brand-700 dark:bg-brand-900">{notifications.map((notification) => <button key={notification.id} type="button" onClick={() => { if (!notification.read_at) void handleRead(notification.id); }} className="flex w-full flex-col gap-1 border-b p-4 text-left last:border-b-0 hover:bg-gray-50 dark:border-brand-800 dark:hover:bg-brand-800"><div className="flex items-center gap-2">{!notification.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />}<span className="font-medium text-gray-900 dark:text-white">{notification.title}</span></div><p className="text-sm text-gray-600 dark:text-gray-400">{notification.message}</p><p className="text-xs text-gray-400 dark:text-gray-500">{formatDate(notification.created_at)}</p></button>)}</div>;
}

export default function RealEstatePMS({ onCreateListing, onOpenListing }: RealEstatePMSProps) {
  const [tab, setTab] = useState<TabKey>('overview');
  const [dashboard, setDashboard] = useState<RealEstateDashboardData | null>(null);
  const [subscription, setSubscription] = useState<RealEstatePMSSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await loadRealEstateDashboardData('');
      setDashboard(data);
      setSubscription(data.subscription ? (data.subscription as RealEstatePMSSubscription) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load property management.');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const listingStats = useMemo(() => {
    const listings = dashboard?.listings ?? [];
    const published = listings.filter((listing) => listing.is_published && listing.is_approved && listing.approval_status === 'APPROVED').length;
    const pending = listings.filter((listing) => !listing.is_approved || listing.approval_status !== 'APPROVED').length;
    const unpaid = listings.filter((listing) => !listing.is_paid).length;
    return { total: listings.length, published, pending, unpaid };
  }, [dashboard]);

  const ownerIsAdmin = String(dashboard?.team_context?.pms_role ?? '') === 'ADMIN';

  const tabs: { key: TabKey; label: string; icon: typeof Building2 }[] = [
    { key: 'overview', label: 'Overview', icon: Building2 },
    { key: 'listings', label: 'Listings', icon: Building2 },
    { key: 'activity', label: 'Activity', icon: Activity },
    { key: 'team', label: 'Agent Team', icon: Users },
    ...(ownerIsAdmin ? [{ key: 'settings' as TabKey, label: 'Settings', icon: SettingsIcon }] : []),
  ];

  useEffect(() => {
    if (!ownerIsAdmin && tab === 'settings') setTab('overview');
  }, [ownerIsAdmin, tab]);

  if (loading) return <div className="mx-auto flex min-h-[400px] max-w-5xl items-center justify-center"><div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><Loader2 className="h-5 w-5 animate-spin" />Loading property management...</div></div>;

  if (error) return <div className="mx-auto max-w-4xl px-2 py-10"><div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><div className="flex-1"><p className="font-semibold">Unable to load property management</p><p className="mt-1">{error}</p><button type="button" onClick={() => void loadDashboard(true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-2 py-2 text-sm font-semibold text-white hover:bg-brand-700"><RefreshCw className="h-4 w-4" />Try again</button></div></div></div>;

  const data = dashboard;

  return (
    <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex items-center gap-3"><div className="rounded-xl bg-brand-50 p-2.5 dark:bg-brand-900/50"><Building2 className="h-6 w-6 text-brand-600 dark:text-brand-300" /></div><div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Property Management</h1><p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Real estate portfolio</p></div></div></div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => void loadDashboard(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-brand-700 dark:bg-brand-900 dark:text-gray-200 dark:hover:bg-brand-800"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button>{onCreateListing && <button type="button" onClick={onCreateListing} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-2 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" />Add listing</button>}</div>
      </div>

      <div className="mb-6 overflow-x-auto border-b dark:border-brand-800"><div className="flex min-w-max gap-1">{tabs.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex items-center gap-2 border-b-2 px-2 py-3 text-sm font-semibold transition ${tab === key ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}><Icon className="h-4 w-4" />{label}</button>)}</div></div>

      {tab === 'overview' && <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatCard icon={Building2} label="Total listings" value={String(listingStats.total)} description="Listings in your account" /><StatCard icon={CheckCircle2} label="Published" value={String(listingStats.published)} description="Approved and published" /><StatCard icon={Clock3} label="Pending" value={String(listingStats.pending)} description="Awaiting approval" /><StatCard icon={WalletCards} label="Payment required" value={String(listingStats.unpaid)} description="Listings needing payment" /></div>
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">{subscription && <SubscriptionCard subscription={subscription} />}{data && <ListingEntitlementCard entitlement={data.entitlement} />}</div>
        <section><div className="mb-4 flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Your portfolio</h2><p className="text-sm text-gray-500 dark:text-gray-400">Recent real-estate listings</p></div>{listingStats.total > 0 && <button type="button" onClick={() => setTab('listings')} className="shrink-0 text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300">View all</button>}</div><ListingPreview listings={data?.listings ?? []} onOpenListing={onOpenListing} onViewAll={() => setTab('listings')} /></section>
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 dark:border-brand-700 dark:bg-brand-900/40"><div className="flex items-start gap-3"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" /><div><p className="font-semibold text-gray-900 dark:text-white">Property portfolio management</p><p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">Listings, subscription entitlement, publishing status, and billing information are connected to the live backend. Full listing management is available from the Listings tab.</p></div></div></div>
      </div>}

      {tab === 'listings' && <div className="space-y-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-bold text-gray-900 dark:text-white">Listings</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage your real-estate listings, publishing status, payments, and listing details.</p></div>{onCreateListing && <button type="button" onClick={onCreateListing} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-2 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" />Add listing</button>}</div><div className="rounded-xl border bg-white dark:border-brand-700 dark:bg-brand-900"><RealEstateListings /></div></div>}

      {tab === 'activity' && <div><div className="mb-5"><h2 className="text-xl font-bold text-gray-900 dark:text-white">Activity</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Subscription, payment, and account notifications.</p></div><ActivityFeed /></div>}

      {tab === 'team' && <div><div className="mb-5"><h2 className="text-xl font-bold text-gray-900 dark:text-white">Agent Team</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage team access while keeping all listing and unit capacity under the subscribing PMS account.</p></div><RealEstatePMSTeam /></div>}

      {tab === 'settings' && ownerIsAdmin && <div><div className="mb-5"><h2 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Property management defaults and account configuration.</p></div><RealEstatePMSSettingsPanel subscription={subscription} isAdmin={ownerIsAdmin} /></div>}
    </div>
  );
}
