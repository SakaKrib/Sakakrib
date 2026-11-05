import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  PayPalProvider,
  PayPalOneTimePaymentButton,
  PayPalSubscriptionButton,
  PayPalCardFieldsProvider,
  PayPalCardNumberField,
  PayPalCardExpiryField,
  PayPalCardCvvField,
  usePayPal,
  usePayPalCardFieldsOneTimePaymentSession,
  INSTANCE_LOADING_STATE,
  type OnApproveDataOneTimePayments,
  type OnApproveDataSubscriptions,
} from '@paypal/react-paypal-js/sdk-v6';
import { protectedPost } from '@/lib/djangoApi';
import { pollMpesaInvoiceStatus } from '@/lib/LandlordTs/Pmspayments';

export type PayPalButtonMode = 'ONE_TIME' | 'SUBSCRIPTION';
interface PayPalPaymentButtonProps {
  mode: PayPalButtonMode;
  paymentIntentId?: string | null;
  planId?: string | null;
  billingCycle?: 'MONTHLY' | 'ANNUAL';
  listingId?: string | null;
  onPreparePayPalPayment?: () => Promise<string>;
  onSuccess: () => Promise<void> | void;
  onError?: (message: string) => void;
  disabled?: boolean;
}
interface ListingStartResponse {
  success?: boolean;
  detail?: string;
  message?: string;
  provider_reference?: string;
}
interface ListingCaptureResponse {
  success?: boolean;
  status?: string;
  detail?: string;
  message?: string;
  payment_intent_id?: string;
  listing_id?: string | null;
}
interface SubscriptionCheckoutResponse {
  success?: boolean;
  detail?: string;
  message?: string;
  paypal_subscription_id?: string;
  invoice_id?: string;
  approval_url?: string;
}
interface SubscriptionApproveResponse {
  success?: boolean;
  detail?: string;
  message?: string;
  status?: string;
  invoice_id?: string;
  listing_id?: string | null;
}

