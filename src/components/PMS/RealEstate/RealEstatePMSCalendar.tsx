import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Home, ShieldCheck } from 'lucide-react';
import type { RealEstateDashboardData } from '@/lib/RealEstateTs/Realestateservice';

type Listing = RealEstateDashboardData['listings'][number];
type CalendarEvent = {
  date: Date;
  label: string;
  detail: string;
  tone: 'brand' | 'success' | 'warning';
};

const startOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);
const sameDay = (left: Date, right: Date) => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
const formatDate = (value: Date) => new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }).format(value);

export default function RealEstatePMSCalendar({
  listings,
  subscription,
}: {
  listings: Listing[];
  subscription: RealEstateDashboardData['subscription'];
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const today = new Date();

  const events = useMemo<CalendarEvent[]>(() => {
    const rows: CalendarEvent[] = listings.map((listing) => ({
      date: new Date(listing.created_at),
      label: 'Listing created',
      detail: listing.title || 'Property listing',
      tone: 'brand',
    }));

    if (subscription?.current_period_start) {
      rows.push({
        date: new Date(subscription.current_period_start),
        label: 'Subscription started',
        detail: subscription.plan_name || 'PMS subscription',
        tone: 'success',
      });
    }

    if (subscription?.current_period_end) {
      rows.push({
        date: new Date(subscription.current_period_end),
        label: 'Subscription renewal / expiry',
        detail: subscription.plan_name || 'PMS subscription',
        tone: 'warning',
      });
    }

    return rows.filter((event) => !Number.isNaN(event.date.getTime())).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [listings, subscription]);

  const cells = useMemo<Array<Date | null>>(() => {
    const first = startOfMonth(month);
    const result: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
    const totalDays = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= totalDays; day += 1) result.push(new Date(first.getFullYear(), first.getMonth(), day));
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [month]);

  const monthEvents = events.filter((event) => event.date.getFullYear() === month.getFullYear() && event.date.getMonth() === month.getMonth());
  const selectedDayEvents = monthEvents.filter((event) => sameDay(event.date, today));
  const monthLabel = new Intl.DateTimeFormat('en-KE', { month: 'long', year: 'numeric' }).format(month);

  const toneClass = (tone: CalendarEvent['tone']) => tone === 'success'
    ? 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-300'
    : tone === 'warning'
      ? 'bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300'
      : 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200';

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">PMS portfolio calendar</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Events are derived only from Django PMS listing and subscription records.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 dark:border-brand-700 dark:hover:bg-brand-800"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-36 text-center text-sm font-semibold text-gray-900 dark:text-white">{monthLabel}</span>
          <button type="button" aria-label="Next month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 dark:border-brand-700 dark:hover:bg-brand-800"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wide text-gray-400">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="py-2">{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, index) => {
          const dayEvents = cell ? monthEvents.filter((event) => sameDay(event.date, cell)) : [];
          const isToday = cell ? sameDay(cell, today) : false;
          return (
            <div key={cell ? cell.toISOString() : `empty-${index}`} className={`min-h-20 rounded-lg border p-1.5 ${cell ? 'border-gray-100 dark:border-brand-800' : 'border-transparent'} ${isToday ? 'ring-2 ring-brand-500 ring-inset' : ''}`}>
              {cell && <>
                <p className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400">{cell.getDate()}</p>
                <div className="mt-1 space-y-1">
                  {dayEvents.slice(0, 3).map((event, eventIndex) => <div key={`${event.label}-${eventIndex}`} className={`truncate rounded-md px-1.5 py-1 text-[10px] font-semibold ${toneClass(event.tone)}`} title={`${event.label}: ${event.detail}`}>{event.label}</div>)}
                  {dayEvents.length > 3 && <p className="text-[10px] text-gray-400">+{dayEvents.length - 3} more</p>}
                </div>
              </>}
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-brand-50 p-3 dark:bg-brand-800/60"><div className="flex items-center gap-2"><Home className="h-4 w-4 text-brand-600" /><p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Listing events</p></div><p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{monthEvents.filter((event) => event.label === 'Listing created').length}</p></div>
        <div className="rounded-xl bg-success-50 p-3 dark:bg-success-900/20"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-success-600" /><p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Subscription events</p></div><p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{monthEvents.filter((event) => event.label.startsWith('Subscription')).length}</p></div>
        <div className="rounded-xl bg-warning-50 p-3 dark:bg-warning-900/20"><div className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-warning-600" /><p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Today</p></div><p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{selectedDayEvents.length ? `${selectedDayEvents.length} event${selectedDayEvents.length === 1 ? '' : 's'}` : formatDate(today)}</p></div>
      </div>
    </section>
  );
}
