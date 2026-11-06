import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { protectedGet, protectedPost } from '@/lib/djangoApi';
import { useNav } from '@/context/NavContext';
import { usePaymentStatusSocket, type PaymentSocketStatus } from '@/lib/usePaymentStatusSocket';
import { Capacitor } from '@capacitor/core';

interface InvoiceStatusResponse { id?: string; invoice_id?: string; status: string; result_description?: string | null; listing_id?: string | null; upgrade?: boolean; client_platform?: string; plan_name?: string | null; billing_cycle?: string | null; }

export default function PayPalSubscriptionReturnPage() {
  const { navigate } = useNav();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const invoiceId = params.get('invoice_id');
  const paypalSubscriptionId = params.get('subscription_id');
  const returnStateToken = params.get('state');
  const [state, setState] = useState<'waiting' | 'success' | 'failed'>('waiting');
  const [message, setMessage] = useState('We are securely confirming your PayPal payment. Please keep this page open.');
  const [listingId, setListingId] = useState<string | null>(null);
  const [clientPlatform, setClientPlatform] = useState('web');
  const [planName, setPlanName] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<string | null>(null);
  // Signed PayPal return URLs are deliberately polled over HTTP. Do not open
  // an authenticated WebSocket from the external-browser handoff: that browser
  // may not share the app's HttpOnly API cookies and would be rejected at once.
  const { event, connected, connectionError } = usePaymentStatusSocket(returnStateToken ? null : invoiceId);

  // PayPal may reopen the app through its HTTPS return URL instead of
  // invoking the SDK's in-WebView onApprove callback. Bind the returned
  // subscription ID to the invoice in that case; the webhook remains the
  // only authority that marks the invoice PAID.
  useEffect(() => {
    if (!invoiceId || !paypalSubscriptionId || !returnStateToken) return;
    let cancelled = false;
    void protectedPost('/api/subscriptions/paypal/approve/', {
      invoice_id: invoiceId,
      paypal_subscription_id: paypalSubscriptionId,
      state: returnStateToken,
    }).catch((error) => {
      if (!cancelled) {
        console.warn('Unable to register PayPal return approval:', error);
      }
    });
    return () => { cancelled = true; };
  }, [invoiceId, paypalSubscriptionId, returnStateToken]);

  useEffect(() => {
    if (!event || event.type !== 'payment_status') return;
    if (event.status === 'PAID' || event.status === 'UPGRADED') {
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
        const invoice = returnStateToken
          ? await protectedGet<InvoiceStatusResponse>(`/api/subscriptions/paypal/return-status/?state=${encodeURIComponent(returnStateToken)}`)
          : await protectedGet<InvoiceStatusResponse>(`/api/subscriptions/invoices/${encodeURIComponent(invoiceId)}/`);
        if (cancelled) return;
        setListingId(invoice.listing_id || null);
        setClientPlatform(String(invoice.client_platform || 'web').toLowerCase());
        setPlanName(invoice.plan_name || null);
        setBillingCycle(invoice.billing_cycle || null);
        if (invoice.upgrade && returnStateToken && invoice.status.toUpperCase() === 'PENDING') {
          try {
            const upgrade = await protectedPost<{
              success?: boolean;
              upgrade_scheduled?: boolean;
              target_plan_name?: string;
            }>('/api/subscriptions/paypal/upgrade/confirm/', {
              invoice_id: invoiceId,
              state: returnStateToken,
            });
            if (cancelled) return;
            if (upgrade?.success && upgrade.upgrade_scheduled) {
              setState('success');
              setMessage(
                upgrade.target_plan_name
                  ? `Your PayPal subscription upgrade to ${upgrade.target_plan_name} is confirmed and will take effect on the next billing cycle.`
                  : 'Your PayPal subscription upgrade is confirmed and will take effect on the next billing cycle.',
              );
              return;
            }
          } catch {
            // PayPal may need a moment to apply the revised plan; retry on the next status poll.
          }
        }

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

  // Web checkouts stay on the website. If Android did not auto-open the
  // verified HTTPS App Link, explicitly launch the installed app; its native
  // listener closes this Custom Tab and routes to the selected destination.
  const continueTo = (target: 'pms-dashboard' | 'post-listing' | 'subscription-plans', id?: string | null) => {
    if (target === 'subscription-plans' && planName && billingCycle) {
      try {
        sessionStorage.setItem('sakakrib.paypal.subscription.return.context', JSON.stringify({
          plan_name: planName,
          billing_cycle: billingCycle,
        }));
      } catch {
        // Navigation still works if browser storage is unavailable.
      }
    }
    if (clientPlatform === 'android' && !Capacitor.isNativePlatform()) {
      const handoff = new URLSearchParams({ target });
      if (id) handoff.set('listing_id', id);
      if (planName) handoff.set('plan_name', planName);
      if (billingCycle) handoff.set('billing_cycle', billingCycle);
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
        {state === 'waiting' && <Loader2 className="mx-auto h-14 w-14 animate-spin text-brand-600" />}
        {state === 'success' && <CheckCircle2 className="mx-auto h-14 w-14 text-success-600" />}
        {state === 'failed' && <XCircle className="mx-auto h-14 w-14 text-error-600" />}
        <h1 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">{state === 'waiting' ? 'Confirming your payment' : state === 'success' ? 'Payment successful' : 'Payment unsuccessful'}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-600 dark:text-gray-300">{message}</p>
        {state === 'waiting' && <div className="mx-auto mt-6 max-w-sm rounded-xl bg-gray-50 p-4 text-left text-xs text-gray-600 dark:bg-gray-800/70 dark:text-gray-300"><p className="font-semibold text-gray-800 dark:text-white">Secure confirmation in progress</p><p className="mt-1">PayPal is sending the payment result to SakaKrib. We will update this page automatically.</p><p className="mt-2">Live connection: {returnStateToken ? 'secure signed status polling active' : connected ? 'connected' : 'reconnecting…'}</p>{!returnStateToken && connectionError && <p className="mt-1 text-amber-600 dark:text-amber-400">{connectionError}</p>}</div>}
        {state === 'success' && (
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={continueToPms} className="btn-primary inline-flex items-center justify-center gap-2">Go to PMS Management Dashboard</button>
            {listingId && <button type="button" onClick={continueToListing} className="btn-secondary inline-flex items-center justify-center gap-2">Continue to Listing</button>}
          </div>
        )}
        {state === 'failed' && (
          <button type="button" onClick={() => continueTo('subscription-plans')} className="btn-primary mt-7 inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />Back to Plans
          </button>
        )}
      </div>
    </div>
  );
}
