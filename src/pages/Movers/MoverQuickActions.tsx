import { CalendarDays, FileText, MessageCircle, ReceiptText, UserRound, Users, Wallet, Bell, BriefcaseBusiness } from 'lucide-react';

interface Props {
  onCalendar: () => void;
  onMessages: () => void;
  onProfile: () => void;
  onRequests?: () => void;
  onJobs?: () => void;
  onCustomers?: () => void;
  onInvoices?: () => void;
  onEarnings?: () => void;
  onNotifications?: () => void;
}

export default function MoverQuickActions({ onCalendar, onMessages, onProfile, onRequests, onJobs, onCustomers, onInvoices, onEarnings, onNotifications }: Props) {
  const actions = [
    { label: 'Booking requests', icon: ReceiptText, onClick: onRequests },
    { label: 'Upcoming jobs', icon: BriefcaseBusiness, onClick: onJobs },
    { label: 'Calendar', icon: CalendarDays, onClick: onCalendar },
    { label: 'Customers', icon: Users, onClick: onCustomers },
    { label: 'Invoices', icon: FileText, onClick: onInvoices },
    { label: 'Earnings', icon: Wallet, onClick: onEarnings },
    { label: 'Notifications', icon: Bell, onClick: onNotifications },
    { label: 'Messages', icon: MessageCircle, onClick: onMessages },
    { label: 'Mover profile', icon: UserRound, onClick: onProfile },
  ].filter((action) => action.onClick);

  return <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{actions.map(({ label, icon: Icon, onClick }) => <button key={label} type="button" onClick={onClick} className="card flex items-center gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50"><Icon className="h-5 w-5 text-brand-600 dark:text-brand-400" /></span><span className="font-semibold text-gray-900 dark:text-white">{label}</span></button>)}</section>;
}
