import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Crown, Loader2, Smartphone, X, XCircle } from 'lucide-react';

import { getMyPMSSubscription } from '@/lib/LandlordTs/LandlordpmsService';
import { getCurrentRealEstateSubscription } from '@/lib/RealEstateTs/Realestateservice';
import {
  initiateMpesaSubscriptionCheckout,
  pollMpesaInvoiceStatus,
  type PMSBillingCycle,
  type PMSCheckoutAudience,
} from '@/lib/LandlordTs/Pmspayments';
import PayPalPaymentButton from '@/components/payments/PayPalPaymentButton';

type PaymentMethod = 'MPESA' | 'PAYPAL';
type Step = 'select-method' | 'mpesa-waiting' | 'paypal-waiting' | 'success' | 'failed';

export interface PMSCheckoutPlan {
  planId: string;
  planName: string;
  billingCycle: PMSBillingCycle;
  amountKes: number;
}

interface PMSCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audience: PMSCheckoutAudience;
  plan: PMSCheckoutPlan | null;
  onSuccess?: () => void;
}

function formatKES(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(value);
}

function normalizePhone(value: string) {
  return value.replace(/\s+/g, '').trim();
}

async function pollForPayPalActivation(audience: PMSCheckoutAudience, planId: string, cancelled: () => boolean) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (cancelled()) return false;
    try {
      if (audience === 'REAL_ESTATE') {
        const subscription = await getCurrentRealEstateSubscription();
        if (subscription?.plan_id === planId && subscription.subscription_status === 'ACTIVE') return true;
      } else {
        const subscription = await getMyPMSSubscription();
        if (subscription?.plan_id === planId && subscription.status === 'ACTIVE') return true;
      }
    } catch {
      // Transient read failures do not change payment state.
    }
    await new Promise(resolve => setTimeout(resolve, 4000));
  }
  return false;
}

