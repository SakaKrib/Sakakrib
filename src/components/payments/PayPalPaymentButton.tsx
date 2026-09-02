import { useRef, useState } from 'react';
import { PayPalProvider, PayPalOneTimePaymentButton, PayPalSubscriptionButton, type OnApproveDataOneTimePayments, type OnApproveDataSubscriptions } from '@paypal/react-paypal-js/sdk-v6';
import { protectedPost } from '@/lib/djangoApi';

export type PayPalButtonMode = 'ONE_TIME' | 'SUBSCRIPTION';
interface PayPalPaymentButtonProps { mode: PayPalButtonMode; paymentIntentId?: string | null; planId?: string | null; billingCycle?: 'MONTHLY' | 'ANNUAL'; listingId?: string | null; onPreparePayPalPayment?: () => Promise<string>; onSuccess: () => Promise<void> | void; onError?: (message: string) => void; disabled?: boolean; }
interface ListingStartResponse { success?: boolean; detail?: string; message?: string; provider_reference?: string; }
interface ListingCaptureResponse { success?: boolean; status?: string; detail?: string; message?: string; }
interface SubscriptionCheckoutResponse { success?: boolean; detail?: string; message?: string; paypal_subscription_id?: string; invoice_id?: string; }
interface SubscriptionApproveResponse { success?: boolean; detail?: string; message?: string; status?: string; invoice_id?: string; listing_id?: string | null; }

const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;
const environment = (import.meta.env.VITE_PAYPAL_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';

function errorMessage(data: { detail?: string; message?: string } | null, fallback: string) {
  return data?.detail || data?.message || fallback;
}

export default function PayPalPaymentButton({ mode, paymentIntentId, planId, billingCycle, listingId, onPreparePayPalPayment, onSuccess, onError, disabled = false }: PayPalPaymentButtonProps) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscriptionInvoiceIdRef = useRef<string | null>(null);

  if (!clientId) return <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">PayPal is not currently configured for this environment.</div>;

  const fail = (message: string) => {
    setWorking(false);
    setError(message);
    onError?.(message);
  };

  const createOneTimeOrder = async () => {
    setError(null);
    let intentId = paymentIntentId;
    if (!intentId && onPreparePayPalPayment) intentId = await onPreparePayPalPayment();
    if (!intentId) throw new Error('A listing payment intent is required.');
    setWorking(true);
    const response = await protectedPost<ListingStartResponse>('/api/payments/listing/start/', { payment_intent_id: intentId, provider: 'paypal' });
    if (!response?.success || !response.provider_reference) {
      setWorking(false);
      throw new Error(errorMessage(response, 'Unable to start PayPal payment.'));
    }
    return { orderId: response.provider_reference };
  };

  const approveOneTime = async ({ orderId }: OnApproveDataOneTimePayments) => {
    let intentId = paymentIntentId;
    if (!intentId && onPreparePayPalPayment) intentId = await onPreparePayPalPayment();
    if (!intentId) return fail('The listing payment intent is missing.');
    try {
      const response = await protectedPost<ListingCaptureResponse>('/api/payments/listing/paypal/capture/', { payment_intent_id: intentId, order_id: orderId });
      if (!response?.success || response.status !== 'PAID') throw new Error(errorMessage(response, 'PayPal payment could not be confirmed.'));
      setWorking(false);
      setError(null);
      await onSuccess();
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Unable to confirm PayPal payment.');
    }
  };

  const createSubscription = async () => {
    setError(null);
    if (!planId || !billingCycle) throw new Error('A subscription plan and billing cycle are required.');
    setWorking(true);
    const response = await protectedPost<SubscriptionCheckoutResponse>('/api/subscriptions/checkout/', {
      plan_id: planId,
      billing_cycle: billingCycle,
      provider: 'paypal',
      listing_id: listingId || undefined,
    });
    if (!response?.success || !response.paypal_subscription_id || !response.invoice_id) {
      setWorking(false);
      throw new Error(errorMessage(response, 'Unable to start PayPal subscription checkout.'));
    }
    subscriptionInvoiceIdRef.current = response.invoice_id;
    return { subscriptionId: response.paypal_subscription_id };
  };

  const approveSubscription = async ({ subscriptionId }: OnApproveDataSubscriptions) => {
    const invoiceId = subscriptionInvoiceIdRef.current;
    if (!invoiceId) return fail('The PayPal subscription invoice reference is missing.');
    try {
      // This endpoint only binds the PayPal subscription ID to our pending
      // invoice. Payment success is established later by the PayPal webhook.
      const response = await protectedPost<SubscriptionApproveResponse>('/api/subscriptions/paypal/approve/', {
        invoice_id: invoiceId,
        paypal_subscription_id: subscriptionId,
      });
      if (!response?.success) throw new Error(errorMessage(response, 'Unable to register the PayPal subscription.'));

      subscriptionInvoiceIdRef.current = null;
      setWorking(false);
      setError(null);

      // The browser redirect is navigation only. The return page waits for
      // the authoritative webhook-driven WebSocket event before showing success.
      const params = new URLSearchParams({ invoice_id: invoiceId, subscription_id: subscriptionId });
      window.location.assign(`/paypal/subscription/return?${params.toString()}`);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Unable to register the PayPal subscription.');
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <PayPalProvider clientId={clientId} environment={environment} components={mode === 'SUBSCRIPTION' ? ['paypal-subscriptions'] : ['paypal-payments']} pageType="checkout">
        {mode === 'ONE_TIME' ? (
          <PayPalOneTimePaymentButton createOrder={createOneTimeOrder} onApprove={approveOneTime} onCancel={() => setWorking(false)} onError={(sdkError) => fail(sdkError.message || 'PayPal payment failed.')} presentationMode="auto" disabled={disabled || working} type="pay" />
        ) : (
          <PayPalSubscriptionButton createSubscription={createSubscription} onApprove={approveSubscription} onCancel={() => setWorking(false)} onError={(sdkError) => fail(sdkError.message || 'PayPal subscription checkout failed.')} presentationMode="auto" disabled={disabled || working} type="subscribe" />
        )}
      </PayPalProvider>
      {error && <div className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400" role="alert">{error}</div>}
      {working && <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">Waiting for secure payment confirmation…</p>}
    </div>
  );
}
