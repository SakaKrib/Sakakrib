import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Crown, Loader2, Smartphone, X, XCircle } from 'lucide-react';
import { initiateMpesaSubscriptionCheckout, type PMSBillingCycle, type PMSCheckoutAudience } from '@/lib/LandlordTs/Pmspayments';
import { usePaymentStatusSocket } from '@/lib/usePaymentStatusSocket';
import { protectedGet } from '@/lib/djangoApi';
import PayPalPaymentButton from '@/components/payments/PayPalPaymentButton';

type PaymentMethod = 'MPESA' | 'PAYPAL';
type Step = 'select-method' | 'mpesa-waiting' | 'paypal-waiting' | 'success' | 'failed';
export interface PMSCheckoutPlan { planId: string; planName: string; billingCycle: PMSBillingCycle; amountKes: number; }
interface PMSCheckoutModalProps { open: boolean; onOpenChange: (open: boolean) => void; audience: PMSCheckoutAudience; plan: PMSCheckoutPlan | null; listingId?: string | null; onSuccess?: () => void; }
interface InvoiceStatusResponse { id: string; status: string; result_description?: string | null; listing_id?: string | null; }

function formatKES(value: number) { return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(value); }
function normalizePhone(value: string) { return value.replace(/\s+/g, '').trim(); }

