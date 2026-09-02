import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';

import { protectedGet } from '@/lib/djangoApi';
import { useNav } from '@/context/NavContext';
import { usePaymentStatusSocket, type PaymentSocketStatus } from '@/lib/usePaymentStatusSocket';

interface InvoiceStatusResponse {
  id: string;
  status: string;
  result_description?: string | null;
  listing_id?: string | null;
}

export default function PayPalSubscriptionReturnPage() {
  const { navigate } = useNav();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const invoiceId = params.get('invoice_id');
  const [state, setState] = useState<'waiting' | 'success' | 'failed'>('waiting');
  const [message, setMessage] = useState('We are securely confirming your PayPal payment. Please keep this page open.');
  const [listingId, setListingId] = useState<string | null>(null);
  const { event, connected, connectionError } = usePaymentStatusSocket(invoiceId);

  useEffect(() => {
    if (!event || event.type !== 'payment_status') return;
    if (event.listing_id) setListingId(event.listing_id);
    if (event.status === 'PAID') {
      setState('success');
      setMessage(event.message || 'Your payment has been confirmed and your subscription is active.');
    } else if (event.status === 'FAILED' || event.status === 'CANCELLED' || event.status === 'REFUNDED') {
      setState('failed');
      setMessage(event.message || 'We could not confirm your PayPal payment.');
    }
  }, [event]);

  useEffect(() => {
    if (!invoiceId) {
      setState('failed');
      setMessage('The payment reference is missing. Please return to your listing and try again.');
      return;
    }

    let cancelled = false;
    const checkStatus = async () => {
      try {
        const invoice = await protectedGet<InvoiceStatusResponse>(`/api/subscriptions/invoices/${encodeURIComponent(invoiceId)}/`);
        if (cancelled) return;
        if (invoice.listing_id) setListingId(invoice.listing_id);
        const status = invoice.status.toUpperCase() as PaymentSocketStatus | string;
        if (status === 'PAID') {
          setState('success');
          setMessage('Your payment has been confirmed and your subscription is active.');
        } else if (status === 'FAILED' || status === 'CANCELLED' || status === 'REFUNDED') {
          setState('failed');
          setMessage(invoice.result_description || 'We could not confirm your PayPal payment.');
        }
      } catch {
        // The WebSocket remains the primary real-time confirmation path.
        // A later status check can recover if the first request races login refresh.
      }
    };

    void checkStatus();
    const timer = window.setInterval(checkStatus, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [invoiceId]);

  const continueToListing = () => {
    if (listingId) {
      navigate('post-listing', listingId);
      return;
    }
    navigate('subscription-plans');
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center px-4 py-12">
      <div className="w-full rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
        {state === 'waiting' && <Loader2 className="mx-auto h-14 w-14 animate-spin text-brand-600" />}
        {state === 'success' && <CheckCircle2 className="mx-auto h-14 w-14 text-success-600" />}
        {state === 'failed' && <XCircle className="mx-auto h-14 w-14 text-error-600" />}

        <h1 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">
          {state === 'waiting' ? 'Confirming your payment' : state === 'success' ? 'Payment successful' : 'Payment unsuccessful'}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-600 dark:text-gray-300">{message}</p>

        {state === 'waiting' && (
          <div className="mx-auto mt-6 max-w-sm rounded-xl bg-gray-50 p-4 text-left text-xs text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
            <p className="font-semibold text-gray-800 dark:text-white">Secure confirmation in progress</p>
            <p className="mt-1">PayPal is sending the payment result to SakaKrib. We will update this page automatically.</p>
            <p className="mt-2">Live connection: {connected ? 'connected' : 'reconnecting…'}</p>
            {connectionError && <p className="mt-1 text-amber-600 dark:text-amber-400">{connectionError}</p>}
          </div>
        )}

        {state === 'success' && (
          <button type="button" onClick={continueToListing} className="btn-primary mt-7 inline-flex items-center gap-2">
            Continue to Listing
          </button>
        )}

        {state === 'failed' && (
          <button type="button" onClick={() => navigate('post-listing', listingId || undefined)} className="btn-primary mt-7 inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
