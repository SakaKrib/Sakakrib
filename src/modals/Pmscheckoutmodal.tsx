import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { AlertCircle, CheckCircle2, Crown, Loader2, Smartphone, X, XCircle } from 'lucide-react';
import { initiateMpesaSubscriptionCheckout, type PMSBillingCycle, type PMSCheckoutAudience } from '@/lib/LandlordTs/Pmspayments';
import { usePaymentStatusSocket } from '@/lib/usePaymentStatusSocket';
import { protectedGet, protectedPost } from '@/lib/djangoApi';
import PayPalPaymentButton from '@/components/payments/PayPalPaymentButton';

type PaymentMethod = 'MPESA' | 'PAYPAL';
type Step = 'select-method' | 'mpesa-waiting' | 'paypal-waiting' | 'success' | 'failed';
export interface PMSCheckoutPlan { planId: string; planName: string; billingCycle: PMSBillingCycle; amountKes: number; }
interface PMSCheckoutModalProps { open: boolean; onClose: () => void; role: PMSCheckoutAudience; plan: PMSCheckoutPlan | null; listingId?: string | null; onSuccess?: () => void; }
interface InvoiceStatusResponse { id: string; status: string; result_description?: string | null; listing_id?: string | null; }
interface SubscriptionSummary { subscription_id?: string | null; subscription_status?: string | null; billing_cycle?: PMSBillingCycle | null; paypal_subscription_id?: string | null; }
interface PayPalUpgradeResponse { success?: boolean; detail?: string; message?: string; invoice_id?: string; approval_url?: string; }

function formatKES(value: number) { return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(value); }
function normalizePhone(value: string) {
  const normalized = value.replace(/\s+/g, '').trim();
  if (/^0[17]\d{8}$/.test(normalized)) return `254${normalized.slice(1)}`;
  if (/^\+254[17]\d{8}$/.test(normalized)) return normalized.slice(1);
  if (/^[17]\d{8}$/.test(normalized)) return `254${normalized}`;
  return normalized;
}

