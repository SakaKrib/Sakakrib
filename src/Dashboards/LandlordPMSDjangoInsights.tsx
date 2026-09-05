import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Home,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';
import LandlordPMS from './LandlordPMS';

type RecordValue = Record<string, any>;

const money = (value: unknown) =>
  `KES ${Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const date = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short' }).format(new Date(String(value)))
    : '—';

const sameMonth = (value: unknown, now: Date) => {
  if (!value) return false;
  const d = new Date(String(value));
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

function StatCard({ label, value, icon: Icon, tone = 'default' }: { label: string; value: string | number; icon: typeof Home; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
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
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/50">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

export default function LandlordPMSDjangoInsights() {
  const [data, setData] = useState<RecordValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const dashboard = await protectedGet<RecordValue>('/api/core/pms/dashboard/');
      setData(dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load landlord PMS data.');
    } finally {
      setLoading(false);
    }
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
    const available = units.filter((u: RecordValue) => !u.renter_assoc_id && String(u.availability || '').toLowerCase() === 'available');
    const paid = invoices.filter((i: RecordValue) => String(i.status || '').toUpperCase() === 'PAID');
    const submitted = invoices.filter((i: RecordValue) => String(i.status || '').toUpperCase() === 'PAYMENT_SUBMITTED');
    const overdue = invoices.filter((i: RecordValue) => {
      const status = String(i.status || '').toUpperCase();
      return status !== 'PAID' && i.due_date && new Date(String(i.due_date)).getTime() < now.getTime();
    });
    const dueThisMonth = invoices.filter((i: RecordValue) => sameMonth(i.due_date, now) && String(i.status || '').toUpperCase() !== 'PAID');
    const paidThisMonth = payments.filter((p: RecordValue) => sameMonth(p.paid_at || p.created_at, now) && String(p.status || '').toUpperCase() === 'PAID');
    const upcoming = invoices
      .filter((i: RecordValue) => i.due_date && String(i.status || '').toUpperCase() !== 'PAID')
      .sort((a: RecordValue, b: RecordValue) => new Date(String(a.due_date)).getTime() - new Date(String(b.due_date)).getTime())
      .slice(0, 6);
    const occupancy = units.length ? Math.round((occupied.length / units.length) * 100) : 0;
    const invoiced = Number(data?.rentSummary?.total_invoiced_kes || 0);
    const collected = Number(data?.rentSummary?.total_payments_kes || 0);
    const collectionRate = invoiced > 0 ? Math.min(100, Math.round((collected / invoiced) * 100)) : 0;

    return {
      units, listings, invoices, paid, submitted, overdue, dueThisMonth, paidThisMonth,
      upcoming, occupied, available, occupancy, collectionRate, notifications,
    };
  }, [data]);

  return (
    <div className="mt-6 space-y-6">
      <header className="rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 p-6 text-white shadow-lg dark:border-brand-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-200">Landlord PMS</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Property management command center</h1>
            <p className="mt-1 max-w-3xl text-sm text-brand-100/80">The dashboard is built from Django's authoritative PMS response. The frontend presents the state; Django owns access, capacity, renter associations, invoices and payment status.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        {error && <div className="mt-4 flex items-center gap-2 rounded-xl bg-error-500/15 px-4 py-3 text-sm text-red-100"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
      </header>

      {!loading && data && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Properties" value={stats.listings.length} icon={Home} />
            <StatCard label="Total units" value={stats.units.length} icon={Building2} />
            <StatCard label="Occupied" value={`${stats.occupied.length} · ${stats.occupancy}%`} icon={Users} tone="success" />
            <StatCard label="Available" value={stats.available.length} icon={Home} tone="warning" />
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Calendar statistics</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Rent schedule</h2></div><CalendarDays className="h-5 w-5 text-brand-600" /></div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <MiniStat label="Due this month" value={stats.dueThisMonth.length} />
                <MiniStat label="Overdue" value={stats.overdue.length} />
                <MiniStat label="Paid this month" value={stats.paidThisMonth.length} />
                <MiniStat label="Payment submitted" value={stats.submitted.length} />
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Financial statistics</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Rent collection</h2></div><Wallet className="h-5 w-5 text-brand-600" /></div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <MiniStat label="Invoiced" value={money(data.rentSummary?.total_invoiced_kes)} />
                <MiniStat label="Collected" value={money(data.rentSummary?.total_payments_kes)} />
                <MiniStat label="Collection rate" value={`${stats.collectionRate}%`} />
                <MiniStat label="Pending" value={stats.invoices.filter((i: RecordValue) => ['DUE','PAYMENT_SUBMITTED','PENDING'].includes(String(i.status || '').toUpperCase())).length} />
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Action centre</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Needs attention</h2></div><Clock3 className="h-5 w-5 text-warning-600" /></div>
              <div className="mt-5 space-y-3">
                <ActionRow label="Payment confirmations" value={Number(data.rentSummary?.pending_submission_count || stats.submitted.length)} />
                <ActionRow label="Overdue invoices" value={stats.overdue.length} />
                <ActionRow label="Unread notifications" value={stats.notifications.filter((n: RecordValue) => !n.read).length} />
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Calendar</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Upcoming due dates</h2></div><FileText className="h-5 w-5 text-brand-600" /></div>
              <div className="mt-4 space-y-2">
                {stats.upcoming.map((invoice: RecordValue) => <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-3 dark:bg-brand-900/50"><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{invoice.invoice_number || 'Rent invoice'}</p><p className="truncate text-xs text-gray-500">Unit {invoice.unit_id || '—'}</p></div><div className="shrink-0 text-right"><p className="text-xs font-bold text-gray-900 dark:text-white">{date(invoice.due_date)}</p><p className="text-xs text-gray-500">{money(invoice.amount_kes)}</p></div></div>)}
                {!stats.upcoming.length && <p className="py-6 text-center text-sm text-gray-500">No upcoming unpaid invoices.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Occupancy</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Portfolio utilization</h2></div><span className="text-2xl font-bold text-brand-700 dark:text-brand-300">{stats.occupancy}%</span></div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-brand-900"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${stats.occupancy}%` }} /></div>
              <div className="mt-3 grid grid-cols-2 gap-3"><MiniStat label="Occupied" value={stats.occupied.length} /><MiniStat label="Available" value={stats.available.length} /></div>
            </div>
          </section>

          <LandlordPMS />
        </>
      )}
    </div>
  );
}

function ActionRow({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-3 dark:border-brand-800"><span className="text-sm text-gray-600 dark:text-gray-300">{label}</span><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">{value}</span></div>;
}
