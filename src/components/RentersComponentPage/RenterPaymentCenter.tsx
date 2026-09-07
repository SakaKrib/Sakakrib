import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, CreditCard, FileText, RefreshCw, Truck, Wallet, XCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { protectedGet } from '@/lib/djangoApi';
import { renterApi, type MovingInvoice, type RentInvoice } from '@/lib/Renter/renterApi';

type MovingPayment = { id: string; booking_id: string; invoice_id: string; amount_kes: number; provider: string; status: string; provider_reference: string | null; provider_transaction_id: string | null; mpesa_receipt: string | null; paypal_order_id: string | null; created_at: string; paid_at: string | null; released_at: string | null; updated_at: string };
type RentSubmission = { id: string; invoice_id: string; transaction_reference: string; status: string; submitted_at: string; confirmed_at: string | null; rejection_reason: string | null };

const normalized = (value?: string | null) => String(value ?? '').trim().toUpperCase();
const money = (value: number | null | undefined) => `KES ${(Number(value) || 0).toLocaleString('en-KE')}`;
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const paid = new Set(['PAID', 'COMPLETED', 'SETTLED', 'RELEASED', 'CONFIRMED']);
const failed = new Set(['FAILED', 'REJECTED', 'CANCELLED', 'CANCELED', 'REFUNDED']);
const badge = (status?: string | null) => { const s = normalized(status); if (paid.has(s)) return 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400'; if (failed.has(s)) return 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400'; return 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-400'; };

export default function RenterPaymentCenter() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [invoices, setInvoices] = useState<RentInvoice[]>([]);
  const [movingInvoices, setMovingInvoices] = useState<MovingInvoice[]>([]);
  const [movingPayments, setMovingPayments] = useState<MovingPayment[]>([]);
  const [submissions, setSubmissions] = useState<RentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id || profile.role !== 'renter') return;
    setLoading(true); setError(null);
    try {
      const dashboard = await renterApi.getDashboard(profile.id);
      const [rentInvoices, allMovingInvoices, allMovingPayments] = await Promise.all([
        renterApi.getInvoices(profile.id),
        protectedGet<MovingInvoice[]>('/api/core/moving-invoices/'),
        protectedGet<MovingPayment[]>('/api/core/moving-payments/'),
      ]);
      const renterMovingInvoices = (allMovingInvoices ?? []).filter((invoice) => invoice.renter_id === profile.id);
      const renterBookingIds = new Set((dashboard.bookings ?? []).map((booking) => booking.id));
      const renterMovingPayments = (allMovingPayments ?? []).filter((payment) => renterBookingIds.has(payment.booking_id));
      const rentSubmissions = (await Promise.all((rentInvoices ?? []).map(async (invoice) => {
        try { return await renterApi.getPaymentSubmissions(invoice.id); } catch { return []; }
      }))).flat() as RentSubmission[];
      setInvoices(rentInvoices ?? []); setMovingInvoices(renterMovingInvoices); setMovingPayments(renterMovingPayments); setSubmissions(rentSubmissions);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load your payment information.'); }
    finally { setLoading(false); }
  }, [profile?.id, profile?.role]);

  useEffect(() => { void load(); }, [load]);

  const pendingRent = useMemo(() => invoices.filter((invoice) => !paid.has(normalized(invoice.status)) && !failed.has(normalized(invoice.status))), [invoices]);
  const pendingMoving = useMemo(() => movingInvoices.filter((invoice) => !paid.has(normalized(invoice.status)) && !failed.has(normalized(invoice.status))), [movingInvoices]);
  const completedRent = useMemo(() => invoices.filter((invoice) => paid.has(normalized(invoice.status))), [invoices]);
  const completedMoving = useMemo(() => movingInvoices.filter((invoice) => paid.has(normalized(invoice.status))), [movingInvoices]);
  const totalDue = useMemo(() => pendingRent.reduce((sum, invoice) => sum + Number(invoice.amount_kes || 0), 0) + pendingMoving.reduce((sum, invoice) => sum + Number(invoice.amount_kes || 0), 0), [pendingRent, pendingMoving]);
  const pendingPayments = movingPayments.filter((payment) => !paid.has(normalized(payment.status)) && !failed.has(normalized(payment.status)));
  const confirmedMovingPayments = movingPayments.filter((payment) => paid.has(normalized(payment.status)));
  const rentPendingByInvoice = new Map(submissions.filter((submission) => !paid.has(normalized(submission.status)) && !failed.has(normalized(submission.status))).map((submission) => [submission.invoice_id, submission]));

  if (!profile || profile.role !== 'renter') return null;

  return <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to renter dashboard</button><h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Payments</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">One place for rent, moving payments, pending transactions, and completed payments.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />Refresh</button></div>
    {loading ? <div className="card flex min-h-[400px] items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-brand-500" /></div> : <>
      {error && <div className="mb-5 rounded-xl bg-error-50 p-4 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-3"><div className="card p-5"><p className="text-xs text-gray-500 dark:text-gray-400">Total currently due</p><p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{money(totalDue)}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Rent + moving services</p></div><div className="card p-5"><p className="text-xs text-gray-500 dark:text-gray-400">Pending transactions</p><p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{pendingPayments.length + submissions.filter(s => !paid.has(normalized(s.status)) && !failed.has(normalized(s.status))).length}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Awaiting confirmation</p></div><div className="card p-5"><p className="text-xs text-gray-500 dark:text-gray-400">Completed payments</p><p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{completedRent.length + completedMoving.length}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Confirmed invoices</p></div></div>

      {(pendingMoving.length > 0 || pendingRent.length > 0) && <section className="mb-6"><div className="mb-3 flex items-center gap-2"><Clock3 className="h-5 w-5 text-warning-600 dark:text-warning-400" /><h2 className="text-lg font-bold text-gray-900 dark:text-white">Payments requiring action</h2></div><div className="grid gap-4 lg:grid-cols-2">
        {pendingMoving.map(invoice => <div key={`move-${invoice.id}`} className="card border-l-4 border-l-warning-400 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-warning-700 dark:text-warning-400">Moving service</p><h3 className="mt-1 font-bold text-gray-900 dark:text-white">{invoice.mover_name_snapshot || 'Mover service'}</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Invoice {invoice.invoice_number}</p></div><Truck className="h-5 w-5 text-brand-500" /></div><div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-xs text-gray-500 dark:text-gray-400">Amount</p><p className="text-xl font-bold text-gray-900 dark:text-white">{money(invoice.amount_kes)}</p><span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badge(invoice.status)}`}>{invoice.status}</span></div><button type="button" onClick={() => navigate('mover-tracking', invoice.booking_id)} className="btn-primary inline-flex items-center gap-2">Open booking <ArrowRight className="h-4 w-4" /></button></div></div>)}
        {pendingRent.map(invoice => { const submission = rentPendingByInvoice.get(invoice.id); return <div key={`rent-${invoice.id}`} className="card border-l-4 border-l-warning-400 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-warning-700 dark:text-warning-400">Rent payment</p><h3 className="mt-1 font-bold text-gray-900 dark:text-white">{invoice.invoice_number}</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Due {date(invoice.due_date)}</p></div><Wallet className="h-5 w-5 text-brand-500" /></div><div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-xl font-bold text-gray-900 dark:text-white">{money(invoice.amount_kes)}</p><span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badge(submission?.status || invoice.status)}`}>{submission ? `Payment ${submission.status}` : invoice.status}</span></div><button type="button" onClick={() => navigate('renter-invoices')} className="btn-primary inline-flex items-center gap-2">Open invoice <ArrowRight className="h-4 w-4" /></button></div></div>; })}
      </div></section>}

      {(pendingPayments.length > 0) && <section className="mb-6"><div className="mb-3 flex items-center gap-2"><CreditCard className="h-5 w-5 text-brand-500" /><h2 className="text-lg font-bold text-gray-900 dark:text-white">Payment activity</h2></div><div className="card divide-y divide-gray-100 overflow-hidden dark:divide-brand-800">{pendingPayments.map(payment => <div key={payment.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-gray-900 dark:text-white">Moving service payment</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{payment.provider || 'Payment'} · Started {date(payment.created_at)}</p>{payment.provider_reference && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Reference: {payment.provider_reference}</p>}</div><div className="text-left sm:text-right"><p className="font-bold text-gray-900 dark:text-white">{money(payment.amount_kes)}</p><span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badge(payment.status)}`}>{payment.status}</span></div></div>)}</div></section>}

      <section><div className="mb-3 flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success-600 dark:text-success-400" /><h2 className="text-lg font-bold text-gray-900 dark:text-white">Completed payments</h2></div><div className="card overflow-hidden"><div className="divide-y divide-gray-100 dark:divide-brand-800">
        {[...completedMoving.map(invoice => ({ id: `move-${invoice.id}`, type: 'Moving service', reference: invoice.invoice_number, amount: invoice.amount_kes, status: invoice.status, date: invoice.paid_at || invoice.updated_at, receipt: movingPayments.find(payment => payment.invoice_id === invoice.id)?.mpesa_receipt, action: () => navigate('mover-tracking', invoice.booking_id) })), ...completedRent.map(invoice => ({ id: `rent-${invoice.id}`, type: 'Rent', reference: invoice.invoice_number, amount: invoice.amount_kes, status: invoice.status, date: invoice.paid_at || invoice.updated_at, receipt: null, action: () => navigate('renter-invoices') }))].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(payment => <button key={payment.id} type="button" onClick={payment.action} className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-gray-50 dark:hover:bg-brand-900/30"><div className="flex min-w-0 items-center gap-3"><span className="rounded-xl bg-success-50 p-2 dark:bg-success-900/20"><CheckCircle2 className="h-4 w-4 text-success-600 dark:text-success-400" /></span><div className="min-w-0"><p className="font-semibold text-gray-900 dark:text-white">{payment.type}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{payment.reference} · {date(payment.date)}{payment.receipt ? ` · Receipt ${payment.receipt}` : ''}</p></div></div><div className="shrink-0 text-right"><p className="font-bold text-gray-900 dark:text-white">{money(payment.amount)}</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${badge(payment.status)}`}>{payment.status}</span></div></button>)}
        {completedRent.length === 0 && completedMoving.length === 0 && <div className="p-10 text-center"><FileText className="mx-auto h-9 w-9 text-gray-400" /><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No completed payments yet.</p></div>}
      </div></div></section>

      {submissions.some(s => failed.has(normalized(s.status))) && <section className="mt-6"><div className="mb-3 flex items-center gap-2"><XCircle className="h-5 w-5 text-error-600 dark:text-error-400" /><h2 className="text-lg font-bold text-gray-900 dark:text-white">Payment issues</h2></div><div className="card divide-y divide-gray-100 dark:divide-brand-800">{submissions.filter(s => failed.has(normalized(s.status))).slice(0, 6).map(s => <div key={s.id} className="p-4"><p className="text-sm font-semibold text-gray-900 dark:text-white">Rent payment {s.status}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Reference {s.transaction_reference} · Submitted {date(s.submitted_at)}{s.rejection_reason ? ` · ${s.rejection_reason}` : ''}</p></div>)}</div></section>}
    </>}
  </div>;
}
