import { Activity, BarChart3, CalendarDays, ClipboardList } from 'lucide-react';
import { useNav } from '@/context/NavContext';

export default function RenterDashboardTabs() {
  const { view, navigate } = useNav();
  const tabs = [
    { label: 'My Bookings', icon: ClipboardList, active: view === 'renter-moving-history' || view === 'my-bookings', target: 'renter-moving-history' as const },
    { label: 'Calendar', icon: CalendarDays, active: view === 'renter-calendar', target: 'renter-calendar' as const },
    { label: 'Activities', icon: Activity, active: view === 'renter-activities', target: 'renter-activities' as const },
    { label: 'Chat Performance', icon: BarChart3, active: view === 'renter-chat-performance', target: 'renter-chat-performance' as const },
  ];

  return <div className="mb-6 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm dark:border-brand-800 dark:bg-brand-900/40"><div className="grid min-w-[620px] grid-cols-4 gap-1">{tabs.map(({ label, icon: Icon, active, target }) => <button key={label} type="button" onClick={() => navigate(target)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${active ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-brand-800/60'}`}><Icon className="h-4 w-4" /><span>{label}</span></button>)}</div></div>;
}
