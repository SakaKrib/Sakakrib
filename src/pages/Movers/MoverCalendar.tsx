import { CalendarDays } from 'lucide-react';
import type { MoverScheduleEvent } from '@/lib/Movers/moverApi';

interface Props { schedule: MoverScheduleEvent[]; onOpen: (bookingId: string) => void }

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export default function MoverCalendar({ schedule, onOpen }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return date;
  });

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">Mover calendar</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your next seven days of scheduled moving work.</p>
        </div>
        <CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-400" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => {
          const key = dayKey(day);
          const events = schedule.filter((event) => dayKey(new Date(event.starts_at)) === key && ['TENTATIVE', 'CONFIRMED'].includes(event.status));
          return (
            <div key={key} className="min-h-28 rounded-xl border border-gray-200 p-3 dark:border-brand-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{day.toLocaleDateString('en-KE', { weekday: 'short' })}</p>
              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{day.getDate()}</p>
              <div className="mt-2 space-y-1.5">
                {events.length === 0 ? <p className="text-xs text-gray-400">Free</p> : events.slice(0, 2).map((event) => (
                  <button key={event.id} type="button" onClick={() => onOpen(event.booking_id)} className="w-full truncate rounded-lg bg-brand-50 px-2 py-1.5 text-left text-xs font-semibold text-brand-700 dark:bg-brand-800/50 dark:text-brand-300">
                    {new Date(event.starts_at).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' })} · {event.title || 'Job'}
                  </button>
                ))}
                {events.length > 2 && <p className="text-xs text-gray-500">+{events.length - 2} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
