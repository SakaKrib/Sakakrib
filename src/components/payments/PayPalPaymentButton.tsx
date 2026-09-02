import { useState } from 'react';
import {
  PayPalProvider,
  PayPalOneTimePaymentButton,
  PayPalSubscriptionButton,
  type OnApproveDataOneTimePayments,
  type OnApproveDataSubscriptions,
} from '@paypal/react-paypal-js/sdk-v6';

import { protectedPost } from '@/lib/djangoApi';

export type PayPalButtonMode = 'ONE_TIME' | 'SUBSCRIPTION';

interface PayPalPaymentButtonProps {
  mode: PayPalButtonMode;
  paymentIntentId?: string | null;
  planId?: string | null;
  billingCycle?: 'MONTHLY' | 'ANNUAL';
  onSuccess: () => Promise<void> | void;
  onError?: (message: string) => void;
  disabled?: boolean;
}

interface ListingStartResponse {
  success?: boolean;
  detail?: string;
  message?: string;
  provider_reference?: string;
  provider_amount?: string;
  provider_currency?: string;
}

interface ListingCaptureResponse {
  success?: boolean;
  status?: string;
  listing_id?: string;
  detail?: string;
  message?: string;
}

interface SubscriptionCheckoutResponse {
  success?: boolean;
  detail?: string;
  paypal_subscription_id?: string;
  invoice_id?: string;
}

interface SubscriptionApproveResponse {
  success?: boolean;
  detail?: string;
  status?: string;
}

const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;
const environment = (import.meta.env.VITE_PAYPAL_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';

function errorMessage(data: { detail?: string; message?: string } | null, fallback: string) {
  return data?.detail || data?.message || fallback;
}

export default function PayPalPaymentButton({
  mode,
  paymentIntentId,
  planId,
  billingCycle,
  onSuccess,
  onError,
  disabled = false,
}: PayPalPaymentButtonProps) {
  const [working, setWorking] = useState(false);

  if (!clientId) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
        PayPal is not currently configured for this environment.
      </div>
    );
  }

  const fail = (message: string) => {
    setWorking(false);
    onError?.(message);
  };

  const createOneTimeOrder = async () => {
    if (!paymentIntentId) throw new Error('A listing payment intent is required.');
    setWorking(true);

    const response = await protectedPost<ListingStartResponse>('/api/payments/listing/start/', {
      payment_intent_id: paymentIntentId,
      provider: 'paypal',
    });

    if (!response?.success || !response.provider_reference) {
      setWorking(false);
      throw new Error(errorMessage(response, 'Unable to start PayPal payment.'));
    }

    return { orderId: response.provider_reference };
  };

  const approveOneTime = async ({ orderId }: OnApproveDataOneTimePayments) => {
    if (!paymentIntentId) return fail('The listing payment intent is missing.');

    try {
      const response = await protectedPost<ListingCaptureResponse>('/api/payments/listing/paypal/capture/', {
        payment_intent_id: paymentIntentId,
        order_id: orderId,
      });
      if (!response?.success || response.status !== 'PAID') {
        throw new Error(errorMessage(response, 'PayPal payment could not be confirmed.'));
      }
      setWorking(false);
      await onSuccess();
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Unable to confirm PayPal payment.');
    }
  };

  const createSubscription = async () => {
    if (!planId || !billingCycle) throw new Error('A subscription plan and billing cycle are required.');
    setWorking(true);

    const response = await protectedPost<SubscriptionCheckoutResponse>('/api/subscriptions/checkout/', {
      plan_id: planId,
      billing_cycle: billingCycle,
      provider: 'paypal',
    });

    if (!response?.success || !response.paypal_subscription_id) {
      setWorking(false);
      throw new Error(errorMessage(response, 'Unable to start PayPal subscription checkout.'));
    }

    try {
      sessionStorage.setItem('pendingPaypalInvoiceId', response.invoice_id || '');
    } catch {
      // Non-fatal: Django still receives the subscription ID during approval.
    }

    return { subscriptionId: response.paypal_subscription_id };
  };

  const approveSubscription = async ({ subscriptionId }: OnApproveDataSubscriptions) => {
    let invoiceId = '';
    try {
      invoiceId = sessionStorage.getItem('pendingPaypalInvoiceId') || '';
    } catch {
      // Fall through to the explicit error below.
    }

    if (!invoiceId) {
      return fail('The PayPal subscription invoice reference is missing.');
    }

    try {
      const response = await protectedPost<SubscriptionApproveResponse>('/api/subscriptions/paypal/approve/', {
        invoice_id: invoiceId,
        paypal_subscription_id: subscriptionId,
      });
      if (!response?.success) {
        throw new Error(errorMessage(response, 'PayPal subscription could not be confirmed.'));
      }
      try {
        sessionStorage.removeItem('pendingPaypalInvoiceId');
      } catch {
        // Non-fatal.
      }
      setWorking(false);
      await onSuccess();
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Unable to confirm PayPal subscription.');
    }
  };

  const commonStyle = {
    layout: 'vertical' as const,
    shape: 'rect' as const,
    height: 44,
    tagline: false,
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <PayPalProvider
        clientId={clientId}
        environment={environment}
        components={mode === 'SUBSCRIPTION' ? ['paypal-subscriptions'] : ['paypal-payments']}
        pageType="checkout"
      >
        {mode === 'ONE_TIME' ? (
          <PayPalOneTimePaymentButton
            createOrder={createOneTimeOrder}
            onApprove={approveOneTime}
            onCancel={() => setWorking(false)}
            onError={(error) => fail(error.message || 'PayPal payment failed.')}
            presentationMode="auto"
            disabled={disabled || working}
            style={commonStyle}
          />
        ) : (
          <PayPalSubscriptionButton
            createSubscription={createSubscription}
            onApprove={approveSubscription}
            onCancel={() => setWorking(false)}
            onError={(error) => fail(error.message || 'PayPal subscription checkout failed.')}
            presentationMode="auto"
            disabled={disabled || working}
            type="subscribe"
            style={commonStyle}
          />
        )}
      </PayPalProvider>
      {working && (
        <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
          Confirming your payment securely…
        </p>
      )}
    </div>
  );
}
