import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Bell, CalendarDays, CheckCircle2, ChevronRight, CreditCard, LayoutDashboard, RefreshCw, Settings2, ShieldAlert, Users, Wallet, WalletCards } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { loadRealEstateDashboardData, type RealEstateDashboardData } from '@/lib/RealEstateTs/Realestateservice';
import RealEstateListings from './RealEstateListings';
import PMSMaintenanceInbox from '@/components/PMS/PMSMaintenanceInbox';
import RealEstatePMSTeam from './RealEstatePMSTeam';
import { useLiveEvents } from '@/lib/useLiveEvents';
import RealEstatePMSAnalytics from './RealEstatePMSAnalytics';
import RealEstatePMSCalendar from './RealEstatePMSCalendar';
import RealEstatePMSFinance from './RealEstatePMSFinance';
import PMSExportMenu from '@/components/PMS/PMSExportMenu';
import RealEstatePMSFinancialReport from './RealEstatePMSFinancialReport';
import RealEstatePMSNotifications from './RealEstatePMSNotifications';
import RealEstatePMSOperations from './RealEstatePMSOperations';
import LandlordPMSRentalRequests from '@/Dashboards/LandlordPMSRentalRequests';
import RealEstatePMSPaymentSettings from './RealEstatePMSPaymentSettings';
import RealEstatePMSSubscriptionManagement from './RealEstatePMSSSubscriptionManagement';

type WorkspaceTab = 'overview' | 'listings' | 'team' | 'operations' | 'finance' | 'reports' | 'subscription' | 'notifications' | 'settings';

const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'listings', label: 'Listings', icon: BarChart3 },
  { id: 'operations', label: 'Units & Operations', icon: Settings2 },
  { id: 'finance', label: 'Finance & Payments', icon: WalletCards },
  { id: 'reports', label: 'Reports & Analytics', icon: Activity },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'team', label: 'Agent Team', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'settings', label: 'Payment Settings', icon: Wallet },
];