const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;
const environment = (import.meta.env.VITE_PAYPAL_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';

function errorMessage(data: { detail?: string; message?: string } | null, fallback: string) {
  return data?.detail || data?.message || fallback;
}

interface CardFieldsCheckoutProps {
  createOrder: () => Promise<{ orderId: string }>;
  captureOrder: (orderId: string) => Promise<void>;
  disabled: boolean;
  onError: (message: string) => void;
}

function CardFieldsCheckout({ createOrder, captureOrder, disabled, onError }: CardFieldsCheckoutProps) {
  const { eligiblePaymentMethods, loadingStatus } = usePayPal();
  const { submit, submitResponse, error } = usePayPalCardFieldsOneTimePaymentSession();
  const [billingAddress, setBillingAddress] = useState({
    addressLine1: '',
    addressLine2: '',
    adminArea1: '',
    adminArea2: '',
    postalCode: '',
    countryCode: 'KE',
  });
  const [submitting, setSubmitting] = useState(false);
  const handledSubmitResponseRef = useRef<typeof submitResponse>(null);

  const cardEligible = eligiblePaymentMethods?.isEligible('advanced_cards');

  useEffect(() => {
    if (!submitResponse || submitResponse === handledSubmitResponseRef.current) return;
    handledSubmitResponseRef.current = submitResponse;

    if (submitResponse.state === 'succeeded') {
      const orderId = submitResponse.data?.orderId;
      if (!orderId) {
        onError('PayPal card payment succeeded, but the order reference is missing.');
        return;
      }
      void captureOrder(orderId).catch((captureError) => {
        onError(captureError instanceof Error ? captureError.message : 'PayPal payment could not be completed.');
      });
      return;
    }

    if (submitResponse.state === 'canceled') {
      onError('Card authentication was canceled. Please try again.');
      return;
    }

    onError(submitResponse.data?.message || 'PayPal could not process the card payment. Please check your details and try again.');
  }, [submitResponse, captureOrder, onError]);

  if (loadingStatus === INSTANCE_LOADING_STATE.PENDING) {
    return <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">Loading card payment options…</p>;
  }
  if (loadingStatus === INSTANCE_LOADING_STATE.REJECTED) {
    return <p className="mt-4 text-sm text-error-700 dark:text-error-400">Unable to load PayPal card payment options.</p>;
  }
  if (!cardEligible) {
    return <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">Direct card payment is not currently available for this PayPal account or buyer.</p>;
  }

  const updateAddress = (field: keyof typeof billingAddress, value: string) => {
    setBillingAddress(current => ({ ...current, [field]: value }));
  };

  const handleSubmit = async () => {
    if (disabled || submitting) return;
    setSubmitting(true);
    try {
      const { orderId } = await createOrder();
      await submit(orderId, {
        billingAddress: {
          addressLine1: billingAddress.addressLine1.trim(),
          addressLine2: billingAddress.addressLine2.trim() || undefined,
          adminArea1: billingAddress.adminArea1.trim() || undefined,
          adminArea2: billingAddress.adminArea2.trim() || undefined,
          postalCode: billingAddress.postalCode.trim(),
          countryCode: billingAddress.countryCode.trim().toUpperCase(),
        },
      });
    } catch (submitError) {
      onError(submitError instanceof Error ? submitError.message : 'Unable to process the card payment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return <p className="mt-4 text-sm text-error-700 dark:text-error-400">{error.message}</p>;
  }

  return (
    <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
      <p className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">Pay directly with a card</p>
      <div className="space-y-3">
        <PayPalCardNumberField label="Card number" placeholder="Card number" containerStyles={{ height: '3rem' }} />
        <div className="grid grid-cols-2 gap-3">
          <PayPalCardExpiryField label="Expiry" placeholder="MM/YY" containerStyles={{ height: '3rem' }} />
          <PayPalCardCvvField label="CVV" placeholder="CVV" containerStyles={{ height: '3rem' }} />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Billing address</p>
        <input value={billingAddress.addressLine1} onChange={event => updateAddress('addressLine1', event.target.value)} placeholder="Address line 1" autoComplete="billing address-line1" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
        <input value={billingAddress.addressLine2} onChange={event => updateAddress('addressLine2', event.target.value)} placeholder="Address line 2 (optional)" autoComplete="billing address-line2" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
        <div className="grid grid-cols-2 gap-3">
          <input value={billingAddress.adminArea2} onChange={event => updateAddress('adminArea2', event.target.value)} placeholder="City" autoComplete="billing address-level2" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
          <input value={billingAddress.adminArea1} onChange={event => updateAddress('adminArea1', event.target.value)} placeholder="State / region" autoComplete="billing address-level1" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input value={billingAddress.postalCode} onChange={event => updateAddress('postalCode', event.target.value)} placeholder="Postal code" autoComplete="billing postal-code" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
          <input value={billingAddress.countryCode} onChange={event => updateAddress('countryCode', event.target.value)} placeholder="Country code" maxLength={2} autoComplete="billing country" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm uppercase outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
        </div>
      </div>

      <button type="button" onClick={handleSubmit} disabled={disabled || submitting} className="mt-4 w-full rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
        {submitting ? 'Processing card payment…' : 'Pay now with Card'}
      </button>
      {submitResponse?.state === 'failed' && <p className="mt-2 text-sm text-error-700 dark:text-error-400">{submitResponse.data?.message || 'Card payment failed. Please check your details and try again.'}</p>}
    </div>
  );
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

  const captureOneTimeOrder = async (orderId: string) => {
    let intentId = paymentIntentId;
    if (!intentId && onPreparePayPalPayment) intentId = await onPreparePayPalPayment();
    if (!intentId) throw new Error('The listing payment intent is missing.');
    const response = await protectedPost<ListingCaptureResponse>('/api/payments/listing/paypal/capture/', { payment_intent_id: intentId, order_id: orderId });
    if (!response?.success || response.status !== 'PENDING') throw new Error(errorMessage(response, 'PayPal payment could not be completed.'));
    setWorking(false);
    setError(null);
    const confirmationIntentId = response.payment_intent_id || intentId;
    const params = new URLSearchParams({ payment_intent_id: confirmationIntentId, order_id: orderId });
    window.location.assign(`/listing/payment/return?${params.toString()}`);
  };

  const approveOneTime = async ({ orderId }: OnApproveDataOneTimePayments) => {
    try {
      await captureOneTimeOrder(orderId);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Unable to start PayPal payment confirmation.');
    }
  };

  const requestSubscriptionCheckout = async () => {
    setError(null);
    if (!planId || !billingCycle) throw new Error('A subscription plan and billing cycle are required.');
    setWorking(true);
    const response = await protectedPost<SubscriptionCheckoutResponse>('/api/subscriptions/checkout/', {
      plan_id: planId,
      billing_cycle: billingCycle,
      provider: 'paypal',
      listing_id: listingId || undefined,
      // The backend selects a native app-link return only for installed apps.
      // Browser checkout continues to use the existing website return URL.
      client_platform: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web',
    });
    if (!response?.success || !response.paypal_subscription_id || !response.invoice_id) {
      setWorking(false);
      throw new Error(errorMessage(response, 'Unable to start PayPal subscription checkout.'));
    }
    subscriptionInvoiceIdRef.current = response.invoice_id;
    return response;
  };

  const createSubscription = async () => {
    const response = await requestSubscriptionCheckout();
    return { subscriptionId: response.paypal_subscription_id! };
  };

  const openNativeSubscriptionApproval = async () => {
    try {
      const response = await requestSubscriptionCheckout();
      if (!response.approval_url) {
        throw new Error('PayPal did not return an approval link. Please try again.');
      }

      const approvalUrl = new URL(response.approval_url);
      if (
        approvalUrl.protocol !== 'https:' ||
        !(approvalUrl.hostname === 'paypal.com' || approvalUrl.hostname.endsWith('.paypal.com'))
      ) {
        throw new Error('PayPal returned an invalid approval link.');
      }

      // Android Custom Tabs runs outside the app WebView, allowing verified
      // HTTPS App Links to reopen SakaKrib after PayPal approval.
      await Browser.open({ url: approvalUrl.toString(), toolbarColor: '#ffffff' });
    } catch (checkoutError) {
      fail(checkoutError instanceof Error ? checkoutError.message : 'Unable to open PayPal approval.');
    }
  };

  const approveSubscription = async ({ subscriptionId }: OnApproveDataSubscriptions) => {
    const invoiceId = subscriptionInvoiceIdRef.current;
    if (!invoiceId) return fail('The PayPal subscription invoice reference is missing.');
    try {
      const response = await protectedPost<SubscriptionApproveResponse>('/api/subscriptions/paypal/approve/', {
        invoice_id: invoiceId,
        paypal_subscription_id: subscriptionId,
      });
      if (!response?.success) throw new Error(errorMessage(response, 'Unable to register the PayPal subscription.'));

      setError(null);
      const invoiceStatus = await pollMpesaInvoiceStatus(invoiceId, { maxAttempts: 40, intervalMs: 3000 });
      if (invoiceStatus !== 'PAID') {
        throw new Error('PayPal approval was received, but Django has not confirmed the subscription yet. Please wait a moment and try again.');
      }

      subscriptionInvoiceIdRef.current = null;
      setWorking(false);
      setError(null);
      await onSuccess();
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Unable to confirm the PayPal subscription.');
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <PayPalProvider clientId={clientId} environment={environment} components={mode === 'SUBSCRIPTION' ? ['paypal-subscriptions'] : ['paypal-payments', 'card-fields']} pageType="checkout">
        {mode === 'ONE_TIME' ? (
          <>
            <PayPalOneTimePaymentButton
              createOrder={createOneTimeOrder}
              onApprove={approveOneTime}
              onCancel={() => setWorking(false)}
              onError={(sdkError) => fail(sdkError.message || 'PayPal payment failed.')}
              presentationMode="auto"
              disabled={disabled || working}
              type="pay"
            />
            <PayPalCardFieldsProvider>
              <CardFieldsCheckout createOrder={createOneTimeOrder} captureOrder={captureOneTimeOrder} disabled={disabled || working} onError={fail} />
            </PayPalCardFieldsProvider>
          </>
        ) : (
          Capacitor.getPlatform() === 'android' ? (
            <button
              type="button"
              onClick={() => void openNativeSubscriptionApproval()}
              disabled={disabled || working}
              className="w-full rounded-xl bg-[#0070ba] px-4 py-3 font-semibold text-white transition hover:bg-[#005ea6] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {working ? 'Opening PayPal…' : 'Subscribe with PayPal'}
            </button>
          ) : (
            <PayPalSubscriptionButton
              createSubscription={createSubscription}
              onApprove={approveSubscription}
              onCancel={() => setWorking(false)}
              onError={(sdkError) => fail(sdkError.message || 'PayPal subscription checkout failed.')}
              presentationMode={Capacitor.isNativePlatform() ? 'modal' : 'auto'}
              disabled={disabled || working}
              type="subscribe"
            />
          )
        )}
      </PayPalProvider>
      {error && <div className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400" role="alert">{error}</div>}
      {working && <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">Waiting for secure payment confirmation…</p>}
    </div>
  );
}