import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, RefreshCw, Truck, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { renterApi, type Booking, type RentInvoice } from '@/lib/Renter/renterApi';

const money = (value: number | null | undefined) => `KES ${(value ?? 0).toLocaleString('en-KE')}`;
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function RenterCalendarPage() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [data, setData] = useState<{ invoices: RentInvoice[]; bookings: Booking[] }>({ invoices: [], bookings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true); setError(null);
    try { setData(await renterApi.getCalendar(profile.id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load calendar.'); }
    finally { setLoading(false); }
  }, [profile?.id]);

  useEffect(() => { void load(); }, [load]);

  const events = useMemo(() => [
    ...data.bookings.filter(b => b.moving_date).map(b => ({ id: `move-${b.id}`, date: b.moving_date as string, title: 'Moving service', detail: `${b.pickup_address} → ${b.dropoff_address}`, action: () => navigate('mover-tracking', b.id), icon: Truck })),
    ...data.invoices.filter(i => i.due_date).map(i => ({ id: `invoice-${i.id}`, date: i.due_date, title: 'Rent due', detail: `${i.invoice_number} · ${money(i.amount_kes)}`, action: () => navigate('renter-invoices'), icon: Wallet })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [data, navigate]);

  return <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8">
    <div className="mb-6"><button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to dashboard</button><h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Calendar</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your rent due dates and moving commitments.</p></div>
    <div className="card overflow-hidden"><div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-brand-800"><div className="flex items-center gap-3"><span className="rounded-xl bg-brand-50 p-2 dark:bg-brand-900/40"><CalendarDays className="h-5 w-5 text-brand-500" /></span><div><h2 className="font-bold text-gray-900 dark:text-white">Upcoming events</h2><p className="text-xs text-gray-500 dark:text-gray-400">Rent and moving dates</p></div></div><button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary inline-flex items-center gap-2 text-xs"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>{loading ? <div className="flex min-h-[350px] items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-brand-500" /></div> : error ? <div className="p-8"><div className="rounded-xl bg-error-50 p-4 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div></div> : events.length === 0 ? <div className="p-12 text-center"><CalendarDays className="mx-auto h-10 w-10 text-gray-400" /><p className="mt-3 font-semibold text-gray-900 dark:text-white">No upcoming events</p><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your rent and moving dates will appear here.</p></div> : <div className="divide-y divide-gray-100 dark:divide-brand-800">{events.map(event => { const Icon = event.icon; return <button key={event.id} type="button" onClick={event.action} className="flex w-full items-start gap-4 p-5 text-left hover:bg-gray-50 dark:hover:bg-brand-900/30"><span className="rounded-xl bg-brand-50 p-2 dark:bg-brand-900/40"><Icon className="h-4 w-4 text-brand-500" /></span><span className="w-24 shrink-0 text-xs font-semibold text-brand-600 dark:text-brand-400">{date(event.date)}</span><span className="min-w-0"><span className="block font-semibold text-gray-900 dark:text-white">{event.title}</span><span className="mt-1 block truncate text-sm text-gray-500 dark:text-gray-400">{event.detail}</span></span></button>; })}</div>}</div>
  </div>;
}
