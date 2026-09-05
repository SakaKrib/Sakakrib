import { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';

type RecordValue = Record<string, any>;

type MonthPoint = {
  key: string;
  label: string;
  invoiced: number;
  collected: number;
};

const money = (value: number) => `KES ${value.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
const status = (value: unknown) => String(value || '').trim().toUpperCase();

function monthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

function parseDate(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function LandlordPMSCollectionTrend() {
  const [data, setData] = useState<RecordValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await protectedGet<RecordValue>('/api/core/pms/dashboard/'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load collection trend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const points = useMemo<MonthPoint[]>(() => {
    const now = new Date();
    const months: MonthPoint[] = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return {
        key: monthKey(date),
        label: new Intl.DateTimeFormat('en-KE', { month: 'short' }).format(date),
        invoiced: 0,
        collected: 0,
      };
    });
    const byKey = new Map(months.map((point) => [point.key, point]));

    const invoices = Array.isArray(data?.rentInvoices) ? data.rentInvoices : [];
    invoices.forEach((invoice: RecordValue) => {
      const due = parseDate(invoice.due_date || invoice.billing_period_start);
      if (!due) return;
      const point = byKey.get(monthKey(due));
      if (point) point.invoiced += Number(invoice.amount_kes || 0);
    });

    const payments = Array.isArray(data?.rentPayments) ? data.rentPayments : [];
    payments.forEach((payment: RecordValue) => {
      if (status(payment.status) !== 'PAID') return;
      const paid = parseDate(payment.paid_at || payment.created_at);
      if (!paid) return;
      const point = byKey.get(monthKey(paid));
      if (point) point.collected += Number(payment.amount_kes || 0);
    });

    return months;
  }, [data]);

  const maxValue = Math.max(1, ...points.flatMap((point) => [point.invoiced, point.collected]));

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-brand-800 dark:bg-brand-950"><RefreshCw className="h-6 w-6 animate-spin text-brand-600" /></div>;
  }

  if (error) {
    return <div className="rounded-2xl border border-error-200 bg-error-50 p-5 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-300">{error}</div>;
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-brand-600" /><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Collection trend</p></div>
          <h3 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Six-month rent performance</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Invoiced amounts follow Django PMS invoice dates; collected amounts follow confirmed Django payments.</p>
        </div>
        <button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      <div className="mt-6 grid grid-cols-6 gap-2 sm:gap-4">
        {points.map((point) => (
          <div key={point.key} className="min-w-0">
            <div className="flex h-44 items-end justify-center gap-1.5 rounded-xl bg-gray-50 p-2 dark:bg-brand-900/40 sm:gap-2">
              <div className="w-1/2 rounded-t-md bg-brand-300 transition-all dark:bg-brand-700" style={{ height: `${Math.max(4, (point.invoiced / maxValue) * 100)}%` }} title={`Invoiced ${money(point.invoiced)}`} />
              <div className="w-1/2 rounded-t-md bg-success-500 transition-all" style={{ height: `${Math.max(4, (point.collected / maxValue) * 100)}%` }} title={`Collected ${money(point.collected)}`} />
            </div>
            <p className="mt-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">{point.label}</p>
            <p className="mt-1 truncate text-center text-[10px] text-gray-400" title={`Collected ${money(point.collected)}`}>{money(point.collected)}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-brand-300 dark:bg-brand-700" />Invoiced</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-success-500" />Collected</span>
      </div>
    </section>
  );
}
