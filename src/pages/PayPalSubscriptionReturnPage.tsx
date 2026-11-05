import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { protectedGet, protectedPost } from '@/lib/djangoApi';
import { useNav } from '@/context/NavContext';
import { usePaymentStatusSocket, type PaymentSocketStatus } from '@/lib/usePaymentStatusSocket';

interface InvoiceStatusResponse { id?: string; invoice_id?: string; status: string; result_description?: string | null; listing_id?: string | null; }
interface UpgradeConfirmResponse { success?: boolean; status?: string; detail?: string; target_plan_name?: string; }

export default function PayPalSubscriptionReturnPage() {
  const { navigate } = useNav();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const invoiceId = params.get('invoice_id');
  const paypalSubscriptionId = params.get('subscription_id');
  const returnStateToken = params.get('state');
  const [state, setState] = useState<'waiting' | 'success' | 'failed'>('waiting');
  const [message, setMessage] = useState('We are securely confirming your PayPal payment. Please keep this page open.');
  const { event, connected, connectionError } = usePaymentStatusSocket(invoiceId);

  // PayPal may reopen the app through its HTTPS return URL instead of
  // invoking the SDK's in-WebView onApprove callback. Bind the returned
  // subscription ID to the invoice in that case; the webhook remains the
  // only authority that marks the invoice PAID.
  useEffect(() => {
    if (!invoiceId || !paypalSubscriptionId) return;
    let cancelled = false;
    void protectedPost('/api/subscriptions/paypal/approve/', {
      invoice_id: invoiceId,
      paypal_subscription_id: paypalSubscriptionId,
    }).catch((error) => {
      if (!cancelled) {
        console.warn('Unable to register PayPal return approval:', error);
      }
    });
    return () => { cancelled = true; };
  }, [invoiceId, paypalSubscriptionId]);

  useEffect(() => {
    if (!event || event.type !== 'payment_status') return;
    if (event.status === 'PAID') {
      setState('success');
      setMessage(event.message || 'Your payment has been confirmed and your subscription is active.');
    } else if (event.status === 'UPGRADED') {
      setState('success');
      setMessage(event.message || 'Your PayPal subscription plan has been upgraded successfully.');
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
        const upgrade = await protectedPost<UpgradeConfirmResponse>('/api/subscriptions/upgrade/', { provider: 'paypal', action: 'confirm', invoice_id: invoiceId });
        if (cancelled) return;
        if (upgrade?.success && upgrade.status === 'UPGRADED') {
          setState('success');
          setMessage(upgrade.target_plan_name ? `Your PayPal subscription has been upgraded to ${upgrade.target_plan_name}. The new recurring price applies from the next billing cycle.` : 'Your PayPal subscription plan has been upgraded successfully.');
          return;
        }
      } catch {
        // Normal PayPal subscription creation invoices are not upgrade invoices.
      }
      try {
        const invoice = returnStateToken
          ? await protectedGet<InvoiceStatusResponse>(`/api/subscriptions/paypal/return-status/?state=${encodeURIComponent(returnStateToken)}`)
          : await protectedGet<InvoiceStatusResponse>(`/api/subscriptions/invoices/${encodeURIComponent(invoiceId)}/`);
        if (cancelled) return;
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
      }
    };
    void checkStatus();
    const timer = window.setInterval(checkStatus, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [invoiceId, returnStateToken]);

  const continueAfterSuccess = () => {
    // RoleDashboardRouter resolves this to the landlord or real-estate PMS.
    navigate('pms-dashboard');
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center px-4 py-12">
      <div className="w-full rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
        {state === 'waiting' && <Loader2 className="mx-auto h-14 w-14 animate-spin text-brand-600" />}
        {state === 'success' && <CheckCircle2 className="mx-auto h-14 w-14 text-success-600" />}
        {state === 'failed' && <XCircle className="mx-auto h-14 w-14 text-error-600" />}
        <h1 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">{state === 'waiting' ? 'Confirming your payment' : state === 'success' ? 'Payment successful' : 'Payment unsuccessful'}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-600 dark:text-gray-300">{message}</p>
        {state === 'waiting' && <div className="mx-auto mt-6 max-w-sm rounded-xl bg-gray-50 p-4 text-left text-xs text-gray-600 dark:bg-gray-800/70 dark:text-gray-300"><p className="font-semibold text-gray-800 dark:text-white">Secure confirmation in progress</p><p className="mt-1">PayPal is sending the payment result to SakaKrib. We will update this page automatically.</p><p className="mt-2">Live connection: {connected ? 'connected' : 'reconnecting…'}</p>{connectionError && <p className="mt-1 text-amber-600 dark:text-amber-400">{connectionError}</p>}</div>}
        {state === 'success' && <button type="button" onClick={continueAfterSuccess} className="btn-primary mt-7 inline-flex items-center gap-2">Go to PMS Management Dashboard</button>}
        {state === 'failed' && (
          <button
            type="button"
            onClick={() => navigate('subscription-plans')}
            className="btn-primary mt-7 inline-flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Back to Plans
          </button>
        )}
      </div>
    </div>
  );
}
