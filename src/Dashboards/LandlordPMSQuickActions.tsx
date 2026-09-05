import { Building2, CalendarDays, FileText, Plus, Users, Wallet } from 'lucide-react';

type QuickAction = {
  label: string;
  description: string;
  icon: typeof Plus;
  tab: 'management' | 'rent' | 'finance';
};

const actions: QuickAction[] = [
  { label: 'Manage properties & renters', description: 'Maintain the landlord → property → unit → renter relationship.', icon: Building2, tab: 'management' },
  { label: 'Review rent calendar', description: 'See due dates, overdue invoices and payment-review activity.', icon: CalendarDays, tab: 'rent' },
  { label: 'Create or review invoices', description: 'Open the rent workspace for invoice creation and verification.', icon: FileText, tab: 'rent' },
  { label: 'Review payments', description: 'See collected, outstanding and awaiting-confirmation amounts.', icon: Wallet, tab: 'finance' },
];

export default function LandlordPMSQuickActions({ onNavigate }: { onNavigate: (tab: QuickAction['tab']) => void }) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Quick actions</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Run your PMS from one workspace</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Each action opens the existing Django-backed PMS workflow; no frontend state becomes authoritative.</p>
        </div>
        <Users className="hidden h-5 w-5 text-brand-600 sm:block" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map(({ label, description, icon: Icon, tab }) => (
          <button
            key={label}
            type="button"
            onClick={() => onNavigate(tab)}
            className="group rounded-2xl border border-gray-200 p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:border-brand-800 dark:hover:border-brand-700"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                <Icon className="h-5 w-5" />
              </span>
              <Plus className="h-4 w-4 text-gray-300 transition group-hover:text-brand-500" />
            </div>
            <p className="mt-4 text-sm font-bold text-gray-900 dark:text-white">{label}</p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
