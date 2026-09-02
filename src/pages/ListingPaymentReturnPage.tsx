import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Loader2, ArrowRight, RefreshCw } from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';
import { usePaymentStatusSocket, type PaymentSocketStatus } from '@/lib/usePaymentStatusSocket';

interface IntentStatusResponse {
  id: string;
  status: PaymentSocketStatus | 'EXPIRED';
  listing_id?: string | null;
  provider?: string | null;
  provider_reference?: string | null;
  paid_at?: string | null;
  expires_at?: string | null;
}

const params = new URLSearchParams(window.location.search);
const intentId = params.get('payment_intent_id');

export default function ListingPaymentReturnPage() {
  const [status, setStatus] = useState<PaymentSocketStatus | 'EXPIRED'>('PENDING');
  const [listingId, setListingId] = useState<string | null>(null);
  const [message, setMessage] = useState('Waiting for secure payment confirmation…');
  const [loading, setLoading] = useState(true);
  const [pollError, setPollError] = useState<string | null>(null);
  const { event, connected, connectionError } = usePaymentStatusSocket(intentId);

  const loadStatus = async () => {
    if (!intentId) {
      setLoading(false);
      setStatus('FAILED');
      setMessage('The listing payment reference is missing.');
      return;
    }
    try {
      const response = await protectedGet<IntentStatusResponse>(`/api/listings/payment-intents/${encodeURIComponent(intentId)}/`);
      setStatus(response.status);
      setListingId(response.listing_id || null);
      if (response.status === 'PAID') setMessage('Your KES 1,000 listing payment has been confirmed.');
      else if (response.status === 'FAILED') setMessage('Your listing payment was not completed.');
      else if (response.status === 'EXPIRED') setMessage('This listing payment request has expired.');
      else setMessage('Payment is still being confirmed securely.');
      setPollError(null);
    } catch (error) {
      setPollError(error instanceof Error ? error.message : 'Unable to retrieve payment status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
    const timer = window.setInterval(() => {
      if (status === 'PENDING') void loadStatus();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [intentId, status]);

  useEffect(() => {
    if (!event || event.type !== 'payment_status') return;
    setStatus(event.status || 'PENDING');
    setListingId(event.listing_id || null);
    setMessage(event.message || 'Payment status updated.');
    setLoading(false);
  }, [event]);

  const continueTarget = useMemo(() => listingId ? `/#post-listing/${encodeURIComponent(listingId)}` : '/#post-listing', [listingId]);

  const goToListing = () => window.location.assign(continueTarget);

  if (loading && status === 'PENDING') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-brand-950">
        <section className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-xl dark:border-gray-800 dark:bg-gray-900">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-brand-600" />
          <h1 className="mt-5 text-2xl font-bold text-gray-900 dark:text-white">Confirming your payment</h1>
          <p className="mt-3 text-gray-600 dark:text-gray-300">We are waiting for the secure provider confirmation. Please keep this page open.</p>
          {!connected && connectionError && <p className="mt-4 text-sm text-amber-600 dark:text-amber-400">{connectionError} We will continue checking the payment status securely.</p>}
        </section>
      </main>
    );
  }

  if (status === 'PAID') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-brand-950">
        <section className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-xl dark:border-gray-800 dark:bg-gray-900">
          <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" />
          <h1 className="mt-5 text-3xl font-bold text-gray-900 dark:text-white">Payment Successful</h1>
          <p className="mt-3 text-gray-600 dark:text-gray-300">{message}</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Your listing draft is ready for you to continue.</p>
          <button onClick={goToListing} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">
            Continue to Listing <ArrowRight className="h-5 w-5" />
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-brand-950">
      <section className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <CircleAlert className="mx-auto h-16 w-16 text-red-600" />
        <h1 className="mt-5 text-3xl font-bold text-gray-900 dark:text-white">Payment Not Completed</h1>
        <p className="mt-3 text-gray-600 dark:text-gray-300">{message}</p>
        {pollError && <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">{pollError}</p>}
        <button onClick={goToListing} className="mt-7 inline-flex items-center gap-2 rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800">
          <RefreshCw className="h-5 w-5" /> Try Again
        </button>
      </section>
    </main>
  );
}
