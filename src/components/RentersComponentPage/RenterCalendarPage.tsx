import { useCallback, useEffect, useMemo, useState } from 'react';
import DatePicker from 'react-datepicker';
import type { ReactDatePickerCustomHeaderProps } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '@/pages/calendarIndex.css';
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Truck, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { renterApi, type Booking, type RentInvoice } from '@/lib/Renter/renterApi';

const dayKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const status = (value: string | null | undefined) => String(value ?? '').trim().toUpperCase();
const money = (value: number | null | undefined) => `KES ${(value ?? 0).toLocaleString('en-KE')}`;
const displayDate = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const isOpenBooking = (value: string | null | undefined) => ['PENDING', 'CONFIRMED', 'ACCEPTED', 'IN_PROGRESS', 'IN-PROGRESS', 'ONGOING'].includes(status(value));

export default function RenterCalendarPage() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [data, setData] = useState<{ invoices: RentInvoice[]; bookings: Booking[] }>({ invoices: [], bookings: [] });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id || profile.role !== 'renter') return;
    setLoading(true);
    setError(null);
    try {
      setData(await renterApi.getCalendar(profile.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your calendar.');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.role]);

  useEffect(() => { void load(); }, [load]);

  const monthDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const leading = (first.getDay() + 6) % 7;
    return Array.from({ length: leading + last.getDate() }, (_, index) => index < leading ? null : new Date(month.getFullYear(), month.getMonth(), index - leading + 1));
  }, [month]);

  const events = useMemo(() => [
    ...data.bookings.filter((booking) => booking.moving_date).map((booking) => ({
      id: `move-${booking.id}`,
      date: booking.moving_date as string,
      title: 'Moving service',
      detail: `${booking.pickup_address} → ${booking.dropoff_address}`,
      booking,
      type: 'move' as const,
    })),
    ...data.invoices.filter((invoice) => invoice.due_date && !['PAID', 'COMPLETED', 'SETTLED', 'CANCELLED', 'CANCELED'].includes(status(invoice.status))).map((invoice) => ({
      id: `invoice-${invoice.id}`,
      date: invoice.due_date,
      title: 'Rent due',
      detail: `${invoice.invoice_number} · ${money(invoice.amount_kes)}`,
      invoice,
      type: 'rent' as const,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [data]);

  const eventsForDate = useMemo(() => events.filter((event) => dayKey(new Date(event.date)) === dayKey(selectedDate)), [events, selectedDate]);

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  const openEvent = (event: (typeof events)[number]) => {
    if (event.type === 'rent') {
      navigate('renter-invoices');
      return;
    }
    if (isOpenBooking(event.booking.status)) {
      navigate('mover-tracking', event.booking.id);
    } else {
      navigate('renter-moving-history');
    }
  };

  if (!profile || profile.role !== 'renter') return null;

  return (
    <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6">
        <button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to renter dashboard</button>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Renter Calendar</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Keep your rent due dates and moving commitments in one place.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </div>
      </div>

      {error && <div className="mb-5 rounded-xl bg-error-50 p-4 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>}

      {loading ? <div className="card flex min-h-[450px] items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-brand-500" /></div> : (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">Your schedule</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Select a date to see the rent or moving activity scheduled for that day.</p>
            </div>
            <CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[auto_1fr]">
            <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-brand-800 dark:bg-brand-900">
              <DatePicker
                selected={selectedDate}
                onChange={(date: Date | null) => { if (date) selectDate(date); }}
                inline
                calendarClassName="sakakrib-calendar"
                minDate={new Date()}
                onMonthChange={(date) => setMonth(new Date(date.getFullYear(), date.getMonth(), 1))}
                renderCustomHeader={(props: ReactDatePickerCustomHeaderProps) => {
                  const { date, decreaseMonth, increaseMonth, prevMonthButtonDisabled, nextMonthButtonDisabled } = props;
                  return <div className="flex items-center justify-between px-2 py-1">
                    <button type="button" onClick={decreaseMonth} disabled={prevMonthButtonDisabled} aria-label="Previous month" className="rounded-md p-1 hover:bg-brand-200 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                    <span className="text-sm font-semibold text-brand-900 dark:text-white">{date.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}</span>
                    <button type="button" onClick={increaseMonth} disabled={nextMonthButtonDisabled} aria-label="Next month" className="rounded-md p-1 hover:bg-brand-200 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                  </div>;
                }}
              />
            </div>

            <div className="min-w-0">
              <div className="mb-3 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {monthDays.map((date, index) => {
                  if (!date) return <div key={`empty-${index}`} className="min-h-16" />;
                  const key = dayKey(date);
                  const count = events.filter((event) => dayKey(new Date(event.date)) === key).length;
                  const selected = key === dayKey(selectedDate);
                  return <button key={key} type="button" onClick={() => selectDate(date)} className={`min-h-16 rounded-xl border p-2 text-left transition ${selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-gray-200 bg-white hover:border-brand-300 dark:border-brand-800 dark:bg-brand-900'}`}>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{date.getDate()}</span>
                    {count > 0 && <span className="mt-1 block text-xs font-semibold text-brand-600 dark:text-brand-400">{count} event{count === 1 ? '' : 's'}</span>}
                  </button>;
                })}
              </div>

              <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-brand-800">
                <div className="flex items-center justify-between gap-3">
                  <div><h3 className="font-semibold text-gray-900 dark:text-white">{selectedDate.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Renter events</p></div>
                  <button type="button" onClick={() => selectDate(new Date())} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">Today</button>
                </div>
                {eventsForDate.length === 0 ? <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No rent or moving events for this date.</p> : <div className="mt-4 space-y-2">{eventsForDate.map((event) => {
                  const Icon = event.type === 'move' ? Truck : Wallet;
                  return <button key={event.id} type="button" onClick={() => openEvent(event)} className="w-full rounded-xl bg-brand-50 p-3 text-left transition hover:bg-brand-100 dark:bg-brand-900/30 dark:hover:bg-brand-900/50">
                    <div className="flex items-start gap-3"><span className="rounded-lg bg-white p-2 dark:bg-brand-950"><Icon className="h-4 w-4 text-brand-600 dark:text-brand-400" /></span><div className="min-w-0"><p className="text-sm font-semibold text-brand-800 dark:text-brand-200">{event.title}</p><p className="mt-1 truncate text-xs text-gray-600 dark:text-gray-300">{event.detail}</p>{event.type === 'move' && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Status: {event.booking.status}</p>}</div></div>
                  </button>;
                })}</div>}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
