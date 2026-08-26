import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Crown,
  ExternalLink,
  Loader2,
  Smartphone,
  X,
  XCircle,
} from 'lucide-react';

import { getMyPMSSubscription } from '@/lib/LandlordTs/LandlordpmsService';
import { getCurrentRealEstateSubscription } from '@/lib/RealEstateTs/Realestateservice';
import {
  initiateMpesaSubscriptionCheckout,
  initiatePayPalSubscriptionCheckout,
  pollMpesaInvoiceStatus,
  type PMSBillingCycle,
  type PMSCheckoutAudience,
} from '@/lib/LandlordTs/Pmspayments';


// ============================================================
// TYPES
// ============================================================

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
  // Called once the subscription is confirmed ACTIVE (M-Pesa: invoice
  // PAID; PayPal: subscription record observed ACTIVE). The caller is
  // responsible for refreshing whatever subscription state it displays
  // elsewhere - this modal only reports the outcome, it never mutates
  // subscription status itself.
  onSuccess?: () => void;
}

function formatKES(value: number) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(value);
}


// ============================================================
// PMS CHECKOUT MODAL
//
// The frontend never marks a subscription ACTIVE itself - it only
// polls authoritative server state until PAID/ACTIVE, or gives the
// person an explicit "check status" / cancel path if that never
// resolves. M-Pesa terminal state comes from subscription_invoices
// (RLS-readable directly, see PMSPayments.ts). PayPal terminal
// state comes from the subscription record itself, because a PayPal
// approval activates the subscription immediately on webhook -
// there may be no subscription_invoices row yet at that point (the
// first one lands on the *next* recurring charge, not on approval).
// ============================================================

