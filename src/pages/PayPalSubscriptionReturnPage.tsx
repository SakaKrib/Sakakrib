import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { protectedPost } from '@/lib/djangoApi';
import { useNav } from '@/context/NavContext';

export default function PayPalSubscriptionReturnPage() {
  const { navigate } = useNav();
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your PayPal subscription securely...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invoiceId = params.get('invoice_id');
    const paypalSubscriptionId = params.get('subscription_id');

    if (!invoiceId || !paypalSubscriptionId) {
      setState('error');
      setMessage('PayPal did not return the required subscription confirmation details.');
      return;
    }

    let cancelled = false;

    void protectedPost<{
      success: boolean;
      subscription_id?: string;
      status?: string;
    }>('/api/subscriptions/paypal/approve/', {
      invoice_id: invoiceId,
      paypal_subscription_id: paypalSubscriptionId,
    }).then((result) => {
      if (cancelled) return;
      if (result?.success && result.status === 'PAID') {
        setState('success');
        setMessage('Your subscription has been verified and activated.');
      } else {
        throw new Error('PayPal subscription could not be confirmed.');
      }
    }).catch((error) => {
      if (cancelled) return;
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Unable to confirm the PayPal subscription.');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-4 py-12">
      <div className="card w-full p-8 text-center">
        {state === 'loading' && <Loader2 className="mx-auto h-12 w-12 animate-spin text-brand-600" />}
        {state === 'success' && <CheckCircle2 className="mx-auto h-12 w-12 text-success-600" />}
        {state === 'error' && <XCircle className="mx-auto h-12 w-12 text-error-600" />}

        <h1 className="mt-5 text-xl font-bold text-gray-900 dark:text-white">
          {state === 'loading' ? 'Confirming payment' : state === 'success' ? 'Subscription active' : 'Payment not confirmed'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{message}</p>

        {state !== 'loading' && (
          <button type="button" onClick={() => navigate('subscription-plans')} className="btn-primary mt-6">
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