export default function PMSCheckoutModal({ open, onOpenChange, audience, plan, listingId, onSuccess }: PMSCheckoutModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('MPESA');
  const [step, setStep] = useState<Step>('select-method');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customerMessage, setCustomerMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const { event, connected, connectionError } = usePaymentStatusSocket(invoiceId);

  useEffect(() => {
    if (!open) return;
    setStep('select-method');
    setMethod('MPESA');
    setPhoneNumber('');
    setInvoiceId(null);
    setError(null);
    setCustomerMessage(null);
    setStarting(false);
  }, [open, plan?.planId, plan?.billingCycle, listingId]);

  useEffect(() => {
    if (!event || event.type !== 'payment_status') return;
    if (event.status === 'PAID') {
      setError(null);
      setStep('success');
    } else if (event.status === 'FAILED' || event.status === 'CANCELLED' || event.status === 'REFUNDED') {
      setError(event.message || 'The payment was not completed.');
      setStep('failed');
    }
  }, [event]);

  useEffect(() => {
    if (!invoiceId || step !== 'mpesa-waiting') return;
    let cancelled = false;
    const checkStatus = async () => {
      try {
        const invoice = await protectedGet<InvoiceStatusResponse>(`/api/subscriptions/invoices/${encodeURIComponent(invoiceId)}/`);
        if (cancelled) return;
        const status = invoice.status.toUpperCase();
        if (status === 'PAID') {
          setError(null);
          setStep('success');
        } else if (status === 'FAILED' || status === 'CANCELLED' || status === 'REFUNDED') {
          setError(invoice.result_description || 'The M-Pesa payment was not completed.');
          setStep('failed');
        }
      } catch {
        // WebSocket is the primary live path; retry below for recovery.
      }
    };
    void checkStatus();
    const timer = window.setInterval(checkStatus, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [invoiceId, step]);

  if (!open || !plan) return null;

  const startMpesa = async () => {
    const phone = normalizePhone(phoneNumber);
    if (!/^254(?:7|1)\d{8}$/.test(phone)) {
      setError('Enter a valid Kenyan M-Pesa number, for example 2547XXXXXXXX.');
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const result = await initiateMpesaSubscriptionCheckout(audience, plan.planId, plan.billingCycle, phone, listingId || undefined);
      if (!result.invoice_id) throw new Error('Payment did not return an invoice reference.');
      setInvoiceId(result.invoice_id);
      setCustomerMessage(result.customer_message || 'Check your phone and enter your M-Pesa PIN to approve the payment.');
      setStep('mpesa-waiting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start M-Pesa payment.');
      setStep('failed');
    } finally {
      setStarting(false);
    }
  };

  const continueAfterSuccess = () => {
    onOpenChange(false);
    if (listingId) {
      window.location.hash = `post-listing/${encodeURIComponent(listingId)}`;
      return;
    }
    onSuccess?.();
  };

  const handleClose = () => onOpenChange(false);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true"><div className="card relative w-full max-w-md overflow-hidden rounded-2xl shadow-xl"><div className="flex items-start justify-between border-b border-gray-200 p-5 dark:border-gray-800"><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Complete payment</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{plan.planName} · {plan.billingCycle === 'MONTHLY' ? 'Monthly' : 'Annual'} · {formatKES(plan.amountKes)}</p></div><button type="button" onClick={handleClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close"><X className="h-5 w-5" /></button></div><div className="p-5">
    {step === 'select-method' && <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><button type="button" aria-pressed={method === 'MPESA'} onClick={() => setMethod('MPESA')} className="rounded-2xl border p-4 text-left"><Smartphone className="mb-2 h-5 w-5" />M-Pesa<span className="mt-1 block text-xs text-gray-500">STK Push</span></button><button type="button" aria-pressed={method === 'PAYPAL'} onClick={() => setMethod('PAYPAL')} className="rounded-2xl border p-4 text-left"><Crown className="mb-2 h-5 w-5" />PayPal<span className="mt-1 block text-xs text-gray-500">Secure recurring payment</span></button></div>{method === 'MPESA' && <div className="space-y-2"><label htmlFor="pms-mpesa-phone" className="text-sm font-semibold">M-Pesa phone number</label><input id="pms-mpesa-phone" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="2547XXXXXXXX" className="w-full rounded-xl border px-4 py-3 text-sm" /><p className="text-xs text-gray-500">The STK Push will be sent to this number.</p></div>}{error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}{method === 'MPESA' ? <button type="button" disabled={starting} onClick={startMpesa} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:opacity-50">{starting ? <><Loader2 className="h-4 w-4 animate-spin" />Starting STK Push…</> : 'Send STK Push'}</button> : <PayPalPaymentButton mode="SUBSCRIPTION" planId={plan.planId} billingCycle={plan.billingCycle} listingId={listingId} onSuccess={() => {}} onError={message => { setError(message); setStep('failed'); }} disabled={starting} />}</div>}

    {step === 'mpesa-waiting' && <div className="flex flex-col items-center py-6 text-center"><Loader2 className="h-10 w-10 animate-spin" /><p className="mt-4 font-semibold">Waiting for M-Pesa confirmation</p><p className="mt-2 text-sm text-gray-500">{customerMessage}</p><p className="mt-3 text-xs text-gray-400">Live confirmation: {connected ? 'connected' : 'reconnecting…'}</p>{connectionError && <p className="mt-2 text-xs text-amber-600">{connectionError}</p>}{invoiceId && <p className="mt-3 text-xs text-gray-400">Payment reference: {invoiceId}</p>}</div>}

    {step === 'success' && <div className="flex flex-col items-center py-6 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-100"><CheckCircle2 className="h-7 w-7" /></div><p className="mt-4 font-semibold">Payment successful</p><p className="mt-2 text-sm text-gray-500">Your {plan.planName} subscription has been confirmed. Continue to your saved listing to finish the final review and post it.</p><button type="button" onClick={continueAfterSuccess} className="btn-primary mt-6">Continue to Listing</button></div>}

    {step === 'failed' && <div className="flex flex-col items-center py-6 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-error-100"><XCircle className="h-7 w-7" /></div><p className="mt-4 font-semibold">Payment unsuccessful</p>{error && <p className="mt-2 text-sm text-gray-500">{error}</p>}<div className="mt-6 flex gap-3"><button type="button" onClick={handleClose} className="btn-secondary">Close</button><button type="button" onClick={() => { setStep('select-method'); setError(null); setInvoiceId(null); }} className="btn-primary">Try again</button></div></div>}
  </div></div></div>;
}
