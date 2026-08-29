import { useState } from 'react';
import { ArrowRight, AlertCircle, CheckCircle2, Clock3, Receipt, X } from 'lucide-react';
import { formatKES, cn } from '@/lib/utils';
import type { RentInvoice } from '@/lib/Renter/renterApi';

export type RenterRentInvoice = RentInvoice;

interface RenterRentCardProps {
  invoice?: RenterRentInvoice | null;
  monthlyRent?: number | null;
  onViewInvoices?: () => void;
  onSubmitPayment?: (invoiceId: string, transactionId: string) => Promise<void> | void;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getStatus(status?: string | null) {
  const normalized = status?.trim().toUpperCase();
  if (['PAID', 'COMPLETED', 'SETTLED'].includes(normalized ?? '')) return { label: 'Paid', className: 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400', icon: CheckCircle2 };
  if (['OVERDUE', 'LATE'].includes(normalized ?? '')) return { label: 'Overdue', className: 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400', icon: AlertCircle };
  if (normalized === 'PAYMENT_SUBMITTED') return { label: 'Awaiting confirmation', className: 'bg-btnblue-50 text-btnblue-700 dark:bg-btnblue-900/20 dark:text-btnblue-400', icon: Clock3 };
  if (normalized === 'REJECTED') return { label: 'Payment rejected', className: 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400', icon: AlertCircle };
  return { label: status || 'Pending', className: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400', icon: Clock3 };
}

export default function RenterRentCard({ invoice, monthlyRent, onViewInvoices, onSubmitPayment }: RenterRentCardProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = getStatus(invoice?.status);
  const StatusIcon = status.icon;
  const amount = invoice?.amount_kes ?? invoice?.total_amount ?? invoice?.amount ?? monthlyRent ?? null;
  const normalized = invoice?.status?.toUpperCase();
  const canSubmitPayment = Boolean(invoice && onSubmitPayment && ['DUE', 'REJECTED'].includes(normalized ?? ''));

  const submit = async () => {
    if (!invoice || !onSubmitPayment) return;
    const reference = transactionId.trim();
    if (reference.length < 4) { setError('Please enter a valid transaction ID.'); return; }
    setSubmitting(true); setError(null);
    try { await onSubmitPayment(invoice.id, reference); setTransactionId(''); setShowPaymentModal(false); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit the transaction ID.'); }
    finally { setSubmitting(false); }
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-brand-800">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900/30"><Receipt className="h-5 w-5 text-brand-600 dark:text-brand-400" /></div><div><h2 className="text-base font-bold text-gray-900 dark:text-white">Rent</h2><p className="text-xs text-gray-500 dark:text-gray-400">Your latest rent information</p></div></div>
        {invoice && <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', status.className)}><StatusIcon className="h-3.5 w-3.5" />{status.label}</span>}
      </div>

      {!invoice ? (
        <div className="px-5 py-8 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-50 dark:bg-success-900/20"><CheckCircle2 className="h-6 w-6 text-success-600 dark:text-success-400" /></div><h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">No outstanding rent invoice</h3><p className="mx-auto mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">There is currently no outstanding rent invoice on your account.</p>{monthlyRent != null && <div className="mt-5 rounded-xl bg-gray-50 p-4 text-left dark:bg-brand-800/30"><p className="text-xs text-gray-500 dark:text-gray-400">Monthly Rent</p><p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{formatKES(monthlyRent)}</p></div>}{onViewInvoices && <button type="button" onClick={onViewInvoices} className="btn-secondary mt-5 inline-flex items-center gap-2 text-sm">View Rent History<ArrowRight className="h-4 w-4" /></button>}</div>
      ) : (
        <div className="p-5">
          <div><p className="text-xs font-medium text-gray-500 dark:text-gray-400">Amount Due</p><p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{formatKES(amount)}</p>{invoice.invoice_number && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{invoice.invoice_number}</p>}</div>
          {invoice.payment_destination_snapshot && normalized !== 'PAID' && <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-900/20"><p className="text-xs font-medium text-gray-500 dark:text-gray-400">Payment method</p><p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{String(invoice.payment_destination_snapshot.display_name ?? invoice.payment_destination_snapshot.provider ?? 'Configured payment method')}</p>{invoice.payment_destination_snapshot.paybill_number && <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">Paybill: {invoice.payment_destination_snapshot.paybill_number}{invoice.payment_destination_snapshot.paybill_account ? ` · Account: ${invoice.payment_destination_snapshot.paybill_account}` : ''}</p>}{invoice.payment_destination_snapshot.till_number && <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">Till: {invoice.payment_destination_snapshot.till_number}</p>}</div>}
          <div className="mt-5 grid grid-cols-2 gap-4"><div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-800/30"><p className="text-xs text-gray-500 dark:text-gray-400">Due Date</p><p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{formatDate(invoice.due_date)}</p></div><div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-800/30"><p className="text-xs text-gray-500 dark:text-gray-400">Billing Period</p><p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{formatDate(invoice.billing_period_start)}</p>{invoice.billing_period_end && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">to {formatDate(invoice.billing_period_end)}</p>}</div></div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">{canSubmitPayment && <button type="button" onClick={() => { setError(null); setShowPaymentModal(true); }} className="btn-primary inline-flex items-center justify-center gap-2 text-sm">I've Already Paid</button>}{onViewInvoices && <button type="button" onClick={onViewInvoices} className="btn-secondary inline-flex items-center justify-center gap-2 text-sm">View Invoice<ArrowRight className="h-4 w-4" /></button>}</div>
          {normalized === 'PAYMENT_SUBMITTED' && <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Your transaction ID has been sent to the landlord. The invoice will become paid after the landlord confirms the payment.</p>}
          {normalized === 'PAID' && <p className="mt-3 text-xs font-medium text-success-700 dark:text-success-400">Payment confirmed. Your invoice is now recorded as paid.</p>}
        </div>
      )}

      {showPaymentModal && invoice && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="renter-payment-title"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-brand-900"><div className="flex items-start justify-between gap-4"><div><h3 id="renter-payment-title" className="text-lg font-bold text-gray-900 dark:text-white">Confirm rent payment</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Enter the transaction ID from the external payment you already made.</p></div><button type="button" onClick={() => !submitting && setShowPaymentModal(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-brand-800"><X className="h-5 w-5" /></button></div><div className="mt-5"><label htmlFor="renter-transaction-id" className="text-sm font-medium text-gray-700 dark:text-gray-200">Transaction ID</label><input id="renter-transaction-id" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Enter transaction ID" autoComplete="off" disabled={submitting} className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-brand-700 dark:bg-brand-800 dark:text-white" />{error && <p className="mt-2 text-sm text-error-600">{error}</p>}</div><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={submitting} onClick={() => setShowPaymentModal(false)} className="btn-secondary">Cancel</button><button type="button" disabled={submitting} onClick={submit} className="btn-primary">{submitting ? 'Submitting…' : 'Submit Transaction'}</button></div></div></div>}
    </section>
  );
}
