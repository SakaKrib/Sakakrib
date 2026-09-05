import { useState } from 'react';
import { Activity, Bell, CalendarDays, CreditCard, LayoutDashboard, Settings2, TrendingUp, Wallet } from 'lucide-react';
import LandlordPMSOverview from './LandlordPMSOverview';
import LandlordPMSRentControls from './LandlordPMSRentControls';
import LandlordPMSActivity from './LandlordPMSActivity';
import LandlordPMSFinance from './LandlordPMSFinance';
import LandlordPMSCalendarStats from './LandlordPMSCalendarStats';
import LandlordPMSCalendar from './LandlordPMSCalendar';
import LandlordPMSCollectionTrend from './LandlordPMSCollectionTrend';
import LandlordPMSPropertyWorkflow from './LandlordPMSPropertyWorkflow';
import LandlordPMSQuickActions from './LandlordPMSQuickActions';
import LandlordPMSNotifications from './LandlordPMSNotifications';
import LandlordPMSSettings from './LandlordPMSSettings';
import PMSSubscriptionPage from '@/components/PMS/PMSSubscriptionPage';

type WorkspaceTab = 'overview' | 'management' | 'rent' | 'finance' | 'activity' | 'notifications' | 'subscription' | 'settings';

const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'management', label: 'Properties & Renters', icon: Settings2 },
  { id: 'rent', label: 'Rent, Calendar & Stats', icon: CalendarDays },
  { id: 'finance', label: 'Finance & Payments', icon: TrendingUp },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'settings', label: 'Payment Settings', icon: Wallet },
];

export default function LandlordPMSWorkspace() {
  const [tab, setTab] = useState<WorkspaceTab>('overview');

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-brand-800 dark:bg-brand-950">
        <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Django-backed PMS workspace</div>
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === id ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-brand-900'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <><LandlordPMSOverview /><LandlordPMSQuickActions onNavigate={(nextTab) => setTab(nextTab)} /></>}
      {tab === 'management' && <LandlordPMSPropertyWorkflow />}
      {tab === 'rent' && <><LandlordPMSCalendar /><LandlordPMSCalendarStats /><LandlordPMSRentControls /></>}
      {tab === 'finance' && <><LandlordPMSFinance /><LandlordPMSCollectionTrend /></>}
      {tab === 'activity' && <LandlordPMSActivity />}
      {tab === 'notifications' && <LandlordPMSNotifications />}
      {tab === 'subscription' && <PMSSubscriptionPage />}
      {tab === 'settings' && <LandlordPMSSettings />}
    </section>
  );
}
