import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, CheckCircle2, Clock3, FileText, RefreshCw, TrendingUp, Wallet } from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';

type RecordValue = Record<string, any>;

const money = (value: unknown) => `KES ${Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const status = (value: unknown) => String(value || '').trim().toUpperCase();
const date = (value: unknown) => value
  ? new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(String(value)))
  : '—';

function Stat({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail?: string; icon: typeof Wallet }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p><p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>{detail && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</p>}</div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"><Icon className="h-5 w-5" /></span>
      </div>
    </div>
  );
}

export default function LandlordPMSFinance() {
  const [data, setData] = useState<RecordValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { setData(await protectedGet<RecordValue>('/api/core/pms/dashboard/')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load landlord finance data.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const finance = useMemo(() => {
    const invoices = Array.isArray(data?.rentInvoices) ? data.rentInvoices : [];
    const payments = Array.isArray(data?.rentPayments) ? data.rentPayments : [];
    const summary = data?.rentSummary || {};
    const paid = invoices.filter((i: RecordValue) => status(i.status) === 'PAID');
    const submitted = invoices.filter((i: RecordValue) => status(i.status) === 'PAYMENT_SUBMITTED');
    const now = new Date();
    const overdue = invoices.filter((i: RecordValue) => status(i.status) !== 'PAID' && i.due_date && new Date(String(i.due_date)).getTime() < now.getTime());
    const collected = Number(summary.total_payments_kes || 0);
    const invoiced = Number(summary.total_invoiced_kes || 0);
    const outstanding = Math.max(0, invoiced - collected);
    const rate = invoiced ? Math.min(100, Math.round((collected / invoiced) * 100)) : 0;
    const recentPayments = payments.filter((p: RecordValue) => status(p.status) === 'PAID').sort((a: RecordValue, b: RecordValue) => new Date(String(b.paid_at || b.created_at || 0)).getTime() - new Date(String(a.paid_at || a.created_at || 0)).getTime()).slice(0, 8);
    return { invoices, paid, submitted, overdue, collected, invoiced, outstanding, rate, recentPayments };
  }, [data]);

  if (loading) return <div className="flex min-h-80 items-center justify-center rounded-3xl border border-gray-200 bg-white dark:border-brand-800 dark:bg-brand-950"><RefreshCw className="h-7 w-7 animate-spin text-brand-600" /></div>;

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-brand-800 dark:bg-brand-950">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Finance</p><h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Rent collection overview</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">All figures below are derived from the landlord PMS data returned by Django.</p></div>
          <button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" />Refresh</button>
        </div>
      </div>

      {error && <div className="rounded-xl bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-300">{error}</div>}

      {!error && data && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Total invoiced" value={money(finance.invoiced)} icon={FileText} />
          <Stat label="Collected" value={money(finance.collected)} detail={`${finance.rate}% collection rate`} icon={CheckCircle2} />
          <Stat label="Outstanding" value={money(finance.outstanding)} icon={Wallet} />
          <Stat label="Awaiting confirmation" value={finance.submitted.length} icon={Clock3} />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950 lg:col-span-2">
            <div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-brand-600" /><h3 className="font-bold text-gray-900 dark:text-white">Collection performance</h3></div>
            <div className="mt-5"><div className="flex items-center justify-between text-sm"><span className="text-gray-500">Collected against invoiced</span><span className="font-bold text-gray-900 dark:text-white">{finance.rate}%</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-brand-900"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${finance.rate}%` }} /></div></div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/50"><p className="text-xs text-gray-500">Paid invoices</p><p className="mt-1 text-lg font-bold">{finance.paid.length}</p></div><div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/50"><p className="text-xs text-gray-500">Overdue</p><p className="mt-1 text-lg font-bold">{finance.overdue.length}</p></div><div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/50"><p className="text-xs text-gray-500">Payment reviews</p><p className="mt-1 text-lg font-bold">{finance.submitted.length}</p></div><div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/50"><p className="text-xs text-gray-500">Invoice count</p><p className="mt-1 text-lg font-bold">{finance.invoices.length}</p></div></div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950"><h3 className="font-bold text-gray-900 dark:text-white">Recent confirmed payments</h3><div className="mt-4 space-y-3">{finance.recentPayments.map((payment: RecordValue) => <div key={payment.id} className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 last:border-0 dark:border-brand-800"><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{payment.provider_reference || payment.mpesa_receipt || 'Payment'}</p><p className="text-xs text-gray-500">{date(payment.paid_at || payment.created_at)}</p></div><span className="shrink-0 text-sm font-bold text-gray-900 dark:text-white">{money(payment.amount_kes)}</span></div>)}{!finance.recentPayments.length && <p className="py-6 text-center text-sm text-gray-500">No confirmed payments yet.</p>}</div></div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-brand-800 dark:bg-brand-950">
          <div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-brand-800"><div><h3 className="font-bold text-gray-900 dark:text-white">Invoice ledger</h3><p className="mt-1 text-sm text-gray-500">A financial view of invoices returned by Django.</p></div><ArrowDownToLine className="h-5 w-5 text-gray-400" /></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-brand-900/50"><tr><th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Due</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-brand-800">{finance.invoices.slice(0, 12).map((invoice: RecordValue) => <tr key={invoice.id}><td className="px-5 py-3 font-semibold text-gray-900 dark:text-white">{invoice.invoice_number || '—'}</td><td className="px-5 py-3">{money(invoice.amount_kes)}</td><td className="px-5 py-3 text-gray-500">{date(invoice.due_date)}</td><td className="px-5 py-3"><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold dark:bg-brand-900">{status(invoice.status) || 'UNKNOWN'}</span></td></tr>)}</tbody></table>{!finance.invoices.length && <p className="p-8 text-center text-sm text-gray-500">No invoices returned by Django.</p>}</div>
        </div>
      </>}
    </section>
  );
}
