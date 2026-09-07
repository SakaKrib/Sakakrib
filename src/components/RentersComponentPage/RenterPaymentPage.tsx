import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, CreditCard, FileText, RefreshCw, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { renterApi, type RentInvoice } from '@/lib/Renter/renterApi';

const money = (value: number | null | undefined) => `KES ${(value ?? 0).toLocaleString('en-KE')}`;
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const normalized = (value?: string | null) => String(value ?? '').trim().toUpperCase();
const paidStatuses = ['PAID', 'COMPLETED', 'SETTLED', 'RELEASED'];
const closedStatuses = [...paidStatuses, 'CANCELLED', 'CANCELED', 'REFUNDED'];

const statusClass = (value?: string | null) => {
  const status = normalized(value);
  if (paidStatuses.includes(status)) return 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400';
  if (['OVERDUE', 'LATE', 'REJECTED'].includes(status)) return 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400';
  return 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400';
};

export default function RenterPaymentPage() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [invoices, setInvoices] = useState<RentInvoice[]>([]);
  const [history, setHistory] = useState<Array<{ id: string; amount_kes: number; period_year: number; period_month: number; status: string; payment_provider: string | null; payment_method: string | null; mpesa_receipt: string | null; paid_at: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id || profile.role !== 'renter') return;
    setLoading(true);
    setError(null);
    try {
      const dashboard = await renterApi.getDashboard(profile.id);
      const [invoiceRows, paymentRows] = await Promise.all([
        renterApi.getInvoices(profile.id),
        dashboard.association?.id ? renterApi.getPaymentHistory(dashboard.association.id) : Promise.resolve([]),
      ]);
      setInvoices(invoiceRows ?? []);
      setHistory(paymentRows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your payment information.');
      setInvoices([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.role]);

  useEffect(() => { void load(); }, [load]);

  const outstanding = useMemo(() => invoices.filter((invoice) => !closedStatuses.includes(normalized(invoice.status))).reduce((sum, invoice) => sum + Number(invoice.amount_kes ?? 0), 0), [invoices]);
  const paidTotal = useMemo(() => history.filter((row) => paidStatuses.includes(normalized(row.status))).reduce((sum, row) => sum + Number(row.amount_kes ?? 0), 0), [history]);
  const pendingCount = useMemo(() => invoices.filter((invoice) => ['DUE', 'PENDING', 'OVERDUE', 'PAYMENT_SUBMITTED', 'REJECTED'].includes(normalized(invoice.status))).length, [invoices]);
  const currentInvoice = useMemo(() => invoices.find((invoice) => !closedStatuses.includes(normalized(invoice.status))) ?? null, [invoices]);

  if (!profile || profile.role !== 'renter') return null;

  return (
    <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6">
        <button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to renter dashboard</button>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payments</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Track rent payments, outstanding invoices, and confirmed transaction records.</p></div>
          <button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </div>
      </div>

      {loading ? <div className="card flex min-h-[400px] items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-brand-500" /></div> : <>
        {error && <div className="mb-5 rounded-xl bg-error-50 p-4 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>}

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="card p-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-warning-50 p-2 dark:bg-warning-900/20"><Wallet className="h-5 w-5 text-warning-600 dark:text-warning-400" /></span><div><p className="text-xs text-gray-500 dark:text-gray-400">Outstanding</p><p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{money(outstanding)}</p></div></div></div>
          <div className="card p-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-success-50 p-2 dark:bg-success-900/20"><CheckCircle2 className="h-5 w-5 text-success-600 dark:text-success-400" /></span><div><p className="text-xs text-gray-500 dark:text-gray-400">Confirmed payments</p><p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{money(paidTotal)}</p></div></div></div>
          <div className="card p-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-brand-50 p-2 dark:bg-brand-900/30"><Clock3 className="h-5 w-5 text-brand-600 dark:text-brand-400" /></span><div><p className="text-xs text-gray-500 dark:text-gray-400">Invoices needing attention</p><p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{pendingCount}</p></div></div></div>
        </div>

        {currentInvoice && !paidStatuses.includes(normalized(currentInvoice.status)) && <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-800 dark:bg-brand-900/30">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">Payment action</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{money(currentInvoice.amount_kes)} due {date(currentInvoice.due_date)}</h2><p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Invoice {currentInvoice.invoice_number}. Use the invoice payment instructions, then submit your transaction reference for confirmation.</p></div>
            <button type="button" onClick={() => navigate('renter-invoices')} className="btn-primary inline-flex shrink-0 items-center justify-center gap-2">Open invoice <ArrowRight className="h-4 w-4" /></button>
          </div>
          {currentInvoice.payment_destination_snapshot && <div className="mt-4 rounded-xl border border-brand-200 bg-white/70 p-4 dark:border-brand-800 dark:bg-brand-950/40"><div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-brand-600 dark:text-brand-400" /><p className="text-sm font-semibold text-gray-900 dark:text-white">Payment instructions</p></div><p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{String(currentInvoice.payment_destination_snapshot.display_name ?? currentInvoice.payment_destination_snapshot.provider ?? 'Configured payment method')}</p>{currentInvoice.payment_destination_snapshot.paybill_number && <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Paybill: {currentInvoice.payment_destination_snapshot.paybill_number}{currentInvoice.payment_destination_snapshot.paybill_account ? ` · Account: ${currentInvoice.payment_destination_snapshot.paybill_account}` : ''}</p>}{currentInvoice.payment_destination_snapshot.till_number && <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Till: {currentInvoice.payment_destination_snapshot.till_number}</p>}</div>}
        </div>}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card overflow-hidden"><div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-brand-800"><div className="flex items-center gap-3"><FileText className="h-5 w-5 text-brand-500" /><div><h2 className="font-bold text-gray-900 dark:text-white">Rent invoices</h2><p className="text-xs text-gray-500 dark:text-gray-400">Your current and previous rent charges</p></div></div><button type="button" onClick={() => navigate('renter-invoices')} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">View all</button></div>{invoices.length === 0 ? <div className="p-10 text-center"><FileText className="mx-auto h-9 w-9 text-gray-400" /><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No rent invoices found.</p></div> : <div className="divide-y divide-gray-100 dark:divide-brand-800">{invoices.slice(0, 6).map((invoice) => <button key={invoice.id} type="button" onClick={() => navigate('renter-invoices')} className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-gray-50 dark:hover:bg-brand-900/30"><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{invoice.invoice_number}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Due {date(invoice.due_date)} · {date(invoice.billing_period_start)}</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold text-gray-900 dark:text-white">{money(invoice.amount_kes)}</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${statusClass(invoice.status)}`}>{invoice.status}</span></div></button>)}</div>}</section>

          <section className="card overflow-hidden"><div className="border-b border-gray-100 p-5 dark:border-brand-800"><div className="flex items-center gap-3"><Wallet className="h-5 w-5 text-brand-500" /><div><h2 className="font-bold text-gray-900 dark:text-white">Payment history</h2><p className="text-xs text-gray-500 dark:text-gray-400">Confirmed transactions from your rental account</p></div></div></div>{history.length === 0 ? <div className="p-10 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-gray-400" /><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No payment history yet.</p><button type="button" onClick={() => navigate('renter-invoices')} className="btn-secondary mt-4 inline-flex items-center gap-2 text-sm">View invoices <ArrowRight className="h-4 w-4" /></button></div> : <div className="divide-y divide-gray-100 dark:divide-brand-800">{history.slice(0, 8).map((row) => <div key={row.id} className="flex items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="text-sm font-semibold text-gray-900 dark:text-white">{row.period_year}-{String(row.period_month).padStart(2, '0')}</p><p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{row.payment_provider || row.payment_method || 'Payment'}{row.mpesa_receipt ? ` · Receipt ${row.mpesa_receipt}` : ''}</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold text-gray-900 dark:text-white">{money(row.amount_kes)}</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${statusClass(row.status)}`}>{row.status}</span></div></div>)}</div>}</section>
        </div>
      </>}
    </div>
  );
}
