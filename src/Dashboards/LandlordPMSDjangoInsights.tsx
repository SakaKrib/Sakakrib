import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  Home,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';
import LandlordPMS from './LandlordPMS';

type RecordValue = Record<string, any>;

const money = (value: unknown) =>
  `KES ${Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const date = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(String(value)))
    : '—';

const shortDate = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short' }).format(new Date(String(value)))
    : '—';

const sameMonth = (value: unknown, now: Date) => {
  if (!value) return false;
  const d = new Date(String(value));
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

const status = (value: unknown) => String(value || '').trim().toUpperCase();

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: typeof Home;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = tone === 'success'
    ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300'
    : tone === 'warning'
      ? 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300'
      : tone === 'danger'
        ? 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300'
        : 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-brand-800 dark:bg-brand-950">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-2 truncate text-xl font-bold text-gray-900 dark:text-white">{value}</p>
          {detail && <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{detail}</p>}
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/50">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function ActionRow({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'warning' | 'danger' }) {
  const badge = tone === 'danger'
    ? 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300'
    : tone === 'warning'
      ? 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300'
      : 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300';
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-3 dark:border-brand-800">
      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge}`}>{value}</span>
    </div>
  );
}

export default function LandlordPMSDjangoInsights() {
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
      setError(err instanceof Error ? err.message : 'Unable to load landlord PMS data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const stats = useMemo(() => {
    const units = Array.isArray(data?.units) ? data.units : [];
    const listings = Array.isArray(data?.listings) ? data.listings : [];
    const invoices = Array.isArray(data?.rentInvoices) ? data.rentInvoices : [];
    const payments = Array.isArray(data?.rentPayments) ? data.rentPayments : [];
    const notifications = Array.isArray(data?.notifications) ? data.notifications : [];
    const methods = Array.isArray(data?.paymentMethods) ? data.paymentMethods : [];
    const now = new Date();

    const occupied = units.filter((u: RecordValue) => Boolean(u.renter_assoc_id));
    const available = units.filter((u: RecordValue) => !u.renter_assoc_id && status(u.availability) === 'AVAILABLE');
    const paid = invoices.filter((i: RecordValue) => status(i.status) === 'PAID');
    const submitted = invoices.filter((i: RecordValue) => status(i.status) === 'PAYMENT_SUBMITTED');
    const pending = invoices.filter((i: RecordValue) => ['DUE', 'PAYMENT_SUBMITTED', 'PENDING'].includes(status(i.status)));
    const overdue = invoices.filter((i: RecordValue) => {
      const invoiceStatus = status(i.status);
      return invoiceStatus !== 'PAID' && i.due_date && new Date(String(i.due_date)).getTime() < now.getTime();
    });
    const dueThisMonth = invoices.filter((i: RecordValue) => sameMonth(i.due_date, now) && status(i.status) !== 'PAID');
    const paidThisMonth = payments.filter((p: RecordValue) => sameMonth(p.paid_at || p.created_at, now) && status(p.status) === 'PAID');

    const upcoming = invoices
      .filter((i: RecordValue) => i.due_date && status(i.status) !== 'PAID')
      .sort((a: RecordValue, b: RecordValue) => new Date(String(a.due_date)).getTime() - new Date(String(b.due_date)).getTime())
      .slice(0, 6);

    const recentPayments = [...payments]
      .sort((a: RecordValue, b: RecordValue) => new Date(String(b.paid_at || b.created_at || 0)).getTime() - new Date(String(a.paid_at || a.created_at || 0)).getTime())
      .slice(0, 5);

    const occupancy = units.length ? Math.round((occupied.length / units.length) * 100) : 0;
    const invoiced = Number(data?.rentSummary?.total_invoiced_kes || 0);
    const collected = Number(data?.rentSummary?.total_payments_kes || 0);
    const outstanding = Math.max(0, invoiced - collected);
    const collectionRate = invoiced > 0 ? Math.min(100, Math.round((collected / invoiced) * 100)) : 0;

    const byListing = listings.map((listing: RecordValue) => {
      const listingUnits = units.filter((u: RecordValue) => String(u.listing_id || u.property_id || '') === String(listing.id));
      const listingOccupied = listingUnits.filter((u: RecordValue) => Boolean(u.renter_assoc_id));
      return {
        ...listing,
        unitCount: listingUnits.length,
        occupiedCount: listingOccupied.length,
      };
    });

    return {
      units,
      listings,
      invoices,
      payments,
      notifications,
      methods,
      occupied,
      available,
      paid,
      submitted,
      pending,
      overdue,
      dueThisMonth,
      paidThisMonth,
      upcoming,
      recentPayments,
      occupancy,
      invoiced,
      collected,
      outstanding,
      collectionRate,
      byListing,
    };
  }, [data]);

  return (
    <div className="mt-6 space-y-6">
      <header className="overflow-hidden rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 p-6 text-white shadow-lg dark:border-brand-800">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-200">Landlord PMS</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Property management command center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-brand-100/80">
              Live PMS presentation built from Django's authoritative response. Property, unit, renter, invoice, payment and subscription state is owned by the backend.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/15 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh data
          </button>
        </div>
        {data?.subscription && (
          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-brand-100">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-semibold">{data.subscription.plan_name || 'PMS plan'}</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-semibold">{data.subscription.status || '—'}</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-semibold">Ends {date(data.subscription.current_period_end)}</span>
          </div>
        )}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-error-500/15 px-4 py-3 text-sm text-red-100">
            <AlertTriangle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
      </header>

      {!loading && data && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <StatCard label="Properties" value={stats.listings.length} icon={Home} />
            <StatCard label="Total units" value={stats.units.length} icon={Building2} />
            <StatCard label="Occupied" value={stats.occupied.length} detail={`${stats.occupancy}% occupancy`} icon={Users} tone="success" />
            <StatCard label="Available" value={stats.available.length} icon={Home} tone="warning" />
            <StatCard label="Pending invoices" value={stats.pending.length} icon={FileText} tone={stats.pending.length ? 'warning' : 'default'} />
            <StatCard label="Collected" value={money(stats.collected)} detail={`${stats.collectionRate}% collection`} icon={Wallet} tone="success" />
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Calendar statistics</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Rent schedule</h2></div>
                <CalendarDays className="h-5 w-5 text-brand-600" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <MiniStat label="Due this month" value={stats.dueThisMonth.length} />
                <MiniStat label="Overdue" value={stats.overdue.length} />
                <MiniStat label="Paid this month" value={stats.paidThisMonth.length} />
                <MiniStat label="Payment submitted" value={stats.submitted.length} />
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Financial statistics</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Rent collection</h2></div>
                <TrendingUp className="h-5 w-5 text-brand-600" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <MiniStat label="Invoiced" value={money(stats.invoiced)} />
                <MiniStat label="Collected" value={money(stats.collected)} />
                <MiniStat label="Outstanding" value={money(stats.outstanding)} />
                <MiniStat label="Collection rate" value={`${stats.collectionRate}%`} />
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Action centre</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Needs attention</h2></div>
                <Clock3 className="h-5 w-5 text-warning-600" />
              </div>
              <div className="mt-5 space-y-3">
                <ActionRow label="Payment confirmations" value={Number(data.rentSummary?.pending_submission_count || stats.submitted.length)} tone="warning" />
                <ActionRow label="Overdue invoices" value={stats.overdue.length} tone={stats.overdue.length ? 'danger' : 'default'} />
                <ActionRow label="Unread notifications" value={stats.notifications.filter((n: RecordValue) => !n.read).length} />
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950 lg:col-span-2">
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Calendar</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Upcoming rent dates</h2></div>
                <CalendarDays className="h-5 w-5 text-brand-600" />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {stats.upcoming.map((invoice: RecordValue) => (
                  <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-3 dark:border-brand-800 dark:bg-brand-900/30">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{invoice.invoice_number || 'Rent invoice'}</p>
                      <p className="truncate text-xs text-gray-500">Unit {invoice.unit_number || invoice.unit_id || '—'}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-gray-900 dark:text-white">{shortDate(invoice.due_date)}</p>
                      <p className="text-xs text-gray-500">{money(invoice.amount_kes)}</p>
                    </div>
                  </div>
                ))}
              </div>
              {!stats.upcoming.length && <p className="py-6 text-center text-sm text-gray-500">No upcoming unpaid invoices.</p>}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Occupancy</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Portfolio utilization</h2></div><span className="text-2xl font-bold text-brand-700 dark:text-brand-300">{stats.occupancy}%</span></div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-brand-900"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${stats.occupancy}%` }} /></div>
              <div className="mt-3 grid grid-cols-2 gap-3"><MiniStat label="Occupied" value={stats.occupied.length} /><MiniStat label="Available" value={stats.available.length} /></div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950 lg:col-span-2">
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Properties</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Property and unit occupancy</h2></div>
                <Building2 className="h-5 w-5 text-brand-600" />
              </div>
              <div className="mt-4 space-y-3">
                {stats.byListing.slice(0, 6).map((listing: RecordValue) => {
                  const percent = listing.unitCount ? Math.round((listing.occupiedCount / listing.unitCount) * 100) : 0;
                  return (
                    <div key={listing.id} className="rounded-xl border border-gray-100 p-3 dark:border-brand-800">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{listing.title || listing.name || 'Property'}</p>
                        <span className="text-xs font-bold text-gray-500">{listing.occupiedCount}/{listing.unitCount} occupied</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-brand-900"><div className="h-full rounded-full bg-brand-600" style={{ width: `${percent}%` }} /></div>
                    </div>
                  );
                })}
                {!stats.byListing.length && <p className="py-6 text-center text-sm text-gray-500">No property data returned by Django yet.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Payments</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Recent collections</h2></div><CheckCircle2 className="h-5 w-5 text-success-600" /></div>
              <div className="mt-4 space-y-3">
                {stats.recentPayments.map((payment: RecordValue) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0 dark:border-brand-800">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{payment.transaction_id || payment.reference || 'Payment'}</p><p className="text-xs text-gray-500">{shortDate(payment.paid_at || payment.created_at)}</p></div>
                    <p className="shrink-0 text-sm font-bold text-gray-900 dark:text-white">{money(payment.amount_kes)}</p>
                  </div>
                ))}
                {!stats.recentPayments.length && <p className="py-6 text-center text-sm text-gray-500">No confirmed payments yet.</p>}
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-brand-600" /><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Subscription</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Plan & entitlement</h2></div></div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <MiniStat label="Plan" value={data.subscription?.plan_name || '—'} />
                <MiniStat label="Status" value={data.subscription?.status || '—'} />
                <MiniStat label="Listings" value={`${data.capacity?.listings_used ?? 0} / ${data.capacity?.max_listings ?? '—'}`} />
                <MiniStat label="Units / listing" value={data.capacity?.max_units_per_listing ?? '—'} />
              </div>
              <p className="mt-4 text-xs text-gray-500">Period ends {date(data.subscription?.current_period_end)}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-brand-600" /><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Payment settings</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Receiving accounts</h2></div></div>
              <div className="mt-4 space-y-2">
                {stats.methods.slice(0, 4).map((method: RecordValue) => (
                  <div key={method.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-3 dark:bg-brand-900/50"><span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{method.method || method.payment_method || 'Payment method'}</span><span className="text-xs text-gray-500">{method.is_default ? 'Default' : method.account_name || method.account_number || 'Active'}</span></div>
                ))}
                {!stats.methods.length && <p className="py-4 text-sm text-gray-500">No active landlord payment account configured.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
              <div className="flex items-center gap-2"><ArrowUpRight className="h-5 w-5 text-brand-600" /><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Next steps</p><h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Quick actions</h2></div></div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-3 dark:bg-brand-900/50"><span>Add renter</span><Users className="h-4 w-4 text-brand-600" /></div>
                <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-3 dark:bg-brand-900/50"><span>Create rent invoice</span><FileText className="h-4 w-4 text-brand-600" /></div>
                <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-3 dark:bg-brand-900/50"><span>Review calendar</span><CalendarDays className="h-4 w-4 text-brand-600" /></div>
              </div>
            </div>
          </section>

          <LandlordPMS />
        </>
      )}
    </div>
  );
}
