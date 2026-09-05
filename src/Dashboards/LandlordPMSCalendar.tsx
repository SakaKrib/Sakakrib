import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Home, KeyRound } from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';

type RecordValue = Record<string, any>;
type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  detail: string;
  kind: 'invoice' | 'lease_start' | 'lease_end';
  status?: string;
  amount?: number;
};

const money = (value: unknown) =>
  `KES ${Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

const status = (value: unknown) => String(value || '').trim().toUpperCase();

const formatDate = (value: unknown) => value
  ? new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(new Date(String(value)))
  : '—';

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function eventTone(event: CalendarEvent) {
  if (event.kind === 'lease_end') return 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300';
  if (event.kind === 'lease_start') return 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300';
  if (status(event.status) === 'PAID') return 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300';
  if (status(event.status) === 'PAYMENT_SUBMITTED') return 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300';
  return 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300';
}

export default function LandlordPMSCalendar() {
  const [data, setData] = useState<RecordValue | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    protectedGet<RecordValue>('/api/core/pms/dashboard/')
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load the PMS calendar.'); });
    return () => { cancelled = true; };
  }, []);

  const invoices = Array.isArray(data?.rentInvoices) ? data.rentInvoices : [];
  const units = Array.isArray(data?.units) ? data.units : [];

  const events = useMemo<CalendarEvent[]>(() => {
    const invoiceEvents: CalendarEvent[] = invoices
      .filter((invoice: RecordValue) => invoice.due_date)
      .map((invoice: RecordValue) => ({
        id: `invoice-${invoice.id}`,
        date: String(invoice.due_date),
        title: `Rent due · ${invoice.invoice_number || 'Invoice'}`,
        detail: `${invoice.renter_name || 'Renter'} · Unit ${invoice.unit_number || invoice.unit_id || '—'}`,
        kind: 'invoice',
        status: invoice.status,
        amount: Number(invoice.amount_kes || 0),
      }));

    const leaseEvents: CalendarEvent[] = [];
    units.forEach((unit: RecordValue) => {
      const renter = unit.renter_name || 'Renter';
      const unitLabel = `Unit ${unit.unit_number || unit.unit_id || '—'}`;
      if (unit.lease_start) {
        leaseEvents.push({
          id: `lease-start-${unit.unit_id}`,
          date: String(unit.lease_start),
          title: `Lease starts · ${unitLabel}`,
          detail: `${renter} · ${unit.listing_title || 'Property'}`,
          kind: 'lease_start',
        });
      }
      if (unit.lease_end) {
        leaseEvents.push({
          id: `lease-end-${unit.unit_id}`,
          date: String(unit.lease_end),
          title: `Lease ends · ${unitLabel}`,
          detail: `${renter} · ${unit.listing_title || 'Property'}`,
          kind: 'lease_end',
        });
      }
    });

    if (data?.subscription?.current_period_end) {
      leaseEvents.push({
        id: 'subscription-period-end',
        date: String(data.subscription.current_period_end),
        title: 'PMS subscription period ends',
        detail: data.subscription.plan_name || 'Current PMS plan',
        kind: 'lease_end',
      });
    }

    return [...invoiceEvents, ...leaseEvents].filter((event) => {
      const parsed = new Date(event.date);
      return !Number.isNaN(parsed.getTime());
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data?.subscription?.current_period_end, data?.subscription?.plan_name, invoices, units]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      const parsed = new Date(event.date);
      const key = `${parsed.getFullYear()}-${parsed.getMonth()}-${parsed.getDate()}`;
      const existing = map.get(key) || [];
      existing.push(event);
      map.set(key, existing);
    });
    return map;
  }, [events]);

  const selectedEvents = useMemo(() => {
    const key = `${selectedDay.getFullYear()}-${selectedDay.getMonth()}-${selectedDay.getDate()}`;
    return eventsByDay.get(key) || [];
  }, [eventsByDay, selectedDay]);

  const moveMonth = (delta: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  if (error) return <div className="rounded-2xl border border-error-200 bg-error-50 p-5 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-300">{error}</div>;
  if (!data) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-brand-800 dark:bg-brand-950">Loading calendar...</div>;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Django PMS calendar</p>
          <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Property, lease & rent schedule</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Every event is derived from the landlord's Django PMS state.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => moveMonth(-1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 dark:border-brand-800 dark:hover:bg-brand-900" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <div className="min-w-36 text-center text-sm font-bold text-gray-900 dark:text-white">{new Intl.DateTimeFormat('en-KE', { month: 'long', year: 'numeric' }).format(month)}</div>
          <button type="button" onClick={() => moveMonth(1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 dark:border-brand-800 dark:hover:bg-brand-900" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold">
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300"><CircleDollarSign className="h-3.5 w-3.5" /> Rent</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-success-700 dark:bg-success-900/20 dark:text-success-300"><KeyRound className="h-3.5 w-3.5" /> Lease start</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-1 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"><Home className="h-3.5 w-3.5" /> Lease end</span>
      </div>

      <div className="mt-4 grid grid-cols-7 overflow-hidden rounded-xl border border-gray-200 dark:border-brand-800">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => <div key={label} className="border-b border-gray-200 bg-gray-50 px-2 py-2 text-center text-[11px] font-bold uppercase text-gray-500 dark:border-brand-800 dark:bg-brand-900/50">{label}</div>)}
        {days.map((day) => {
          const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
          const dayEvents = eventsByDay.get(key) || [];
          const inMonth = day.getMonth() === month.getMonth();
          const selected = sameDay(day, selectedDay);
          const today = sameDay(day, new Date());
          return (
            <button key={key} type="button" onClick={() => setSelectedDay(day)} className={`min-h-24 border-r border-b border-gray-200 p-2 text-left transition dark:border-brand-800 ${inMonth ? 'bg-white dark:bg-brand-950' : 'bg-gray-50/70 dark:bg-brand-900/20'} ${selected ? 'ring-2 ring-inset ring-brand-500' : 'hover:bg-brand-50/50 dark:hover:bg-brand-900/40'}`}>
              <div className="flex items-center justify-between"><span className={`text-xs font-semibold ${today ? 'flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white' : inMonth ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400'}`}>{day.getDate()}</span>{dayEvents.length > 0 && <span className="rounded-full bg-brand-100 px-1.5 text-[10px] font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">{dayEvents.length}</span>}</div>
              <div className="mt-2 space-y-1">{dayEvents.slice(0, 2).map((event) => <div key={event.id} className={`truncate rounded px-1.5 py-1 text-[10px] font-semibold ${eventTone(event)}`}>{event.kind === 'invoice' ? `${event.title} · ${money(event.amount)}` : event.title}</div>)}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-brand-800 dark:bg-brand-900/30">
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-brand-600" /><p className="text-sm font-bold text-gray-900 dark:text-white">{new Intl.DateTimeFormat('en-KE', { dateStyle: 'full' }).format(selectedDay)}</p></div>
        <div className="mt-3 space-y-2">
          {selectedEvents.map((event) => (
            <div key={event.id} className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between dark:border-brand-800 dark:bg-brand-950">
              <div className="min-w-0"><p className="text-sm font-semibold text-gray-900 dark:text-white">{event.title}</p><p className="text-xs text-gray-500">{event.detail} · {formatDate(event.date)}</p></div>
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">{event.kind === 'invoice' ? <><CircleDollarSign className="h-4 w-4 text-brand-600" />{money(event.amount)}</> : <><KeyRound className="h-4 w-4 text-brand-600" />{event.kind === 'lease_start' ? 'Lease start' : 'Lease milestone'}</>}</div>
            </div>
          ))}
          {!selectedEvents.length && <p className="text-sm text-gray-500">No PMS events on this date.</p>}
        </div>
      </div>
    </section>
  );
}