export default function PMSCheckoutModal({ open, onClose, role, plan, listingId, onSuccess }: PMSCheckoutModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('MPESA');
  const [step, setStep] = useState<Step>('select-method');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customerMessage, setCustomerMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionSummary | null>(null);
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
    setCurrentSubscription(null);
    void protectedGet<SubscriptionSummary>('/api/subscriptions/me/')
      .then(result => setCurrentSubscription(result))
      .catch(() => setCurrentSubscription(null));
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
      setError('Enter a valid Kenyan M-Pesa number, for example 07XXXXXXXX, 01XXXXXXXX, or 2547XXXXXXXX.');
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const result = await initiateMpesaSubscriptionCheckout(role, plan.planId, plan.billingCycle, phone, listingId || undefined);
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

  const startPaypalUpgrade = async () => {
    setStarting(true);
    setError(null);
    try {
      const response = await protectedPost<PayPalUpgradeResponse>('/api/subscriptions/upgrade/', {
        provider: 'paypal',
        target_plan_id: plan.planId,
        billing_cycle: plan.billingCycle,
        client_platform: Capacitor.getPlatform(),
      });
      if (!response?.success || !response.invoice_id || !response.approval_url) {
        throw new Error(response?.detail || response?.message || 'Unable to start the PayPal subscription upgrade.');
      }
      setInvoiceId(response.invoice_id);
      setStep('paypal-waiting');
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: response.approval_url, toolbarColor: '#ffffff' });
      } else {
        window.location.assign(response.approval_url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start the PayPal subscription upgrade.');
      setStep('failed');
      setStarting(false);
    }
  };

  const continueToPms = () => {
    onClose();
    onSuccess?.();
    // Hash navigation is handled by the same SPA inside a browser tab or
    // the installed Capacitor app, so the originating runtime is preserved.
    window.location.hash = 'pms-dashboard';
  };

  const continueToListing = () => {
    if (!listingId) return;
    onClose();
    onSuccess?.();
    window.location.hash = `post-listing/${encodeURIComponent(listingId)}`;
  };

  const handleClose = () => onClose();
  const isPaypalUpgrade = Boolean(currentSubscription?.paypal_subscription_id && currentSubscription?.subscription_id);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true"><div className="card relative w-full max-w-md overflow-hidden rounded-2xl shadow-xl"><div className="flex items-start justify-between border-b border-gray-200 p-5 dark:border-gray-800"><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Complete payment</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{plan.planName} · {plan.billingCycle === 'MONTHLY' ? 'Monthly' : 'Annual'} · {formatKES(plan.amountKes)}</p></div><button type="button" onClick={handleClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close"><X className="h-5 w-5" /></button></div><div className="p-5">
    {step === 'select-method' && <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><button type="button" aria-pressed={method === 'MPESA'} onClick={() => setMethod('MPESA')} className="rounded-2xl border p-4 text-left"><Smartphone className="mb-2 h-5 w-5" />M-Pesa<span className="mt-1 block text-xs text-gray-500">STK Push</span></button><button type="button" aria-pressed={method === 'PAYPAL'} onClick={() => setMethod('PAYPAL')} className="rounded-2xl border p-4 text-left"><Crown className="mb-2 h-5 w-5" />PayPal<span className="mt-1 block text-xs text-gray-500">Secure recurring payment</span></button></div>{method === 'MPESA' && <div className="space-y-2"><label htmlFor="pms-mpesa-phone" className="text-sm font-semibold text-gray-900 dark:text-gray-100">M-Pesa phone number</label><input id="pms-mpesa-phone" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="07XXXXXXXX / 01XXXXXXXX / 2547XXXXXXXX" className="input-field px-4 py-3" /><p className="text-xs text-gray-500 dark:text-gray-400">Use a Kenyan mobile number. We accept 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, or 2547XXXXXXXX formats.</p></div>}{error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}{method === 'MPESA' ? <button type="button" disabled={starting} onClick={startMpesa} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:opacity-50">{starting ? <><Loader2 className="h-4 w-4 animate-spin" />Starting STK Push…</> : 'Send STK Push'}</button> : isPaypalUpgrade ? <button type="button" disabled={starting} onClick={startPaypalUpgrade} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:opacity-50">{starting ? <><Loader2 className="h-4 w-4 animate-spin" />Opening PayPal…</> : 'Upgrade with PayPal'}</button> : <PayPalPaymentButton mode="SUBSCRIPTION" planId={plan.planId} billingCycle={plan.billingCycle} listingId={listingId} onSuccess={() => { setError(null); setStep('success'); }} onError={message => { setError(message); setStep('failed'); }} disabled={starting} />}</div>}

    {step === 'mpesa-waiting' && <div className="flex flex-col items-center py-6 text-center"><Loader2 className="h-10 w-10 animate-spin" /><p className="mt-4 font-semibold">Waiting for M-Pesa confirmation</p><p className="mt-2 text-sm text-gray-500">{customerMessage}</p><p className="mt-3 text-xs text-gray-400">Live confirmation: {connected ? 'connected' : 'reconnecting…'}</p>{connectionError && <p className="mt-2 text-xs text-amber-600">{connectionError}</p>}{invoiceId && <p className="mt-3 text-xs text-gray-400">Payment reference: {invoiceId}</p>}</div>}

    {step === 'paypal-waiting' && <div className="flex flex-col items-center py-6 text-center"><Loader2 className="h-10 w-10 animate-spin" /><p className="mt-4 font-semibold">Waiting for PayPal confirmation</p><p className="mt-2 text-sm text-gray-500">PayPal is opening the secure re-consent flow. Django will verify the revised plan when you return.</p></div>}

    {step === 'success' && <div className="flex flex-col items-center py-6 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-100"><CheckCircle2 className="h-7 w-7" /></div><p className="mt-4 font-semibold">Payment successful</p><p className="mt-2 text-sm text-gray-500">{listingId ? 'Your subscription has been confirmed. You can continue managing your properties in PMS or return to the saved listing to finish the final review.' : 'Your subscription has been confirmed. Continue to PMS Management to manage your properties, renters, and subscription.'}</p><div className="mt-6 flex w-full flex-col gap-3"><button type="button" onClick={continueToPms} className="btn-primary w-full">Go to PMS Management Dashboard</button>{listingId && <button type="button" onClick={continueToListing} className="btn-secondary w-full">Continue to Listing</button>}</div></div>}

    {step === 'failed' && <div className="flex flex-col items-center py-6 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-error-100"><XCircle className="h-7 w-7" /></div><p className="mt-4 font-semibold">Payment unsuccessful</p>{error && <p className="mt-2 text-sm text-gray-500">{error}</p>}<div className="mt-6 flex gap-3"><button type="button" onClick={handleClose} className="btn-secondary">Close</button><button type="button" onClick={() => { setStep('select-method'); setError(null); setInvoiceId(null); }} className="btn-primary">Try again</button></div></div>}
  </div></div></div>;
}