function formatDate(value: string | null | undefined) { if (!value) return '—'; const date = new Date(value); if (Number.isNaN(date.getTime())) return '—'; return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(date); }
function Stat({ icon: Icon, label, value, note, onClick }: { icon: typeof CalendarDays; label: string; value: string; note: string; onClick?: () => void }) {
  const body = <><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p><p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{note}</p></div><div className="rounded-xl bg-brand-50 p-2.5 dark:bg-brand-800"><Icon className="h-5 w-5 text-brand-600 dark:text-brand-300" /></div></div>{onClick && <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-300">View <ChevronRight className="h-3.5 w-3.5" /></p>}</>;
  const cls = 'block w-full rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm dark:border-brand-700 dark:bg-brand-900';
  return onClick ? <button type="button" onClick={onClick} className={`${cls} transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500`}>{body}</button> : <div className={cls}>{body}</div>;
}
type ListingFilter = 'all' | 'published' | 'pending' | 'managed' | 'unpaid';
const FILTER_LABELS: Record<ListingFilter, string> = { all: 'All managed properties', published: 'Published', pending: 'Pending approval', managed: 'PMS managed', unpaid: 'Payment required' };

export default function RealEstatePMSWorkspace() {
  const { event: liveEvent } = useLiveEvents(true);
  const { profile } = useAuth(); const { navigate } = useNav(); const [tab, setTab] = useState<WorkspaceTab>('overview'); const [listingFilter, setListingFilter] = useState<ListingFilter>('all'); const openListings = (filter: ListingFilter) => { setListingFilter(filter); setTab('listings'); window.scrollTo({ top: 0, behavior: 'smooth' }); }; const [data, setData] = useState<RealEstateDashboardData | null>(null); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (refresh = false) => { if (refresh) setRefreshing(true); else setLoading(true); setError(null); try { setData(await loadRealEstateDashboardData(profile?.id ?? '')); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load real-estate PMS statistics.'); } finally { setLoading(false); setRefreshing(false); } }, [profile?.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const shouldRefresh =
      (liveEvent?.type === 'ready' && liveEvent.reconnected) ||
      (liveEvent?.type === 'resource.updated' &&
        ['pms', 'rent', 'subscriptions', 'notifications', 'applications', 'listings', 'payments'].includes(liveEvent.resource ?? ''));
    if (shouldRefresh) void load(true);
  }, [liveEvent, load]);
  const stats = useMemo(() => { const listings = (data?.listings ?? []).filter((item) => item.is_property_management); const published = listings.filter((item) => item.is_published && item.is_approved).length; const pending = listings.filter((item) => !item.is_approved && !['rejected', 'declined'].includes((item.approval_status ?? '').toLowerCase())).length; const managed = listings.filter((item) => item.pms_managed).length; const unpaid = listings.filter((item) => !item.is_paid && !item.pms_managed).length; const capacity = data?.subscription?.max_listings; const remaining = capacity == null ? null : Math.max(0, capacity - managed); const publishedRate = listings.length ? Math.round((published / listings.length) * 100) : 0; const utilization = capacity ? Math.min(100, Math.round((managed / capacity) * 100)) : null; return { listings, published, pending, managed, unpaid, capacity, remaining, publishedRate, utilization }; }, [data]);
  if (loading) return <div className="flex min-h-[420px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">Loading real-estate property management...</div>;
  if (error || !data) return <div className="mx-auto max-w-4xl px-4 py-12"><div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300"><p className="font-semibold">Unable to load real-estate PMS</p><p className="mt-1">{error ?? 'No dashboard data was returned.'}</p><button type="button" onClick={() => void load(true)} className="btn-primary mt-4 inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" />Retry</button></div></div>;
  const ownerIsAdmin = String(data.team_context?.pms_role ?? '') === 'ADMIN';
  return <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8"><div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"><ShieldAlert className="h-3.5 w-3.5" /> Property management</div><h1 className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">Real Estate Property Management</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Subscription, listing capacity, publishing state, calendar events and portfolio activity.</p></div><button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold dark:border-brand-700 dark:bg-brand-900"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh data</button></div>
    <section className="mb-4 rounded-2xl border border-gray-200 bg-white/95 p-1.5 shadow-sm sm:mb-6 sm:p-2 dark:border-brand-700 dark:bg-brand-950/95">
      <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.filter(({ id }) => (id !== 'settings' && id !== 'team') || ownerIsAdmin).map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-semibold sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm transition ${tab === id ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-brand-900'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </div>
    </section>
    {tab === 'overview' && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Stat icon={BarChart3} label="Managed properties" value={String(stats.listings.length)} note="Portfolio" onClick={() => openListings('all')} /><Stat icon={CheckCircle2} label="Published" value={String(stats.published)} note={`${stats.publishedRate}% of portfolio`} onClick={() => openListings('published')} /><Stat icon={CalendarDays} label="Pending approval" value={String(stats.pending)} note="Awaiting review" onClick={() => openListings('pending')} /><Stat icon={WalletCards} label="PMS managed" value={String(stats.managed)} note={stats.remaining === null ? 'Unlimited capacity' : `${stats.remaining} remaining`} onClick={() => openListings('managed')} /><Stat icon={ShieldAlert} label="Payment required" value={String(stats.unpaid)} note="Non-PMS listings" onClick={() => openListings('unpaid')} /></div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]"><RealEstatePMSAnalytics /><section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950"><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-brand-600 dark:text-brand-300" /><h2 className="text-lg font-bold text-gray-900 dark:text-white">Portfolio performance</h2></div><div className="mt-5 space-y-4"><div><div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Published rate</span><strong className="text-gray-900 dark:text-white">{stats.publishedRate}%</strong></div><div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-brand-800"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${stats.publishedRate}%` }} /></div></div><div><div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">PMS utilization</span><strong className="text-gray-900 dark:text-white">{stats.utilization == null ? 'Unlimited' : `${stats.utilization}%`}</strong></div>{stats.utilization != null && <div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-brand-800"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${stats.utilization}%` }} /></div>}</div><div className="grid grid-cols-2 gap-3 pt-2"><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/60"><p className="text-xs text-gray-500 dark:text-gray-400">Subscription</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{data.subscription?.plan_name ?? 'None'}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{data.subscription?.subscription_status ?? '—'}</p></div><div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/60"><p className="text-xs text-gray-500 dark:text-gray-400">Period ends</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{formatDate(data.subscription?.current_period_end)}</p></div></div></div></section></div>
    </>}
    {tab === 'listings' && (() => {
      const shown = stats.listings.filter((item) => listingFilter === 'all' ? true : listingFilter === 'published' ? item.is_published && item.is_approved : listingFilter === 'pending' ? !item.is_approved && !['rejected', 'declined'].includes((item.approval_status ?? '').toLowerCase()) : listingFilter === 'managed' ? item.pms_managed : !item.is_paid && !item.pms_managed);
      return <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">{(Object.keys(FILTER_LABELS) as ListingFilter[]).map((key) => <button key={key} type="button" onClick={() => setListingFilter(key)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${listingFilter === key ? 'bg-brand-600 text-white shadow-sm' : 'border border-gray-200 bg-white text-gray-600 hover:border-brand-300 dark:border-brand-700 dark:bg-brand-900 dark:text-gray-300'}`}>{FILTER_LABELS[key]}</button>)}</div>
        <p className="text-xs text-gray-500 dark:text-gray-400">Properties with units live here. Single listings are managed from your main dashboard.</p>
        <RealEstateListings key={listingFilter} listings={shown} startExpanded heading={FILTER_LABELS[listingFilter]} onCreateListing={() => navigate('post-listing')} onOpenListing={(listingId) => navigate('listing-detail', listingId)} />
      </div>;
    })()}
    {tab === 'team' && ownerIsAdmin && <div className="space-y-4"><div><h2 className="text-xl font-bold text-gray-900 dark:text-white">Agent Team</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage team access while keeping all listing and unit capacity under the subscribing PMS account.</p></div><RealEstatePMSTeam /></div>}
    {tab === 'operations' && <div className="space-y-6">{(ownerIsAdmin || String(data.team_context?.pms_role ?? '') === 'TEAM_MANAGER') && <><LandlordPMSRentalRequests /><PMSMaintenanceInbox /></>}<RealEstatePMSCalendar listings={stats.listings} subscription={data.subscription} /><RealEstatePMSOperations listings={stats.listings.map((listing) => ({ id: String(listing.id), title: listing.title }))} maxUnitsPerListing={data.subscription?.max_units_per_listing} isAdmin={ownerIsAdmin} /></div>}
    {tab === 'finance' && <div className="space-y-6"><PMSExportMenu /><RealEstatePMSFinance canCreateInvoices={ownerIsAdmin || String(data.team_context?.pms_role ?? '') === 'TEAM_MANAGER'} /><RealEstatePMSFinancialReport /></div>}
    {tab === 'reports' && <div className="space-y-6"><RealEstatePMSAnalytics /><RealEstatePMSFinancialReport /></div>}
    {tab === 'subscription' && <div className="space-y-6"><RealEstatePMSSubscriptionManagement data={data} isAdmin={ownerIsAdmin} /></div>}
    {tab === 'notifications' && <div className="space-y-6"><RealEstatePMSNotifications /></div>}
    {tab === 'settings' && <div className="space-y-6">{ownerIsAdmin && <RealEstatePMSPaymentSettings isAdmin={ownerIsAdmin} />}</div>}
  </div>;
}
