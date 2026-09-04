import { CalendarDays, MessageCircle, UserRound } from 'lucide-react';

interface Props {
  onCalendar: () => void;
  onMessages: () => void;
  onProfile: () => void;
}

export default function MoverQuickActions({ onCalendar, onMessages, onProfile }: Props) {
  const actions = [
    { label: 'Calendar', icon: CalendarDays, onClick: onCalendar },
    { label: 'Messages', icon: MessageCircle, onClick: onMessages },
    { label: 'Mover profile', icon: UserRound, onClick: onProfile },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-3">
      {actions.map(({ label, icon: Icon, onClick }) => (
        <button key={label} type="button" onClick={onClick} className="card flex items-center gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50"><Icon className="h-5 w-5 text-brand-600 dark:text-brand-400" /></span>
          <span className="font-semibold text-gray-900 dark:text-white">{label}</span>
        </button>
      ))}
    </section>
  );
}
