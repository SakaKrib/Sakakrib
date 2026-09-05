import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, FileText, RefreshCw } from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';

type RecordValue = Record<string, any>;

type Activity = {
  id: string;
  title: string;
  detail: string;
  createdAt: string | null;
  kind: 'notification' | 'invoice' | 'payment';
};

const date = (value: unknown) => value
  ? new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(String(value)))
  : '—';

const money = (value: unknown) => `KES ${Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

export default function LandlordPMSActivity() {
  const [data, setData] = useState<RecordValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await protectedGet<RecordValue>('/api/core/pms/dashboard/'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load recent PMS activity.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const activity = useMemo<Activity[]>(() => {
    const notifications = Array.isArray(data?.notifications) ? data.notifications : [];
    const invoices = Array.isArray(data?.rentInvoices) ? data.rentInvoices : [];
    const payments = Array.isArray(data?.rentPayments) ? data.rentPayments : [];

    const rows: Activity[] = [
      ...notifications.slice(0, 8).map((item: RecordValue) => ({
        id: `notification-${item.id}`,
        title: item.title || 'PMS notification',
        detail: item.message || 'New PMS notification',
        createdAt: item.created_at || null,
        kind: 'notification' as const,
      })),
      ...invoices.slice(0, 8).map((item: RecordValue) => ({
        id: `invoice-${item.id}`,
        title: item.invoice_number || 'Rent invoice',
        detail: `${money(item.amount_kes)} · ${String(item.status || 'UNKNOWN').replaceAll('_', ' ')}`,
        createdAt: item.updated_at || item.created_at || null,
        kind: 'invoice' as const,
      })),
      ...payments.slice(0, 8).map((item: RecordValue) => ({
        id: `payment-${item.id}`,
        title: item.provider_reference || item.mpesa_receipt || 'Rent payment',
        detail: `${money(item.amount_kes)} · ${String(item.status || 'UNKNOWN').replaceAll('_', ' ')}`,
        createdAt: item.paid_at || item.created_at || null,
        kind: 'payment' as const,
      })),
    ];

    return rows
      .sort((a, b) => new Date(String(b.createdAt || 0)).getTime() - new Date(String(a.createdAt || 0)).getTime())
      .slice(0, 10);
  }, [data]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Activity</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Recent PMS activity</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">A read-only timeline assembled from Django notifications, invoices and recorded payments.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-brand-900" aria-label="Refresh activity">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <div className="mt-4 rounded-xl bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-300">{error}</div>}
      {loading && !data && <div className="flex min-h-24 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-brand-600" /></div>}
      {!loading && !error && !activity.length && <p className="py-8 text-center text-sm text-gray-500">No PMS activity has been recorded yet.</p>}

      {!loading && activity.length > 0 && (
        <div className="mt-4 divide-y divide-gray-100 dark:divide-brand-800">
          {activity.map((item) => {
            const Icon = item.kind === 'payment' ? CheckCircle2 : item.kind === 'invoice' ? FileText : Bell;
            const tone = item.kind === 'payment' ? 'text-success-600 bg-success-50 dark:bg-success-900/20' : item.kind === 'invoice' ? 'text-brand-600 bg-brand-50 dark:bg-brand-900/20' : 'text-warning-600 bg-warning-50 dark:bg-warning-900/20';
            return (
              <div key={item.id} className="flex items-start gap-3 py-3">
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{item.title}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{item.detail}</p>
                </div>
                <span className="shrink-0 text-[11px] text-gray-400">{date(item.createdAt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