export default function PMSCheckoutModal({ open, onOpenChange, audience, plan, onSuccess }: PMSCheckoutModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('MPESA');
  const [step, setStep] = useState<Step>('select-method');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customerMessage, setCustomerMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!open) {
      cancelledRef.current = true;
      return;
    }
    cancelledRef.current = false;
    setStep('select-method');
    setMethod('MPESA');
    setPhoneNumber('');
    setInvoiceId(null);
    setError(null);
    setCustomerMessage(null);
    setStarting(false);
  }, [open, plan?.planId, plan?.billingCycle]);

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
      const result = await initiateMpesaSubscriptionCheckout(audience, plan.planId, plan.billingCycle, phone);
      if (!result.invoice_id) throw new Error('Payment did not return an invoice reference.');
      setInvoiceId(result.invoice_id);
      setCustomerMessage(result.customer_message || 'Check your phone and enter your M-Pesa PIN to approve the payment.');
      setStep('mpesa-waiting');
      const finalStatus = await pollMpesaInvoiceStatus(result.invoice_id);
      if (cancelledRef.current) return;
      if (finalStatus === 'PAID') {
        setStep('success');
        onSuccess?.();
      } else if (finalStatus === 'FAILED' || finalStatus === 'CANCELLED') {
        setError('The M-Pesa payment was not completed.');
        setStep('failed');
      } else {
        setError('Payment is still pending. You can close this window and check your subscription status shortly.');
        setStep('failed');
      }
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : 'Unable to start M-Pesa payment.');
      setStep('failed');
    } finally {
      setStarting(false);
    }
  };

  const handlePayPalSuccess = async () => {
    const active = await pollForPayPalActivation(audience, plan.planId, () => cancelledRef.current);
    if (cancelledRef.current) return;
    if (!active) {
      setError('PayPal approval was received, but the subscription is still being confirmed. Please check again shortly.');
      setStep('failed');
      return;
    }
    setStep('success');
    onSuccess?.();
  };

  const handleClose = () => {
    cancelledRef.current = true;
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="pms-checkout-title">
      <div className="card relative w-full max-w-md overflow-hidden rounded-2xl shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800"><Crown className="h-5 w-5 text-gray-700 dark:text-gray-200" /></div>
            <div><h2 id="pms-checkout-title" className="text-lg font-bold text-gray-900 dark:text-white">Complete payment</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{plan.planName} · {plan.billingCycle === 'MONTHLY' ? 'Monthly' : 'Annual'} · {formatKES(plan.amountKes)}</p></div>
          </div>
          <button type="button" onClick={handleClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5">
          {step === 'select-method' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button type="button" aria-pressed={method === 'MPESA'} onClick={() => setMethod('MPESA')} className={`rounded-2xl border p-4 text-left transition ${method === 'MPESA' ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/10 dark:border-brand-500 dark:bg-brand-900/20' : 'border-gray-200 hover:border-brand-400 dark:border-gray-700'}`}>
                  <Smartphone className="h-5 w-5 text-gray-700 dark:text-gray-200" /><p className="mt-2 font-semibold text-gray-900 dark:text-white">M-Pesa</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">STK Push</p>
                </button>
                <button type="button" aria-pressed={method === 'PAYPAL'} onClick={() => setMethod('PAYPAL')} className={`rounded-2xl border p-4 text-left transition ${method === 'PAYPAL' ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/10 dark:border-brand-500 dark:bg-brand-900/20' : 'border-gray-200 hover:border-brand-400 dark:border-gray-700'}`}>
                  <Crown className="h-5 w-5 text-gray-700 dark:text-gray-200" /><p className="mt-2 font-semibold text-gray-900 dark:text-white">PayPal</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Secure recurring payment</p>
                </button>
              </div>

              {method === 'MPESA' && <div className="space-y-2"><label htmlFor="pms-mpesa-phone" className="text-sm font-semibold text-gray-900 dark:text-white">M-Pesa phone number</label><input id="pms-mpesa-phone" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="2547XXXXXXXX" className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white" /><p className="text-xs text-gray-500 dark:text-gray-400">The STK Push will be sent to this number.</p></div>}

              {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

              {method === 'MPESA' ? <button type="button" disabled={starting} onClick={startMpesa} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:opacity-50">{starting ? <><Loader2 className="h-4 w-4 animate-spin" />Starting STK Push…</> : 'Send STK Push'}</button> : <div className="space-y-2"><PayPalPaymentButton mode="SUBSCRIPTION" planId={plan.planId} billingCycle={plan.billingCycle} onSuccess={handlePayPalSuccess} onError={message => { setError(message); setStep('failed'); }} disabled={starting} /><p className="text-center text-xs text-gray-500 dark:text-gray-400">PayPal will open its secure approval experience.</p></div>}
            </div>
          )}

          {step === 'mpesa-waiting' && <div className="flex flex-col items-center py-6 text-center"><Loader2 className="h-10 w-10 animate-spin text-brand-600" /><p className="mt-4 font-semibold text-gray-900 dark:text-white">Waiting for M-Pesa confirmation</p><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{customerMessage}</p>{invoiceId && <p className="mt-3 text-xs text-gray-400">Payment reference: {invoiceId}</p>}</div>}
          {step === 'paypal-waiting' && <div className="flex flex-col items-center py-6 text-center"><Loader2 className="h-10 w-10 animate-spin text-brand-600" /><p className="mt-4 font-semibold text-gray-900 dark:text-white">Waiting for PayPal confirmation</p><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Django is verifying the PayPal subscription before activating PMS.</p></div>}
          {step === 'success' && <div className="flex flex-col items-center py-6 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30"><CheckCircle2 className="h-7 w-7 text-success-600 dark:text-success-400" /></div><p className="mt-4 font-semibold text-gray-900 dark:text-white">Subscription active</p><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Your {plan.planName} plan is now active.</p><button type="button" onClick={handleClose} className="btn-primary mt-6">Done</button></div>}
          {step === 'failed' && <div className="flex flex-col items-center py-6 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-error-100 dark:bg-error-900/30"><XCircle className="h-7 w-7 text-error-600 dark:text-error-400" /></div><p className="mt-4 font-semibold text-gray-900 dark:text-white">Payment not confirmed</p>{error && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{error}</p>}<div className="mt-6 flex gap-3"><button type="button" onClick={handleClose} className="btn-secondary">Close</button><button type="button" onClick={() => { setStep('select-method'); setError(null); }} className="btn-primary">Try again</button></div></div>}
        </div>
      </div>
    </div>
  );
}
