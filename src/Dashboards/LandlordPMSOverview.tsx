import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, CalendarDays, CheckCircle2, Clock3, CreditCard,
  FileText, Home, RefreshCw, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';

type RecordValue = Record<string, any>;

const money = (value: unknown) =>
  `KES ${Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const date = (value: unknown) => value
  ? new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(String(value)))
  : '—';

const status = (value: unknown) => String(value || '').trim().toUpperCase();

function Stat({ label, value, detail, icon: Icon, tone = 'default' }: {
  label: string; value: string | number; detail?: string;
  icon: typeof Home; tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = tone === 'success'
    ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300'
    : tone === 'warning'
      ? 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300'
      : tone === 'danger'
        ? 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300'
        : 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300';
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-brand-800 dark:bg-brand-950">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-2 truncate text-xl font-bold text-gray-900 dark:text-white">{value}</p>
          {detail && <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{detail}</p>}
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}><Icon className="h-5 w-5" /></span>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/50"><p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p><p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{value}</p></div>;
}

export default function LandlordPMSOverview() {
  const [data, setData] = useState<RecordValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { setData(await protectedGet<RecordValue>('/api/core/pms/dashboard/')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load the landlord PMS.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const stats = useMemo(() => {
    const units = Array.isArray(data?.units) ? data.units : [];
    const listings = Array.isArray(data?.listings) ? data.listings : [];
    const invoices = Array.isArray(data?.rentInvoices) ? data.rentInvoices : [];
    const payments = Array.isArray(data?.rentPayments) ? data.rentPayments : [];
    const notifications = Array.isArray(data?.notifications) ? data.notifications : [];
    const now = new Date();
    const occupied = units.filter((u: RecordValue) => Boolean(u.renter_assoc_id));
    const available = units.filter((u: RecordValue) => !u.renter_assoc_id && status(u.availability) === 'AVAILABLE');
    const paid = invoices.filter((i: RecordValue) => status(i.status) === 'PAID');
    const submitted = invoices.filter((i: RecordValue) => status(i.status) === 'PAYMENT_SUBMITTED');
    const overdue = invoices.filter((i: RecordValue) => status(i.status) !== 'PAID' && i.due_date && new Date(String(i.due_date)).getTime() < now.getTime());
    const dueThisMonth = invoices.filter((i: RecordValue) => status(i.status) !== 'PAID' && i.due_date && new Date(String(i.due_date)).getMonth() === now.getMonth() && new Date(String(i.due_date)).getFullYear() === now.getFullYear());
    const paidThisMonth = payments.filter((p: RecordValue) => status(p.status) === 'PAID' && (p.paid_at || p.created_at) && new Date(String(p.paid_at || p.created_at)).getMonth() === now.getMonth() && new Date(String(p.paid_at || p.created_at)).getFullYear() === now.getFullYear());
    const upcoming = invoices.filter((i: RecordValue) => status(i.status) !== 'PAID' && i.due_date).sort((a: RecordValue, b: RecordValue) => new Date(String(a.due_date)).getTime() - new Date(String(b.due_date)).getTime()).slice(0, 6);
    const invoiced = Number(data?.rentSummary?.total_invoiced_kes || 0);
    const collected = Number(data?.rentSummary?.total_payments_kes || 0);
    const collectionRate = invoiced > 0 ? Math.min(100, Math.round((collected / invoiced) * 100)) : 0;
    return { units, listings, invoices, payments, notifications, occupied, available, paid, submitted, overdue, dueThisMonth, paidThisMonth, upcoming, invoiced, collected, collectionRate, occupancy: units.length ? Math.round((occupied.length / units.length) * 100) : 0 };
  }, [data]);

  if (loading) return <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-gray-200 bg-white dark:border-brand-800 dark:bg-brand-950"><RefreshCw className="h-7 w-7 animate-spin text-brand-600" /></div>;

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-3xl bg-brand-950 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-200">Landlord PMS</p><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Property management command center</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-brand-100/80">Django is the source of truth. This overview only presents state returned by the PMS API.</p></div>
          <button type="button" onClick={() => void load()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15"><RefreshCw className="h-4 w-4" />Refresh</button>
        </div>
        {data?.subscription && <div className="mt-5 flex flex-wrap gap-2 text-xs text-brand-100"><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-semibold">{data.subscription.plan_name || 'PMS plan'}</span><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-semibold">{data.subscription.status || '—'}</span><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-semibold">Ends {date(data.subscription.current_period_end)}</span></div>}
        {error && <div className="mt-4 flex items-center gap-2 rounded-xl bg-error-500/15 px-4 py-3 text-sm text-red-100"><AlertTriangle className="h-4 w-4" />{error}</div>}
      </header>

      {!error && data && <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Stat label="Properties" value={stats.listings.length} icon={Home} />
          <Stat label="Total units" value={stats.units.length} icon={Building2} />
          <Stat label="Occupied" value={stats.occupied.length} detail={`${stats.occupancy}% occupancy`} icon={Users} tone="success" />
          <Stat label="Available" value={stats.available.length} icon={Home} tone="warning" />
          <Stat label="Pending invoices" value={stats.submitted.length + stats.overdue.length} detail={`${stats.submitted.length} awaiting confirmation`} icon={FileText} tone={stats.submitted.length ? 'warning' : 'default'} />
          <Stat label="Collected" value={money(stats.collected)} detail={`${stats.collectionRate}% collection`} icon={Wallet} tone="success" />
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Calendar statistics</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Rent schedule</h2></div><CalendarDays className="h-5 w-5 text-brand-600" /></div><div className="mt-5 grid grid-cols-2 gap-3"><Mini label="Due this month" value={stats.dueThisMonth.length} /><Mini label="Overdue" value={stats.overdue.length} /><Mini label="Paid this month" value={stats.paidThisMonth.length} /><Mini label="Submitted" value={stats.submitted.length} /></div></div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Financial statistics</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Rent collection</h2></div><TrendingUp className="h-5 w-5 text-brand-600" /></div><div className="mt-5 grid grid-cols-2 gap-3"><Mini label="Invoiced" value={money(stats.invoiced)} /><Mini label="Collected" value={money(stats.collected)} /><Mini label="Outstanding" value={money(Math.max(0, stats.invoiced - stats.collected))} /><Mini label="Collection rate" value={`${stats.collectionRate}%`} /></div></div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Action centre</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Needs attention</h2></div><Clock3 className="h-5 w-5 text-warning-600" /></div><div className="mt-5 grid grid-cols-2 gap-3"><Mini label="Payment reviews" value={Number(data.rentSummary?.pending_submission_count || stats.submitted.length)} /><Mini label="Overdue" value={stats.overdue.length} /><Mini label="Notifications" value={stats.notifications.filter((n: RecordValue) => !n.read).length} /><Mini label="Paid invoices" value={stats.paid.length} /></div></div>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950 lg:col-span-2"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Calendar</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Upcoming rent dates</h2></div><CalendarDays className="h-5 w-5 text-brand-600" /></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{stats.upcoming.map((invoice: RecordValue) => <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-3 dark:border-brand-800 dark:bg-brand-900/30"><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{invoice.invoice_number || 'Rent invoice'}</p><p className="truncate text-xs text-gray-500">Unit {invoice.unit_id || '—'}</p></div><div className="shrink-0 text-right"><p className="text-xs font-bold text-gray-900 dark:text-white">{date(invoice.due_date)}</p><p className="text-xs text-gray-500">{money(invoice.amount_kes)}</p></div></div>)}</div>{!stats.upcoming.length && <p className="py-6 text-center text-sm text-gray-500">No upcoming unpaid invoices.</p>}</div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950"><div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-brand-600" /><h2 className="font-bold text-gray-900 dark:text-white">Subscription</h2></div><div className="mt-4 grid grid-cols-2 gap-3"><Mini label="Plan" value={data.subscription?.plan_name || '—'} /><Mini label="Status" value={data.subscription?.status || '—'} /><Mini label="Listings" value={`${data.capacity?.listings_used ?? 0} / ${data.capacity?.max_listings ?? '—'}`} /><Mini label="Units / listing" value={data.capacity?.max_units_per_listing ?? '—'} /></div></div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-brand-600" /><h2 className="font-bold text-gray-900 dark:text-white">Property occupancy</h2></div><div className="mt-4 space-y-3">{stats.listings.slice(0, 6).map((listing: RecordValue) => { const rows = stats.units.filter((u: RecordValue) => String(u.listing_id) === String(listing.id)); const occupied = rows.filter((u: RecordValue) => Boolean(u.renter_assoc_id)).length; const percent = rows.length ? Math.round((occupied / rows.length) * 100) : 0; return <div key={listing.id}><div className="flex items-center justify-between text-sm"><span className="truncate font-semibold text-gray-900 dark:text-white">{listing.title || 'Property'}</span><span className="text-xs text-gray-500">{occupied}/{rows.length}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-brand-900"><div className="h-full rounded-full bg-brand-600" style={{ width: `${percent}%` }} /></div></div>; })}{!stats.listings.length && <p className="py-5 text-sm text-gray-500">No property data returned by Django.</p>}</div></div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success-600" /><h2 className="font-bold text-gray-900 dark:text-white">Recent confirmed payments</h2></div><div className="mt-4 space-y-3">{stats.payments.filter((p: RecordValue) => status(p.status) === 'PAID').slice(0, 5).map((payment: RecordValue) => <div key={payment.id} className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 last:border-0 dark:border-brand-800"><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{payment.provider_reference || payment.mpesa_receipt || 'Payment'}</p><p className="text-xs text-gray-500">{date(payment.paid_at || payment.created_at)}</p></div><p className="shrink-0 text-sm font-bold text-gray-900 dark:text-white">{money(payment.amount_kes)}</p></div>)}{!stats.payments.some((p: RecordValue) => status(p.status) === 'PAID') && <p className="py-5 text-sm text-gray-500">No confirmed payments yet.</p>}</div></div>
        </section>
      </>}
    </div>
  );
}
