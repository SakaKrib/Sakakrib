import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Home, ShieldCheck } from 'lucide-react';
import type { RealEstateDashboardData } from '@/lib/RealEstateTs/Realestateservice';
import { getRealEstatePMSCalendar, type RealEstatePMSCalendarEvent } from '@/lib/RealEstateTs/RealEstatePMSOperationsService';

type Listing = RealEstateDashboardData['listings'][number];
type CalendarEvent = {
  date: Date;
  label: string;
  detail: string;
  tone: 'brand' | 'success' | 'warning' | 'danger';
  type?: string;
};

const startOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);
const endOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth() + 1, 0);
const sameDay = (left: Date, right: Date) => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
const formatDate = (value: Date) => new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }).format(value);
const toDate = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const serverEventTone = (type: RealEstatePMSCalendarEvent['type']): CalendarEvent['tone'] => {
  if (type === 'PAYMENT_RECEIVED') return 'success';
  if (type === 'OVERDUE') return 'danger';
  if (type === 'RENT_DUE' || type === 'LEASE_END' || type === 'LEASE_RENEWAL') return 'warning';
  return 'brand';
};

export default function RealEstatePMSCalendar({
  listings,
  subscription,
}: {
  listings: Listing[];
  subscription: RealEstateDashboardData['subscription'];
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [serverEvents, setServerEvents] = useState<RealEstatePMSCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date();

  useEffect(() => {
    let active = true;
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    setLoading(true);
    setError(null);
    getRealEstatePMSCalendar(
      `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
      `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
    )
      .then((response) => {
        if (active) setServerEvents(response.events || []);
      })
      .catch(() => {
        if (active) {
          setServerEvents([]);
          setError('Unable to load lease and rent events right now.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month]);

  const events = useMemo<CalendarEvent[]>(() => {
    const rows: CalendarEvent[] = listings
      .filter((listing) => listing.created_at)
      .map((listing) => ({
        date: new Date(listing.created_at!),
        label: 'Listing created',
        detail: listing.title || 'Property listing',
        tone: 'brand',
        type: 'LISTING_CREATED',
      }));

    if (subscription?.current_period_start) {
      rows.push({
        date: new Date(subscription.current_period_start),
        label: 'Subscription started',
        detail: subscription.plan_name || 'PMS subscription',
        tone: 'success',
        type: 'SUBSCRIPTION',
      });
    }

    if (subscription?.current_period_end) {
      rows.push({
        date: new Date(subscription.current_period_end),
        label: 'Subscription renewal / expiry',
        detail: subscription.plan_name || 'PMS subscription',
        tone: 'warning',
        type: 'SUBSCRIPTION',
      });
    }

    serverEvents.forEach((event) => {
      const date = toDate(event.date);
      if (!date) return;
      rows.push({
        date,
        label: event.label,
        detail: event.detail,
        tone: serverEventTone(event.type),
        type: event.type,
      });
    });

    return rows
      .filter((event) => !Number.isNaN(event.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [listings, serverEvents, subscription]);

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

  const toneClass = (tone: CalendarEvent['tone']) => {
    if (tone === 'success') return 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-300';
    if (tone === 'warning') return 'bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300';
    if (tone === 'danger') return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    return 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200';
  };

  const leaseEvents = monthEvents.filter((event) => ['LEASE_START', 'LEASE_END', 'LEASE_RENEWAL'].includes(event.type || '')).length;
  const rentEvents = monthEvents.filter((event) => ['RENT_DUE', 'OVERDUE', 'PAYMENT_RECEIVED'].includes(event.type || '')).length;
  const subscriptionEvents = monthEvents.filter((event) => event.type === 'SUBSCRIPTION').length;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">PMS portfolio calendar</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Lease, rent, payment, listing, and subscription events from the existing Django PMS data.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 dark:border-brand-700 dark:hover:bg-brand-800"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-36 text-center text-sm font-semibold text-gray-900 dark:text-white">{monthLabel}</span>
          <button type="button" aria-label="Next month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 dark:border-brand-700 dark:hover:bg-brand-800"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {loading && <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Loading PMS events…</p>}
      {error && <p className="mt-3 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-900/20 dark:text-warning-300">{error}</p>}

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
                  {dayEvents.slice(0, 3).map((event, eventIndex) => <div key={`${event.type || event.label}-${eventIndex}`} className={`truncate rounded-md px-1.5 py-1 text-[10px] font-semibold ${toneClass(event.tone)}`} title={`${event.label}: ${event.detail}`}>{event.label}</div>)}
                  {dayEvents.length > 3 && <p className="text-[10px] text-gray-400">+{dayEvents.length - 3} more</p>}
                </div>
              </>}
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-brand-50 p-3 dark:bg-brand-800/60"><div className="flex items-center gap-2"><Home className="h-4 w-4 text-brand-600" /><p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Listing events</p></div><p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{monthEvents.filter((event) => event.type === 'LISTING_CREATED').length}</p></div>
        <div className="rounded-xl bg-success-50 p-3 dark:bg-success-900/20"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-success-600" /><p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Lease events</p></div><p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{leaseEvents}</p></div>
        <div className="rounded-xl bg-warning-50 p-3 dark:bg-warning-900/20"><div className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-warning-600" /><p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Rent & payments</p></div><p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{rentEvents}</p></div>
        <div className="rounded-xl bg-red-50 p-3 dark:bg-red-900/20"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" /><p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Today</p></div><p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{selectedDayEvents.length ? `${selectedDayEvents.length} event${selectedDayEvents.length === 1 ? '' : 's'}` : `${subscriptionEvents} subscription event${subscriptionEvents === 1 ? '' : 's'} this month`}</p></div>
      </div>

      <div className="mt-3 text-xs text-gray-400 dark:text-gray-500">Overdue events are highlighted separately so rent follow-up is visible from the calendar.</div>
    </section>
  );
}
