import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Bell, CalendarDays, CreditCard, LayoutDashboard, Settings2, TrendingUp, Wallet } from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';
import LandlordPMSOverview from './LandlordPMSOverview';
import LandlordPMSRentControls from './LandlordPMSRentControls';
import LandlordPMSActivity from './LandlordPMSActivity';
import LandlordPMSFinance from './LandlordPMSFinance';
import LandlordPMSCalendarStats from './LandlordPMSCalendarStats';
import LandlordPMSCalendar from './LandlordPMSCalendar';
import LandlordPMSCollectionTrend from './LandlordPMSCollectionTrend';
import LandlordPMSInsightsPanel from './LandlordPMSInsightsPanel';
import LandlordPMSPropertyWorkflow from './LandlordPMSPropertyWorkflow';
import LandlordPMSQuickActions from './LandlordPMSQuickActions';
import LandlordPMSNotifications from './LandlordPMSNotifications';
import LandlordPMSSettings from './LandlordPMSSettings';
import LandlordPMSEntitlementHeader from './LandlordPMSEntitlementHeader';
import PMSSubscriptionPage from '@/components/PMS/PMSSubscriptionPage';

type WorkspaceTab = 'overview' | 'management' | 'rent' | 'finance' | 'insights' | 'activity' | 'notifications' | 'subscription' | 'settings';
type DashboardSnapshot = {
  notifications?: Array<{ read?: boolean }>;
  pendingRentSubmissions?: Array<{ status?: string }>;
  rentInvoices?: Array<{ status?: string }>;
  capacity?: { listings_used?: number; listings_remaining?: number | null; max_listings?: number | null };
  subscription?: { plan_name?: string | null; status?: string | null } | null;
};

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
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    protectedGet<DashboardSnapshot>('/api/core/pms/dashboard/')
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null);
      });
    return () => { cancelled = true; };
  }, [tab]);

  const badges = useMemo(() => {
    const unread = (snapshot?.notifications ?? []).filter((item) => !item.read).length;
    const pending = (snapshot?.pendingRentSubmissions ?? []).filter((item) => String(item.status ?? '').toUpperCase() === 'PENDING').length;
    return { unread, pending };
  }, [snapshot]);

  const labelFor = (id: WorkspaceTab, label: string) => {
    if (id === 'notifications' && badges.unread > 0) return `${label} (${badges.unread})`;
    if (id === 'management' && badges.pending > 0) return `${label} (${badges.pending})`;
    return label;
  };

  return (
    <section className="mt-6 space-y-5">
      <LandlordPMSEntitlementHeader />

      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-brand-800 dark:bg-brand-950">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Django-backed PMS workspace</div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {snapshot?.subscription?.plan_name ? `${snapshot.subscription.plan_name} · ${snapshot.subscription.status ?? 'status unavailable'}` : 'Live PMS state from Django'}
            </div>
          </div>
          {snapshot?.capacity && (
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              {snapshot.capacity.listings_used ?? 0} used{snapshot.capacity.max_listings != null ? ` / ${snapshot.capacity.max_listings}` : ''} listings
            </div>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === id ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-brand-900'}`}>
              <Icon className="h-4 w-4" />{labelFor(id, label)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <><LandlordPMSOverview /><LandlordPMSQuickActions onNavigate={(nextTab) => setTab(nextTab)} /></>}
      {tab === 'management' && <LandlordPMSPropertyWorkflow />}
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
