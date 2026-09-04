import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, BarChart3, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, FileText, MapPin, MessageCircle, RefreshCw, Truck, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { protectedGet } from '@/lib/djangoApi';
import { renterApi, type Booking, type RentInvoice } from '@/lib/Renter/renterApi';

const money = (value: number | null | undefined) => `KES ${(value ?? 0).toLocaleString('en-KE')}`;
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const statusClass = (status?: string | null) => {
  const s = status?.toUpperCase();
  if (['PAID', 'COMPLETED', 'RELEASED', 'CONFIRMED'].includes(s ?? '')) return 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400';
  if (['CANCELLED', 'REJECTED', 'REFUNDED'].includes(s ?? '')) return 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400';
  return 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400';
};

function PageShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const { navigate } = useNav();
  return <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mb-6"><button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to dashboard</button><h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{title}</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p></div>{children}</div>;
}

function Guard({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  const { navigate } = useNav();
  useEffect(() => { if (!loading && (!profile || profile.role !== 'renter')) navigate('home'); }, [loading, profile, navigate]);
  if (loading || !profile || profile.role !== 'renter') return <div className="flex min-h-[400px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div>;
  return <>{children}</>;
}

export function RenterInvoicesPage() {
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<RentInvoice[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (!profile?.id) return; setLoading(true); setError(null); try { setInvoices(await renterApi.getInvoices(profile.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load invoices.'); } finally { setLoading(false); } }, [profile?.id]);
  useEffect(() => { void load(); }, [load]);
  const outstanding = useMemo(() => invoices.filter(i => !['PAID','COMPLETED','SETTLED','CANCELLED','CANCELED'].includes(i.status?.toUpperCase() ?? '')).reduce((s, i) => s + i.amount_kes, 0), [invoices]);
  return <Guard><PageShell title="Rent & Invoices" description="Review your rent invoices, due dates, payment status, and payment records.">{loading ? <div className="flex min-h-[300px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div> : <><div className="mb-5 grid gap-4 sm:grid-cols-2"><div className="card p-5"><p className="text-xs text-gray-500 dark:text-gray-400">Invoices</p><p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{invoices.length}</p></div><div className="card p-5"><p className="text-xs text-gray-500 dark:text-gray-400">Outstanding</p><p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{money(outstanding)}</p></div></div>{error && <div className="mb-5 rounded-xl bg-error-50 p-4 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>}<div className="card overflow-hidden"><div className="border-b border-gray-100 p-5 dark:border-brand-800"><h2 className="font-bold text-gray-900 dark:text-white">Invoice history</h2></div>{invoices.length === 0 ? <div className="p-10 text-center"><FileText className="mx-auto h-9 w-9 text-gray-400" /><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No rent invoices found.</p></div> : <div className="divide-y divide-gray-100 dark:divide-brand-800">{invoices.map(invoice => <div key={invoice.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-gray-900 dark:text-white">{invoice.invoice_number}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{date(invoice.billing_period_start)} to {date(invoice.billing_period_end)} · Due {date(invoice.due_date)}</p></div><div className="sm:text-right"><p className="font-bold text-gray-900 dark:text-white">{money(invoice.amount_kes)}</p><span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(invoice.status)}`}>{invoice.status}</span></div></div>)}</div>}</div></>}</PageShell></Guard>;
}

export function RenterPaymentPage() {
  const { profile } = useAuth();
  const [associationId, setAssociationId] = useState<string | null>(null); const [rows, setRows] = useState<Array<{ id: string; amount_kes: number; period_year: number; period_month: number; status: string; payment_provider: string | null; payment_method: string | null; mpesa_receipt: string | null; paid_at: string | null; created_at: string }>>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (!profile?.id) return; setLoading(true); setError(null); try { const dashboard = await renterApi.getDashboard(profile.id); setAssociationId(dashboard.association?.id ?? null); if (dashboard.association?.id) setRows(await renterApi.getPaymentHistory(dashboard.association.id)); else setRows([]); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load payment history.'); } finally { setLoading(false); } }, [profile?.id]);
  useEffect(() => { void load(); }, [load]);
  return <Guard><PageShell title="Payment History" description="Confirmed rent payments recorded against your rental association.">{loading ? <div className="flex min-h-[300px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div> : <>{error && <div className="mb-5 rounded-xl bg-error-50 p-4 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>} {!associationId ? <div className="card p-10 text-center"><Wallet className="mx-auto h-9 w-9 text-gray-400" /><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No rental association is linked to this account.</p></div> : <div className="card overflow-hidden"><div className="border-b border-gray-100 p-5 dark:border-brand-800"><h2 className="font-bold text-gray-900 dark:text-white">Payment records</h2></div>{rows.length === 0 ? <div className="p-10 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-gray-400" /><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No payment history yet.</p></div> : <div className="divide-y divide-gray-100 dark:divide-brand-800">{rows.map(row => <div key={row.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-gray-900 dark:text-white">{row.period_year}-{String(row.period_month).padStart(2, '0')}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{row.payment_provider || row.payment_method || 'Payment'}{row.mpesa_receipt ? ` · Receipt ${row.mpesa_receipt}` : ''}</p></div><div className="sm:text-right"><p className="font-bold text-gray-900 dark:text-white">{money(row.amount_kes)}</p><span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>{row.status}</span></div></div>)}</div>}</div>}</>}</PageShell></Guard>;
}

interface ChatPerformanceDay { day: number; sent: number; received: number; total: number; }
interface ChatPerformance { year: number; month: number; total_messages: number; sent_messages: number; received_messages: number; active_conversations: number; last_message_at: string | null; daily: ChatPerformanceDay[]; }

const monthLabel = (year: number, month: number) => new Date(year, month - 1, 1).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });

export function RenterCalendarPage() {
  const { profile } = useAuth(); const { navigate } = useNav();
  const today = new Date();
  const [data, setData] = useState<{ invoices: RentInvoice[]; bookings: Booking[] }>({ invoices: [], bookings: [] });
  const [performance, setPerformance] = useState<ChatPerformance | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [activePanel, setActivePanel] = useState<'activities' | 'chat'>('activities');
  const [loading, setLoading] = useState(true); const [performanceLoading, setPerformanceLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [performanceError, setPerformanceError] = useState<string | null>(null);

  const load = useCallback(async () => { if (!profile?.id) return; setLoading(true); setError(null); try { setData(await renterApi.getCalendar(profile.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load calendar.'); } finally { setLoading(false); } }, [profile?.id]);
  useEffect(() => { void load(); }, [load]);

  const loadPerformance = useCallback(async () => {
    if (!profile?.id) return;
    setPerformanceLoading(true); setPerformanceError(null);
    try {
      const result = await protectedGet<ChatPerformance>(`/api/core/renter/chat-performance/?year=${selectedMonth.getFullYear()}&month=${selectedMonth.getMonth() + 1}`);
      setPerformance(result);
    } catch (e) { setPerformanceError(e instanceof Error ? e.message : 'Unable to load chat performance.'); setPerformance(null); }
    finally { setPerformanceLoading(false); }
  }, [profile?.id, selectedMonth]);
  useEffect(() => { void loadPerformance(); }, [loadPerformance]);

  const events = useMemo(() => [...data.bookings.filter(b => b.moving_date).map(b => ({ id: `move-${b.id}`, date: b.moving_date as string, title: 'Moving service', detail: `${b.pickup_address} → ${b.dropoff_address}`, action: () => navigate('mover-tracking', b.id), icon: Truck })), ...data.invoices.filter(i => i.due_date).map(i => ({ id: `invoice-${i.id}`, date: i.due_date, title: 'Rent due', detail: `${i.invoice_number} · ${money(i.amount_kes)}`, action: () => navigate('renter-invoices'), icon: Wallet }))].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [data, navigate]);

  const activities = useMemo(() => [...data.bookings.map(b => ({ id: `booking-${b.id}`, date: b.updated_at || b.created_at || b.moving_date, title: `Moving booking ${b.status}`, detail: `${b.pickup_address} → ${b.dropoff_address}`, icon: Truck, action: () => navigate('mover-tracking', b.id) })), ...data.invoices.map(i => ({ id: `invoice-${i.id}`, date: i.updated_at || i.created_at || i.due_date, title: `Invoice ${i.status}`, detail: `${i.invoice_number} · ${money(i.amount_kes)}`, icon: Wallet, action: () => navigate('renter-invoices') }))].filter(item => item.date).sort((a,b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime()).slice(0, 6), [data, navigate]);

  const maxDaily = Math.max(1, ...(performance?.daily.map(day => day.total) ?? [1]));
  const changeMonth = (delta: number) => setSelectedMonth(current => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return <Guard><PageShell title="Renter Calendar" description="Your upcoming rent due dates, moving dates, activities, and monthly chat performance.">
    {loading ? <div className="flex min-h-[300px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div> : <>
      {error && <div className="mb-5 rounded-xl bg-error-50 p-4 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)] lg:items-start">
        <div className="card overflow-hidden">
          <div className="border-b border-gray-100 p-5 dark:border-brand-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-brand-500" /><div><h2 className="font-bold text-gray-900 dark:text-white">Upcoming events</h2><p className="text-xs text-gray-500 dark:text-gray-400">Rent and moving commitments</p></div></div>
              <button type="button" onClick={() => { void load(); void loadPerformance(); }} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-brand-700 dark:text-gray-200 dark:hover:bg-brand-900/40"><RefreshCw className="h-4 w-4" /> Refresh</button>
            </div>
          </div>
          {events.length === 0 ? <div className="p-10 text-center"><CalendarDays className="mx-auto h-9 w-9 text-gray-400" /><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No upcoming renter events.</p></div> : <div className="divide-y divide-gray-100 dark:divide-brand-800">{events.map(event => { const Icon = event.icon; return <button key={event.id} type="button" onClick={event.action} className="flex w-full items-start gap-4 p-5 text-left hover:bg-gray-50 dark:hover:bg-brand-900/30"><div className="mt-0.5 rounded-lg bg-brand-50 p-2 dark:bg-brand-900/40"><Icon className="h-4 w-4 text-brand-500" /></div><div className="w-24 shrink-0"><p className="text-xs font-semibold text-brand-600 dark:text-brand-400">{date(event.date)}</p></div><div className="min-w-0"><p className="font-semibold text-gray-900 dark:text-white">{event.title}</p><p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{event.detail}</p></div></button>; })}</div>}
        </div>

        <div className="space-y-5">
          <div className="card overflow-hidden">
            <div className="border-b border-gray-100 dark:border-brand-800"><div className="flex"><button type="button" onClick={() => setActivePanel('activities')} className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold ${activePanel === 'activities' ? 'border-b-2 border-brand-500 text-brand-600 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'}`}><Activity className="h-4 w-4" /> Activities</button><button type="button" onClick={() => setActivePanel('chat')} className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold ${activePanel === 'chat' ? 'border-b-2 border-brand-500 text-brand-600 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'}`}><BarChart3 className="h-4 w-4" /> Chat performance</button></div></div>
            {activePanel === 'activities' ? <div className="p-4">{activities.length === 0 ? <div className="py-8 text-center"><Activity className="mx-auto h-8 w-8 text-gray-400" /><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No recent activities.</p></div> : <div className="space-y-2">{activities.map(item => { const Icon = item.icon; return <button key={item.id} type="button" onClick={item.action} className="flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-gray-50 dark:hover:bg-brand-900/30"><span className="mt-0.5 rounded-lg bg-brand-50 p-2 dark:bg-brand-900/40"><Icon className="h-4 w-4 text-brand-500" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">{item.title}</span><span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{item.detail}</span><span className="mt-1 block text-[11px] text-gray-400">{date(String(item.date))}</span></span></button>; })}</div>}</div> : <div className="p-4">
              <div className="mb-4 flex items-center justify-between gap-2"><button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 dark:border-brand-700 dark:hover:bg-brand-900/40"><ChevronLeft className="h-4 w-4" /></button><div className="text-center"><p className="text-sm font-bold text-gray-900 dark:text-white">{monthLabel(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1)}</p><p className="text-[11px] text-gray-500 dark:text-gray-400">Messages exchanged</p></div><button type="button" onClick={() => changeMonth(1)} aria-label="Next month" className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 dark:border-brand-700 dark:hover:bg-brand-900/40"><ChevronRight className="h-4 w-4" /></button></div>
              {performanceLoading ? <div className="flex min-h-[180px] items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-brand-500" /></div> : performanceError ? <div className="rounded-xl bg-error-50 p-4 text-xs text-error-700 dark:bg-error-900/20 dark:text-error-400">{performanceError}</div> : performance ? <><div className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-brand-50 p-3 text-center dark:bg-brand-900/30"><p className="text-lg font-bold text-gray-900 dark:text-white">{performance.total_messages}</p><p className="text-[10px] text-gray-500 dark:text-gray-400">Messages</p></div><div className="rounded-xl bg-brand-50 p-3 text-center dark:bg-brand-900/30"><p className="text-lg font-bold text-gray-900 dark:text-white">{performance.sent_messages}</p><p className="text-[10px] text-gray-500 dark:text-gray-400">Sent</p></div><div className="rounded-xl bg-brand-50 p-3 text-center dark:bg-brand-900/30"><p className="text-lg font-bold text-gray-900 dark:text-white">{performance.active_conversations}</p><p className="text-[10px] text-gray-500 dark:text-gray-400">Chats</p></div></div><div className="mt-4"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Daily activity</p><span className="text-[10px] text-gray-400">Received {performance.received_messages}</span></div><div className="flex h-28 items-end gap-1 overflow-hidden">{performance.daily.map(day => <div key={day.day} className="group flex h-full min-w-0 flex-1 items-end" title={`Day ${day.day}: ${day.total} messages`}><div className="w-full rounded-t-sm bg-brand-500/70 transition-all group-hover:bg-brand-500" style={{ height: `${Math.max(day.total ? 8 : 2, (day.total / maxDaily) * 100)}%` }} /></div>)}</div><div className="mt-1 flex justify-between text-[9px] text-gray-400"><span>1</span><span>{performance.daily.length}</span></div></div><button type="button" onClick={() => navigate('chat')} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 px-3 py-2 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-400 dark:hover:bg-brand-900/30"><MessageCircle className="h-4 w-4" /> Open chat</button></> : null}
            </div>}
          </div>
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 dark:border-brand-800 dark:bg-brand-900/20"><div className="flex items-start gap-3"><Activity className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" /><div><p className="text-sm font-semibold text-gray-900 dark:text-white">Calendar insights</p><p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">Use Activities for your latest renter actions, or switch to Chat performance to review message activity month by month.</p></div></div></div>
        </div>
      </div>
    </>}</PageShell></Guard>;
}

export function RenterMovingHistoryPage() {
  const { profile } = useAuth(); const { navigate } = useNav();
  const [bookings, setBookings] = useState<Booking[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (!profile?.id) return; setLoading(true); setError(null); try { setBookings(await renterApi.getBookings(profile.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load moving history.'); } finally { setLoading(false); } }, [profile?.id]);
  useEffect(() => { void load(); }, [load]);
  return <Guard><PageShell title="Moving History" description="Your mover bookings, destinations, dates, and payment status.">{loading ? <div className="flex min-h-[300px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div> : <>{error && <div className="mb-5 rounded-xl bg-error-50 p-4 text-sm text-error-700">{error}</div>}<div className="card overflow-hidden">{bookings.length === 0 ? <div className="p-10 text-center"><Truck className="mx-auto h-9 w-9 text-gray-400" /><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No moving bookings found.</p></div> : <div className="divide-y divide-gray-100 dark:divide-brand-800">{bookings.map(booking => <button key={booking.id} type="button" onClick={() => navigate('mover-tracking', booking.id)} className="flex w-full flex-col gap-3 p-5 text-left hover:bg-gray-50 dark:hover:bg-brand-900/30 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-brand-500" /><p className="truncate font-semibold text-gray-900 dark:text-white">{booking.pickup_address} → {booking.dropoff_address}</p></div><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{date(booking.moving_date)} · Booking {booking.id.slice(0, 8)}</p></div><div className="flex items-center gap-2 sm:shrink-0"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(booking.status)}`}>{booking.status}</span><span className="text-sm font-semibold text-gray-900 dark:text-white">{money(booking.total_amount)}</span></div></button>)}</div>}</div></>}</PageShell></Guard>;
}
