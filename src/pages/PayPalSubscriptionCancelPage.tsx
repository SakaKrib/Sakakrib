import { useEffect, useState } from 'react';
import { Loader2, XCircle } from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';
import { useNav } from '@/context/NavContext';

interface SubscriptionInvoiceResponse {
  id: string;
  listing_id?: string | null;
}

export default function PayPalSubscriptionCancelPage() {
  const { navigate } = useNav();
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get('invoice_id');
  const [listingId, setListingId] = useState<string | null>(params.get('listing_id'));
  const [checkingInvoice, setCheckingInvoice] = useState(false);

  useEffect(() => {
    if (listingId || !invoiceId) return;

    let cancelled = false;
    setCheckingInvoice(true);
    void protectedGet<SubscriptionInvoiceResponse>(
      `/api/subscriptions/invoices/${encodeURIComponent(invoiceId)}/`,
    ).then((invoice) => {
      if (!cancelled && invoice?.listing_id) setListingId(invoice.listing_id);
    }).catch(() => {
      // A cancelled checkout can still return without an accessible invoice.
      // In that case, do not expose a listing action with an unknown ID.
    }).finally(() => {
      if (!cancelled) setCheckingInvoice(false);
    });

    return () => { cancelled = true; };
  }, [invoiceId, listingId]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center px-4 py-12">
      <div className="w-full rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <XCircle className="mx-auto h-14 w-14 text-gray-400" />
        <h1 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">Payment cancelled</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-600 dark:text-gray-300">
          Your PayPal checkout was cancelled. No subscription has been activated. Your saved listing draft is still available.
        </p>
        {checkingInvoice && !listingId && (
          <p className="mt-4 inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking for your saved listing…
          </p>
        )}
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          {listingId && (
            <button type="button" onClick={() => navigate('post-listing', listingId)} className="btn-primary">
              Continue Editing Listing
            </button>
          )}
          <button type="button" onClick={() => navigate('subscription-plans')} className="btn-secondary">
            Back to Plans
          </button>
        </div>
      </div>
    </div>
  );
}
