import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, TrendingUp, Wallet } from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';

type RecordValue = Record<string, any>;

const money = (value: unknown) =>
  `KES ${Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

const status = (value: unknown) => String(value || '').trim().toUpperCase();

const dayDifference = (value: unknown) => {
  if (!value) return null;
  const due = new Date(String(value));
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const target = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  return Math.round((target - start) / 86400000);
};

function StatCard({ label, value, detail, icon: Icon, tone = 'default' }: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof CalendarDays;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const iconClass = tone === 'success'
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
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-2 truncate text-xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{detail}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

export default function LandlordPMSCalendarStats() {
  const [data, setData] = useState<RecordValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    protectedGet<RecordValue>('/api/core/pms/dashboard/')
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load calendar statistics.'); });
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const invoices = Array.isArray(data?.rentInvoices) ? data.rentInvoices : [];
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const unpaid = invoices.filter((invoice: RecordValue) => status(invoice.status) !== 'PAID');
    const dueThisMonth = unpaid.filter((invoice: RecordValue) => {
      const due = new Date(String(invoice.due_date || ''));
      return !Number.isNaN(due.getTime()) && due.getMonth() === month && due.getFullYear() === year;
    });
    const overdue = unpaid.filter((invoice: RecordValue) => {
      const days = dayDifference(invoice.due_date);
      return days !== null && days < 0;
    });
    const submitted = invoices.filter((invoice: RecordValue) => status(invoice.status) === 'PAYMENT_SUBMITTED');
    const upcoming = unpaid
      .map((invoice: RecordValue) => ({ invoice, days: dayDifference(invoice.due_date) }))
      .filter((entry) => entry.days !== null && entry.days >= 0)
      .sort((a, b) => Number(a.days) - Number(b.days));
    const dueAmount = dueThisMonth.reduce((sum, invoice) => sum + Number(invoice.amount_kes || 0), 0);
    const overdueAmount = overdue.reduce((sum, invoice) => sum + Number(invoice.amount_kes || 0), 0);
    const pendingAmount = submitted.reduce((sum, invoice) => sum + Number(invoice.amount_kes || 0), 0);
    return { dueThisMonth, overdue, submitted, upcoming, dueAmount, overdueAmount, pendingAmount };
  }, [data]);

  if (error) {
    return (
      <div className="rounded-2xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-800 dark:bg-warning-900/20 dark:text-warning-200">
        <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Django calendar intelligence</p>
        <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Rent schedule at a glance</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">These figures are calculated from the authoritative PMS invoice state returned by Django.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Due this month" value={stats.dueThisMonth.length} detail={money(stats.dueAmount)} icon={CalendarDays} />
        <StatCard label="Overdue" value={stats.overdue.length} detail={money(stats.overdueAmount)} icon={AlertTriangle} tone={stats.overdue.length ? 'danger' : 'success'} />
        <StatCard label="Payment review" value={stats.submitted.length} detail={money(stats.pendingAmount)} icon={Clock3} tone={stats.submitted.length ? 'warning' : 'default'} />
        <StatCard label="Upcoming" value={stats.upcoming.length} detail="Unpaid scheduled invoices" icon={TrendingUp} />
        <StatCard label="Collected" value={money(data.rentSummary?.total_payments_kes)} detail={`${data.rentSummary?.paid_invoice_count ?? 0} paid invoices`} icon={Wallet} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
          <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-brand-600" /><h3 className="font-bold text-gray-900 dark:text-white">Upcoming schedule</h3></div>
          <div className="mt-4 space-y-2">
            {stats.upcoming.slice(0, 5).map(({ invoice, days }) => (
              <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-3 dark:border-brand-800 dark:bg-brand-900/30">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{invoice.invoice_number || 'Rent invoice'}</p><p className="text-xs text-gray-500">{invoice.renter_name || 'Renter'} · Unit {invoice.unit_number || invoice.unit_id || '—'}</p></div>
                <div className="shrink-0 text-right"><p className="text-xs font-bold text-gray-900 dark:text-white">{days === 0 ? 'Due today' : `Due in ${days}d`}</p><p className="text-xs text-gray-500">{money(invoice.amount_kes)}</p></div>
              </div>
            ))}
            {!stats.upcoming.length && <div className="flex items-center gap-2 rounded-xl bg-success-50 px-3 py-3 text-sm text-success-700 dark:bg-success-900/20 dark:text-success-300"><CheckCircle2 className="h-4 w-4" />No upcoming unpaid invoices.</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
          <div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-brand-600" /><h3 className="font-bold text-gray-900 dark:text-white">Collection health</h3></div>
          <div className="mt-4 space-y-4">
            <div><div className="flex justify-between text-sm"><span className="text-gray-500">Collection rate</span><span className="font-bold text-gray-900 dark:text-white">{Number(data.rentSummary?.total_invoiced_kes || 0) > 0 ? Math.min(100, Math.round((Number(data.rentSummary?.total_payments_kes || 0) / Number(data.rentSummary?.total_invoiced_kes || 1)) * 100)) : 0}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-brand-900"><div className="h-full rounded-full bg-brand-600" style={{ width: `${Number(data.rentSummary?.total_invoiced_kes || 0) > 0 ? Math.min(100, Math.round((Number(data.rentSummary?.total_payments_kes || 0) / Number(data.rentSummary?.total_invoiced_kes || 1)) * 100)) : 0}%` }} /></div></div>
            <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/50"><p className="text-xs text-gray-500">Outstanding</p><p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{money(Math.max(0, Number(data.rentSummary?.total_invoiced_kes || 0) - Number(data.rentSummary?.total_payments_kes || 0)))}</p></div><div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/50"><p className="text-xs text-gray-500">Awaiting confirmation</p><p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{money(stats.pendingAmount)}</p></div></div>
          </div>
        </div>
      </div>
    </section>
  );
}
