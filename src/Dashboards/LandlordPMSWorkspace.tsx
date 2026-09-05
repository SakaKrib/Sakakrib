import { useState } from 'react';
import { Activity, BarChart3, CalendarDays, CreditCard, LayoutDashboard, Settings2 } from 'lucide-react';
import LandlordPMSOverview from './LandlordPMSOverview';
import LandlordPMSRentControls from './LandlordPMSRentControls';
import LandlordPMSActivity from './LandlordPMSActivity';
import LandlordPMSCalendarStats from './LandlordPMSCalendarStats';
import LandlordPMS from './LandlordPMS';
import PMSSubscriptionPage from '@/components/PMS/PMSSubscriptionPage';

type WorkspaceTab = 'overview' | 'management' | 'rent' | 'activity' | 'subscription';

const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'management', label: 'Properties & Renters', icon: Settings2 },
  { id: 'rent', label: 'Rent & Calendar', icon: CalendarDays },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
];

export default function LandlordPMSWorkspace() {
  const [tab, setTab] = useState<WorkspaceTab>('overview');

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-brand-800 dark:bg-brand-950">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                tab === id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-brand-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <>
          <LandlordPMSOverview />
          <div className="grid gap-5 lg:grid-cols-3">
            <QuickPanel
              icon={BarChart3}
              title="Property, unit and renter operations"
              description="Manage the landlord → property → unit → renter relationship from the Django-backed PMS workspace."
              action="Open management"
              onClick={() => setTab('management')}
            />
            <QuickPanel
              icon={CalendarDays}
              title="Rent schedule and calendar"
              description="Review rent due dates, paid-through records, calendar statistics and manual rent records."
              action="Open rent controls"
              onClick={() => setTab('rent')}
            />
            <QuickPanel
              icon={Activity}
              title="Recent activity"
              description="Review the latest Django-backed notifications, invoices and recorded rent payments in one timeline."
              action="Open activity"
              onClick={() => setTab('activity')}
            />
          </div>
        </>
      )}

      {tab === 'management' && <LandlordPMS />}
      {tab === 'rent' && (
        <>
          <LandlordPMSCalendarStats />
          <LandlordPMSRentControls />
        </>
      )}
      {tab === 'activity' && <LandlordPMSActivity />}
      {tab === 'subscription' && <PMSSubscriptionPage />}
    </section>
  );
}

function QuickPanel({
  icon: Icon,
  title,
  description,
  action,
  onClick,
}: {
  icon: typeof BarChart3;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
          <button type="button" onClick={onClick} className="btn-secondary mt-4">
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}
