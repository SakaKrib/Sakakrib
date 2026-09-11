import { useEffect, useRef, useState } from 'react';
import {
  PayPalProvider,
  PayPalOneTimePaymentButton,
  PayPalCardFieldsProvider,
  PayPalCardNumberField,
  PayPalCardExpiryField,
  PayPalCardCvvField,
  usePayPal,
  usePayPalCardFieldsOneTimePaymentSession,
  INSTANCE_LOADING_STATE,
  type OnApproveDataOneTimePayments,
} from '@paypal/react-paypal-js/sdk-v6';
import { protectedPost } from '@/lib/djangoApi';

interface Props {
  bookingId: string;
  disabled?: boolean;
  onSuccess?: () => Promise<void> | void;
  onError?: (message: string) => void;
}

interface StartResponse {
  success?: boolean;
  detail?: string;
  message?: string;
  order_id?: string;
}

interface CaptureResponse {
  success?: boolean;
  status?: string;
  detail?: string;
  message?: string;
}

const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;
const environment = (import.meta.env.VITE_PAYPAL_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';

function responseMessage(data: { detail?: string; message?: string } | null, fallback: string) {
  return data?.detail || data?.message || fallback;
}

interface CardFieldsProps {
  createOrder: () => Promise<{ orderId: string }>;
  captureOrder: (orderId: string) => Promise<void>;
  disabled: boolean;
  onError: (message: string) => void;
}

function MovingCardFields({ createOrder, captureOrder, disabled, onError }: CardFieldsProps) {
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
  const handledResponse = useRef<typeof submitResponse>(null);

  const cardEligible = eligiblePaymentMethods?.isEligible('advanced_cards');

  useEffect(() => {
    if (!submitResponse || submitResponse === handledResponse.current) return;
    handledResponse.current = submitResponse;

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
      <p className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">Continue with debit or credit card</p>
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

      <button type="button" onClick={() => void handleSubmit()} disabled={disabled || submitting} className="mt-4 w-full rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
        {submitting ? 'Processing card payment…' : 'Continue with debit or credit card'}
      </button>
    </div>
  );
}

export default function MovingPayPalPaymentButton({ bookingId, disabled = false, onSuccess, onError }: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastOrderIdRef = useRef<string | null>(null);

  if (!clientId) {
    return <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">PayPal is not currently configured for this environment.</div>;
  }

  const fail = (message: string) => {
    setWorking(false);
    setError(message);
    onError?.(message);
  };

  const createOrder = async () => {
    setError(null);
    setWorking(true);
    const response = await protectedPost<StartResponse>(`/api/core/bookings/${bookingId}/payment/paypal/start/`, {});
    if (!response?.success || !response.order_id) {
      setWorking(false);
      throw new Error(responseMessage(response, 'Unable to start PayPal payment.'));
    }
    lastOrderIdRef.current = response.order_id;
    return { orderId: response.order_id };
  };

  const captureOrder = async (orderId: string) => {
    const response = await protectedPost<CaptureResponse>(`/api/core/bookings/${bookingId}/payment/paypal/capture/`, { order_id: orderId });
    if (!response?.success || !['HELD', 'ALREADY_PROCESSED'].includes(String(response.status))) {
      throw new Error(responseMessage(response, 'PayPal payment could not be completed.'));
    }
    setWorking(false);
    setError(null);
    lastOrderIdRef.current = null;
    await onSuccess?.();
  };

  const approve = async ({ orderId }: OnApproveDataOneTimePayments) => {
    try {
      await captureOrder(orderId);
    } catch (approveError) {
      fail(approveError instanceof Error ? approveError.message : 'Unable to confirm PayPal payment.');
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-brand-800 dark:bg-brand-950/30">
      <PayPalProvider clientId={clientId} environment={environment} components={['paypal-payments', 'card-fields']} pageType="checkout">
        <PayPalOneTimePaymentButton
          createOrder={createOrder}
          onApprove={approve}
          onCancel={() => setWorking(false)}
          onError={(sdkError) => fail(sdkError.message || 'PayPal payment failed.')}
          presentationMode="auto"
          disabled={disabled || working}
          type="pay"
        />
        <PayPalCardFieldsProvider>
          <MovingCardFields createOrder={createOrder} captureOrder={captureOrder} disabled={disabled || working} onError={fail} />
        </PayPalCardFieldsProvider>
      </PayPalProvider>
      {error && <div className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400" role="alert">{error}</div>}
      {working && <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">Waiting for secure PayPal confirmation…</p>}
    </div>
  );
}
