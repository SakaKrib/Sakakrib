import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Home,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';
import LandlordPMS from './LandlordPMS';

type RecordValue = Record<string, any>;

const money = (value: unknown) =>
  `KES ${Number(value || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const date = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short' }).format(
        new Date(String(value)),
      )
    : '—';

function Stat({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  icon: typeof Home;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const iconTone =
    tone === 'success'
      ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300'
      : tone === 'warning'
        ? 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300'
        : tone === 'danger'
          ? 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300'
          : 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-brand-800 dark:bg-brand-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconTone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

export default function LandlordPMSCommandCenter() {
  const [data, setData] = useState<RecordValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const dashboard = await protectedGet<RecordValue>('/api/core/pms/dashboard/');
      setData(dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load PMS statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const derived = useMemo(() => {
    const units = Array.isArray(data?.units) ? data.units : [];
    const invoices = Array.isArray(data?.rentInvoices) ? data.rentInvoices : [];

    const occupied = units.filter((unit: RecordValue) => Boolean(unit.renter_assoc_id));
    const available = units.filter(
      (unit: RecordValue) => !unit.renter_assoc_id && String(unit.availability || '').toLowerCase() === 'available',
    );
    const paid = invoices.filter((invoice: RecordValue) => String(invoice.status).toUpperCase() === 'PAID');
    const pending = invoices.filter((invoice: RecordValue) =>
      ['DUE', 'PAYMENT_SUBMITTED', 'PENDING'].includes(String(invoice.status).toUpperCase()),
    );

    const upcoming = invoices
      .filter((invoice: RecordValue) => String(invoice.status).toUpperCase() !== 'PAID')
      .filter((invoice: RecordValue) => invoice.due_date)
      .sort((a: RecordValue, b: RecordValue) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 5);

    return {
      units,
      occupied,
      available,
      paid,
      pending,
      upcoming,
      occupancyRate: units.length ? Math.round((occupied.length / units.length) * 100) : 0,
    };
  }, [data]);

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 p-6 text-white shadow-lg dark:border-brand-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-200">Django PMS command center</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Your property portfolio at a glance</h1>
            <p className="mt-1 max-w-2xl text-sm text-brand-100/80">
              These figures are read directly from the landlord PMS API. Django remains authoritative for subscriptions, units, renters, invoices and payments.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold backdrop-blur hover:bg-white/15 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh stats
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-error-500/15 px-4 py-3 text-sm text-red-100">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {!loading && data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Properties / listings" value={Array.isArray(data.listings) ? data.listings.length : 0} icon={Home} />
            <Stat label="Total units" value={derived.units.length} icon={Building2} />
            <Stat label="Occupied units" value={`${derived.occupied.length} · ${derived.occupancyRate}%`} icon={Users} tone="success" />
            <Stat label="Available units" value={derived.available.length} icon={Home} tone="warning" />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Rent collection</p>
                  <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Current PMS position</h2>
                </div>
                <Wallet className="h-5 w-5 text-brand-600" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Mini label="Invoiced" value={money(data.rentSummary?.total_invoiced_kes)} />
                <Mini label="Collected" value={money(data.rentSummary?.total_payments_kes)} />
                <Mini label="Paid invoices" value={derived.paid.length} />
                <Mini label="Pending" value={derived.pending.length} />
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Payment queue</p>
                  <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Needs attention</h2>
                </div>
                <Clock3 className="h-5 w-5 text-warning-600" />
              </div>
              <div className="mt-5 space-y-3">
                <QueueRow label="Payment confirmations" value={data.rentSummary?.pending_submission_count || 0} />
                <QueueRow label="Renter requests" value={Array.isArray(data.renterRequests) ? data.renterRequests.length : 0} />
                <QueueRow label="Unread notifications" value={Array.isArray(data.notifications) ? data.notifications.filter((n: RecordValue) => !n.read).length : 0} />
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Calendar</p>
                  <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Upcoming rent dates</h2>
                </div>
                <CalendarDays className="h-5 w-5 text-brand-600" />
              </div>
              <div className="mt-4 space-y-2">
                {derived.upcoming.map((invoice: RecordValue) => (
                  <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-brand-900/50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{invoice.invoice_number || 'Rent invoice'}</p>
                      <p className="truncate text-xs text-gray-500">{invoice.renter_name || invoice.unit_number || 'PMS invoice'}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-gray-900 dark:text-white">{date(invoice.due_date)}</p>
                      <p className="text-xs text-gray-500">{money(invoice.amount_kes)}</p>
                    </div>
                  </div>
                ))}
                {!derived.upcoming.length && <p className="py-4 text-sm text-gray-500">No upcoming unpaid invoices.</p>}
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Occupancy</p>
                  <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Portfolio utilization</h2>
                </div>
                <span className="text-2xl font-bold text-brand-700 dark:text-brand-300">{derived.occupancyRate}%</span>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-brand-900">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${derived.occupancyRate}%` }} />
              </div>
              <div className="mt-3 flex justify-between text-xs text-gray-500">
                <span>{derived.occupied.length} occupied</span>
                <span>{derived.available.length} available</span>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Subscription</p>
                  <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">PMS entitlement</h2>
                </div>
                <CheckCircle2 className="h-5 w-5 text-success-600" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Mini label="Plan" value={data.subscription?.plan_name || '—'} />
                <Mini label="Status" value={data.subscription?.status || '—'} />
                <Mini label="Listings used" value={data.capacity?.listings_used ?? 0} />
                <Mini label="Units / listing" value={data.capacity?.max_units_per_listing ?? '—'} />
              </div>
            </div>
          </div>
        </>
      )}

      <LandlordPMS />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/50">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function QueueRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-3 dark:border-brand-800">
      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
      <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">{value}</span>
    </div>
  );
}
