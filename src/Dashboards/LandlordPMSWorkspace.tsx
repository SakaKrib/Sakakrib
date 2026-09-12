import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Bell, CalendarDays, CreditCard, LayoutDashboard, RefreshCw, Settings2, TrendingUp, Wallet } from 'lucide-react';
import { djangoPmsGateway, type PMSDashboardSnapshot } from '@/lib/djangoPmsGateway';
import LandlordPMSOverview from './LandlordPMSOverview';
import LandlordPMSRentControls from './LandlordPMSRentControls';
import LandlordPMSActivity from './LandlordPMSActivity';
import LandlordPMSFinance from './LandlordPMSFinance';
import LandlordPMSCalendarStats from './LandlordPMSCalendarStats';
import LandlordPMSCalendar from './LandlordPMSCalendar';
import LandlordPMSCollectionTrend from './LandlordPMSCollectionTrend';
import LandlordPMSInsightsPanel from './LandlordPMSInsightsPanel';
import LandlordPMSPropertyWorkflow from './LandlordPMSPropertyWorkflow';
import LandlordPMSRentalRequests from './LandlordPMSRentalRequests';
import LandlordPMSQuickActions from './LandlordPMSQuickActions';
import LandlordPMSNotifications from './LandlordPMSNotifications';
import LandlordPMSSettings from './LandlordPMSSettings';
import LandlordPMSEntitlementHeader from './LandlordPMSEntitlementHeader';
import PMSSubscriptionPage from '@/components/PMS/PMSSubscriptionPage';

type WorkspaceTab = 'overview' | 'management' | 'rent' | 'finance' | 'insights' | 'activity' | 'notifications' | 'subscription' | 'settings';

const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'management', label: 'Properties & Renters', icon: Settings2 },
  { id: 'rent', label: 'Rent, Calendar & Stats', icon: CalendarDays },
  { id: 'finance', label: 'Finance & Payments', icon: TrendingUp },
  { id: 'insights', label: 'Django Insights', icon: BarChart3 },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'settings', label: 'Payment Settings', icon: Wallet },
];

export default function LandlordPMSWorkspace() {
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [snapshot, setSnapshot] = useState<PMSDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await djangoPmsGateway.dashboard();
    if (result.error) {
      setSnapshot(null);
      setError(result.error.message);
    } else {
      setSnapshot(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const badges = useMemo(() => {
    const notifications = Array.isArray(snapshot?.notifications) ? snapshot.notifications : [];
    const submissions = Array.isArray(snapshot?.rentPaymentSubmissions)
      ? snapshot.rentPaymentSubmissions
      : Array.isArray(snapshot?.pendingRentSubmissions)
        ? snapshot.pendingRentSubmissions
        : [];
    return {
      unread: notifications.filter((item: any) => !item.read).length,
      pending: submissions.filter((item: any) => String(item.status ?? '').toUpperCase() === 'PENDING').length,
    };
  }, [snapshot]);

  const labelFor = (id: WorkspaceTab, label: string) => {
    if (id === 'notifications' && badges.unread > 0) return `${label} (${badges.unread})`;
    if (id === 'management' && badges.pending > 0) return `${label} (${badges.pending})`;
    return label;
  };

  return (
    <section className="mt-6 space-y-5 mx-auto max-w-7xl px-2 py-4 text-center sm:px-6 lg:px-8">
      <LandlordPMSEntitlementHeader />
      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-brand-800 dark:bg-brand-950">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Django-backed PMS workspace</div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{snapshot?.subscription?.plan_name ? `${snapshot.subscription.plan_name} · ${snapshot.subscription.status ?? 'status unavailable'}` : 'Live PMS state from Django'}</div>
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold text-gray-500 dark:text-gray-400">
            {snapshot?.capacity && <span>{snapshot.capacity.listings_used ?? 0} used{snapshot.capacity.max_listings != null ? ` / ${snapshot.capacity.max_listings}` : ''} listings</span>}
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 hover:bg-gray-50 disabled:opacity-50 dark:border-brand-800 dark:hover:bg-brand-900"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto px-2">
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 mb-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === id ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-brand-900'}`}><Icon className="h-4 w-4" />{labelFor(id, label)}</button>)}
        </div>
      </div>
      {error && <div className="rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-900/20 dark:text-error-300">PMS data could not be loaded: {error}</div>}
      {tab === 'overview' && <><LandlordPMSOverview /><LandlordPMSQuickActions onNavigate={(nextTab) => setTab(nextTab)} /></>}
      {tab === 'management' && <><LandlordPMSRentalRequests /><LandlordPMSPropertyWorkflow /></>}
      {tab === 'rent' && <><LandlordPMSCalendar /><LandlordPMSCalendarStats /><LandlordPMSRentControls /></>}
      {tab === 'finance' && <><LandlordPMSFinance /><LandlordPMSCollectionTrend /></>}
      {tab === 'insights' && <LandlordPMSInsightsPanel />}
      {tab === 'activity' && <LandlordPMSActivity />}
      {tab === 'notifications' && <LandlordPMSNotifications />}
      {tab === 'subscription' && <PMSSubscriptionPage />}
      {tab === 'settings' && <LandlordPMSSettings />}
    </section>
  );
}