export default function PMSCheckoutModal({
  open,
  onOpenChange,
  audience,
  plan,
  onSuccess,
}: PMSCheckoutModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('MPESA');
  const [step, setStep] = useState<Step>('select-method');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [customerMessage, setCustomerMessage] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);

  const cancelledRef = useRef(false);

  // Reset when a new plan is opened.
  useEffect(() => {
    if (open) {
      setStep('select-method');
      setMethod('MPESA');
      setError(null);
      setCustomerMessage(null);
      setApprovalUrl(null);
      cancelledRef.current = false;
    } else {
      cancelledRef.current = true;
    }
  }, [open, plan?.planId, plan?.billingCycle]);

  if (!open || !plan) return null;

  const startMpesa = async () => {
    setStarting(true);
    setError(null);

    try {
      const result = await initiateMpesaSubscriptionCheckout(
        audience,
        plan.planId,
        plan.billingCycle
      );

      if (!result.invoice_id) {
        throw new Error('Payment did not return an invoice reference.');
      }

      setCustomerMessage(
        result.customer_message ?? 'Enter your M-Pesa PIN on your phone to complete payment.'
      );
      setStep('mpesa-waiting');

      const finalStatus = await pollMpesaInvoiceStatus(result.invoice_id);

      if (cancelledRef.current) return;

      if (finalStatus === 'PAID') {
        setStep('success');
        onSuccess?.();
      } else if (finalStatus === 'FAILED') {
        setError('The M-Pesa payment failed or was cancelled.');
        setStep('failed');
      } else {
        // Timed out waiting, not necessarily failed - Safaricom's
        // callback may just be slow. Let the person decide rather
        // than declaring failure on a timeout.
        setError(
          'Still waiting for confirmation. If you completed the payment, it may take a little longer to reflect - you can close this and check your subscription status shortly.'
        );
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

  const startPayPal = async () => {
    setStarting(true);
    setError(null);

    try {
      const result = await initiatePayPalSubscriptionCheckout(plan.planId, plan.billingCycle);

      if (!result.approval_url) {
        throw new Error('PayPal did not return an approval link.');
      }

      setApprovalUrl(result.approval_url);
      setStep('paypal-waiting');
      window.open(result.approval_url, '_blank', 'noopener,noreferrer');

      await pollForPayPalActivation();
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : 'Unable to start PayPal checkout.');
      setStep('failed');
    } finally {
      setStarting(false);
    }
  };

  const pollForPayPalActivation = async () => {
    const maxAttempts = 45; // ~3 minutes at 4s intervals
    const intervalMs = 4000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (cancelledRef.current) return;

      try {
        if (audience === 'REAL_ESTATE') {
          const sub = await getCurrentRealEstateSubscription();
          if (sub && sub.plan_id === plan.planId && sub.subscription_status === 'ACTIVE') {
            setStep('success');
            onSuccess?.();
            return;
          }
        } else {
          const sub = await getMyPMSSubscription();
          if (sub && sub.plan_id === plan.planId && sub.status === 'ACTIVE') {
            setStep('success');
            onSuccess?.();
            return;
          }
        }
      } catch {
        // Transient read failure - keep polling rather than aborting
        // on one bad request.
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    if (cancelledRef.current) return;

    setError(
      "Still waiting for PayPal confirmation. If you approved the payment in the other tab, it may take a moment to reflect - you can close this and check back shortly."
    );
    setStep('failed');
  };

  const handleClose = () => {
    cancelledRef.current = true;
    onOpenChange(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pms-checkout-modal-title"
    >
      <div className="card relative w-full max-w-md overflow-hidden rounded-2xl shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
              <Crown className="h-5 w-5 text-gray-700 dark:text-gray-200" />
            </div>

            <div>
              <h2 id="pms-checkout-modal-title" className="text-lg font-bold text-gray-900 dark:text-white">
                Complete payment
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {plan.planName} · {plan.billingCycle === 'MONTHLY' ? 'Monthly' : 'Annual'} ·{' '}
                {formatKES(plan.amountKes)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {step === 'select-method' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-pressed={method === 'MPESA'}
                  onClick={() => setMethod('MPESA')}
                  className={`relative rounded-2xl border p-4 text-left transition-all ${
                    method === 'MPESA'
                      ? 'border-gray-900 shadow-md ring-2 ring-gray-900/10 dark:border-white'
                      : 'border-gray-200 hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-md dark:border-gray-700'
                  }`}
                >
                  {method === 'MPESA' && (
                    <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-white dark:text-gray-900">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <Smartphone className="h-5 w-5 text-gray-700 dark:text-gray-200" />
                  <p className="mt-2 font-semibold text-gray-900 dark:text-white">M-Pesa</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">STK push</p>
                </button>

                <button
                  type="button"
                  aria-pressed={method === 'PAYPAL'}
                  onClick={() => setMethod('PAYPAL')}
                  className={`relative rounded-2xl border p-4 text-left transition-all ${
                    method === 'PAYPAL'
                      ? 'border-gray-900 shadow-md ring-2 ring-gray-900/10 dark:border-white'
                      : 'border-gray-200 hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-md dark:border-gray-700'
                  }`}
                >
                  {method === 'PAYPAL' && (
                    <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-white dark:text-gray-900">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <ExternalLink className="h-5 w-5 text-gray-700 dark:text-gray-200" />
                  <p className="mt-2 font-semibold text-gray-900 dark:text-white">PayPal</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Recurring billing</p>
                </button>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={starting}
                onClick={() => (method === 'MPESA' ? startMpesa() : startPayPal())}
                className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:opacity-50"
              >
                {starting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  `Pay ${formatKES(plan.amountKes)} with ${method === 'MPESA' ? 'M-Pesa' : 'PayPal'}`
                )}
              </button>
            </div>
          )}

          {step === 'mpesa-waiting' && (
            <div className="flex flex-col items-center py-6 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-gray-700 dark:text-gray-200" />
              <p className="mt-4 font-semibold text-gray-900 dark:text-white">
                Waiting for M-Pesa confirmation
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{customerMessage}</p>
            </div>
          )}

          {step === 'paypal-waiting' && (
            <div className="flex flex-col items-center py-6 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-gray-700 dark:text-gray-200" />
              <p className="mt-4 font-semibold text-gray-900 dark:text-white">
                Waiting for PayPal confirmation
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Complete the approval in the PayPal tab that just opened, then come back here.
              </p>
              {approvalUrl && (
                <a
                  href={approvalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:underline dark:text-white"
                >
                  Reopen PayPal
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
                <CheckCircle2 className="h-7 w-7 text-success-600 dark:text-success-400" />
              </div>
              <p className="mt-4 font-semibold text-gray-900 dark:text-white">
                Subscription active
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Your {plan.planName} plan is now active.
              </p>
              <button type="button" onClick={handleClose} className="btn-primary mt-6">
                Done
              </button>
            </div>
          )}

          {step === 'failed' && (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-error-100 dark:bg-error-900/30">
                <XCircle className="h-7 w-7 text-error-600 dark:text-error-400" />
              </div>
              <p className="mt-4 font-semibold text-gray-900 dark:text-white">
                Payment not confirmed
              </p>
              {error && (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{error}</p>
              )}
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={handleClose} className="btn-secondary">
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep('select-method');
                    setError(null);
                  }}
                  className="btn-primary"
                >
                  Try again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}