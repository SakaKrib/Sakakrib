import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, FileText, RefreshCw, XCircle } from 'lucide-react';
import { useSubscriptionInvoiceSocket } from '@/lib/useSubscriptionInvoiceSocket';

interface SubscriptionInvoice {
  id: string;
  status: string;
  plan_name?: string | null;
  billing_cycle?: string | null;
  amount_kes?: number | string | null;
  amount_usd?: number | string | null;
  currency?: string | null;
  payment_provider?: string | null;
  payment_method?: string | null;
  provider_reference?: string | null;
  provider_transaction_id?: string | null;
  mpesa_receipt?: string | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  result_description?: string | null;
  upgrade_plan_id?: string | null;
  listing_id?: string | null;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatAmount(value?: number | string | null, currency = 'KES') {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return `${currency} ${value}`;
  return `${currency} ${number.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function statusClasses(status: string) {
  switch (status.toUpperCase()) {
    case 'PAID':
      return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400';
    case 'PENDING':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400';
    case 'FAILED':
    case 'REFUNDED':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400';
    case 'CANCELLED':
      return 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400';
    default:
      return 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950/20 dark:text-brand-300';
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status.toUpperCase()) {
    case 'PAID':
      return <CheckCircle2 className="h-4 w-4" />;
    case 'PENDING':
      return <Clock3 className="h-4 w-4" />;
    case 'FAILED':
    case 'REFUNDED':
      return <XCircle className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
}

export default function PMSInvoiceHistory() {
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { event } = useSubscriptionInvoiceSocket();

  const loadInvoices = useCallback(async () => {
    try {
      setError(null);
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const response = await fetch(`${baseUrl}/api/subscriptions/invoices/`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      const text = await response.text();
      let body: SubscriptionInvoice[] | { detail?: string; error?: string; message?: string } | null = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
      }

      if (!response.ok) {
        const message = body && typeof body === 'object'
          ? ('detail' in body ? body.detail : 'error' in body ? body.error : 'message' in body ? body.message : undefined)
          : undefined;
        throw new Error(message || `Django API request failed (${response.status}).`);
      }

      setInvoices(Array.isArray(body) ? body : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load subscription payment history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    if (event?.type !== 'subscription_invoice') return;
    void loadInvoices();
  }, [event, loadInvoices]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await loadInvoices();
  };

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-2 py-3 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
        <div className="flex items-center justify-between gap-4 px-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
              <FileText className="h-4 w-4" />
              Subscription Payment History
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Your subscription invoices and payment records.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="btn-secondary shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {loading ? (
          <div className="space-y-3">
            <div className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-900" />
            <div className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-900" />
            <div className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-900" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              Unable to load payment history
            </p>
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        ) : invoices.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-800 dark:bg-gray-900/40">
            <FileText className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-3 font-semibold text-gray-900 dark:text-white">No subscription payments yet</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Confirmed subscription payments and invoices will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((invoice) => {
              const reference = invoice.mpesa_receipt || invoice.provider_transaction_id || invoice.provider_reference;
              const period = invoice.billing_period_start || invoice.billing_period_end
                ? `${formatDate(invoice.billing_period_start)} – ${formatDate(invoice.billing_period_end)}`
                : '—';
              const isUpgrade = Boolean(invoice.upgrade_plan_id);

              return (
                <div
                  key={invoice.id}
                  className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {isUpgrade ? 'Subscription Upgrade' : invoice.plan_name || 'Saka Krib Subscription'}
                        </h3>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(invoice.status)}`}>
                          <StatusIcon status={invoice.status} />
                          {invoice.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Invoice {invoice.id}
                      </p>
                    </div>

                    <div className="text-left lg:text-right">
                      <p className="font-bold text-gray-900 dark:text-white">
                        {formatAmount(invoice.amount_kes, 'KES')}
                      </p>
                      {invoice.amount_usd !== null && invoice.amount_usd !== undefined && invoice.amount_usd !== '' && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatAmount(invoice.amount_usd, 'USD')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 text-sm dark:border-gray-800 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Billing</p>
                      <p className="font-medium text-gray-900 dark:text-white">{invoice.billing_cycle || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Provider</p>
                      <p className="font-medium text-gray-900 dark:text-white">{invoice.payment_provider || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Reference</p>
                      <p className="break-all font-medium text-gray-900 dark:text-white">{reference || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Paid</p>
                      <p className="font-medium text-gray-900 dark:text-white">{formatDate(invoice.paid_at || invoice.created_at)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400 sm:flex-row sm:justify-between">
                    <span>Billing period: {period}</span>
                    {invoice.result_description && invoice.status !== 'PAID' && (
                      <span className="sm:text-right">{invoice.result_description}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
