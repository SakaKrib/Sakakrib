import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';
import { useNav } from '@/context/NavContext';
import { Capacitor } from '@capacitor/core';

interface SubscriptionInvoiceResponse {
  id?: string;
  invoice_id?: string;
  status: string;
  result_description?: string | null;
  listing_id?: string | null;
  client_platform?: string;
}

type PaymentState = 'checking' | 'success' | 'failed' | 'unconfirmed';

export default function PayPalSubscriptionCancelPage() {
  const { navigate } = useNav();
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get('invoice_id');
  const returnStateToken = params.get('state');
  const [state, setState] = useState<PaymentState>('checking');
  const [message, setMessage] = useState('We are checking PayPal’s final payment status. Please keep SakaKrib open.');
  const [listingId, setListingId] = useState<string | null>(null);
  const [clientPlatform, setClientPlatform] = useState('web');

  useEffect(() => {
    if (!invoiceId) {
      setState('unconfirmed');
      setMessage('We could not find the payment reference, so we cannot confirm whether the payment completed.');
      return;
    }

    let disposed = false;
    let attempts = 0;

    const checkPayment = async () => {
      attempts += 1;
      try {
        const invoice = returnStateToken
          ? await protectedGet<SubscriptionInvoiceResponse>(
              `/api/subscriptions/paypal/return-status/?state=${encodeURIComponent(returnStateToken)}`,
            )
          : await protectedGet<SubscriptionInvoiceResponse>(
              `/api/subscriptions/invoices/${encodeURIComponent(invoiceId)}/`,
            );
        if (disposed) return;
        setListingId(invoice.listing_id || null);
        setClientPlatform(String(invoice.client_platform || 'web').toLowerCase());

        const status = String(invoice.status || '').toUpperCase();

        if (status === 'PAID') {
          setState('success');
          setMessage('PayPal confirmed your payment. Your subscription is active.');
          return;
        }

        if (['FAILED', 'CANCELLED', 'REFUNDED'].includes(status)) {
          setState('failed');
          setMessage(invoice.result_description || 'PayPal did not complete this payment. No new subscription has been activated.');
          return;
        }

        // PayPal can open its cancel URL before its payment webhook reaches
        // Django. Never label a transaction cancelled while its invoice is
        // still pending; keep checking for the authoritative provider result.
        if (attempts >= 12) {
          setState('unconfirmed');
          setMessage('PayPal has not sent a final result yet. If you approved the payment, do not pay again; check your subscription status in SakaKrib shortly.');
        } else {
          setState('checking');
          setMessage('We are still waiting for PayPal to confirm the transaction. Your payment is not marked as cancelled.');
        }
      } catch {
        if (disposed) return;
        setState('unconfirmed');
        setMessage('We could not verify the payment from this session. Please reopen SakaKrib and check your subscription before trying another payment.');
      }
    };

    void checkPayment();
    const timer = window.setInterval(() => {
      if (attempts < 12 || state === 'unconfirmed') void checkPayment();
    }, 5000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  // The polling loop intentionally runs for the lifetime of this return page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const continueTo = (target: 'pms-dashboard' | 'post-listing' | 'subscription-plans', id?: string | null) => {
    if (clientPlatform === 'android' && !Capacitor.isNativePlatform()) {
      const handoff = new URLSearchParams({ target });
      if (id) handoff.set('listing_id', id);
      window.location.assign(`com.sakakrib.app://paypal-return?${handoff.toString()}`);
      return;
    }
    navigate(target, id || undefined);
  };
  const continueToPms = () => continueTo('pms-dashboard');
  const continueToListing = () => {
    if (listingId) continueTo('post-listing', listingId);
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center px-4 py-12">
      <div className="w-full rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
        {state === 'checking' && <Loader2 className="mx-auto h-14 w-14 animate-spin text-brand-600" />}
        {state === 'success' && <CheckCircle2 className="mx-auto h-14 w-14 text-success-600" />}
        {(state === 'failed' || state === 'unconfirmed') && <XCircle className="mx-auto h-14 w-14 text-error-600" />}
        <h1 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">
          {state === 'checking' ? 'Confirming your payment' : state === 'success' ? 'Payment successful' : state === 'failed' ? 'Payment unsuccessful' : 'Payment not yet confirmed'}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-600 dark:text-gray-300">{message}</p>
        {state === 'success' && (
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={continueToPms} className="btn-primary inline-flex items-center justify-center gap-2">
              Go to PMS Management Dashboard
            </button>
            {listingId && (
              <button type="button" onClick={continueToListing} className="btn-secondary inline-flex items-center justify-center gap-2">
                Continue to Listing
              </button>
            )}
          </div>
        )}
        {(state === 'failed' || state === 'unconfirmed') && (
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={() => continueTo('subscription-plans') className="btn-secondary">Back to Plans</button>
            {state === 'unconfirmed' && (
              <button type="button" onClick={() => window.location.reload()} className="btn-secondary inline-flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4" />Check Payment Again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
