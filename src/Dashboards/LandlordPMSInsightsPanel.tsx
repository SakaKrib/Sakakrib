import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, BarChart3, Building2, CheckCircle2, Clock3, RefreshCw, Users, Wallet } from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';

type Row = Record<string, any>;

const money = (value: unknown) => `KES ${Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
const upper = (value: unknown) => String(value || '').trim().toUpperCase();

export default function LandlordPMSInsightsPanel() {
  const [data, setData] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await protectedGet<Row>('/api/core/pms/dashboard/'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Django PMS insights.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const stats = useMemo(() => {
    const units: Row[] = Array.isArray(data?.units) ? data.units : [];
    const listings: Row[] = Array.isArray(data?.listings) ? data.listings : [];
    const invoices: Row[] = Array.isArray(data?.rentInvoices) ? data.rentInvoices : [];
    const payments: Row[] = Array.isArray(data?.rentPayments) ? data.rentPayments : [];
    const occupied = units.filter((unit) => Boolean(unit.renter_assoc_id));
    const available = units.filter((unit) => !unit.renter_assoc_id && upper(unit.availability) === 'AVAILABLE');
    const paid = invoices.filter((invoice) => upper(invoice.status) === 'PAID');
    const submitted = invoices.filter((invoice) => upper(invoice.status) === 'PAYMENT_SUBMITTED');
    const now = new Date();
    const overdue = invoices.filter((invoice) => upper(invoice.status) !== 'PAID' && invoice.due_date && new Date(String(invoice.due_date)).getTime() < now.getTime());
    const invoiced = Number(data?.rentSummary?.total_invoiced_kes || 0);
    const collected = Number(data?.rentSummary?.total_payments_kes || 0);
    return {
      properties: listings.length,
      units: units.length,
      occupied: occupied.length,
      available: available.length,
      occupancy: units.length ? Math.round((occupied.length / units.length) * 100) : 0,
      paid: paid.length,
      submitted: submitted.length,
      overdue: overdue.length,
      invoiced,
      collected,
      outstanding: Math.max(0, invoiced - collected),
      collectionRate: invoiced ? Math.min(100, Math.round((collected / invoiced) * 100)) : 0,
      recentPayments: payments.filter((payment) => upper(payment.status) === 'PAID').slice(0, 6),
    };
  }, [data]);

  if (loading) return <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-gray-200 bg-white dark:border-brand-800 dark:bg-brand-950"><RefreshCw className="h-7 w-7 animate-spin text-brand-600" /></div>;

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 p-6 text-white shadow-lg dark:border-brand-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-200">Django insights</p>
            <h2 className="mt-2 text-2xl font-bold">Portfolio intelligence</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-brand-100/80">Derived exclusively from the landlord PMS data returned by Django. No frontend-owned financial or entitlement state is authoritative.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </div>
        {error && <div className="mt-4 flex items-center gap-2 rounded-xl bg-error-500/15 px-4 py-3 text-sm text-red-100"><AlertTriangle className="h-4 w-4" />{error}</div>}
      </div>

      {error ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Insight label="Properties" value={stats.properties} icon={Building2} />
            <Insight label="Occupancy" value={`${stats.occupancy}%`} detail={`${stats.occupied} occupied · ${stats.available} available`} icon={Users} />
            <Insight label="Collection rate" value={`${stats.collectionRate}%`} detail={`${money(stats.collected)} collected`} icon={CheckCircle2} />
            <Insight label="Outstanding" value={money(stats.outstanding)} detail={`${stats.overdue} overdue`} icon={Wallet} />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel title="Invoice health" icon={BarChart3}>
              <RowStat label="Total invoices" value={invoicesCount(data)} />
              <RowStat label="Paid" value={stats.paid} />
              <RowStat label="Payment submitted" value={stats.submitted} />
              <RowStat label="Overdue" value={stats.overdue} danger={stats.overdue > 0} />
            </Panel>
            <Panel title="Portfolio utilization" icon={Building2}>
              <div className="flex items-end justify-between"><span className="text-sm text-gray-500">Occupied units</span><span className="text-2xl font-bold text-gray-900 dark:text-white">{stats.occupied}/{stats.units}</span></div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-brand-900"><div className="h-full rounded-full bg-brand-600" style={{ width: `${stats.occupancy}%` }} /></div>
              <p className="mt-3 text-xs text-gray-500">Django-reported unit assignments determine occupancy.</p>
            </Panel>
            <Panel title="Collection position" icon={Wallet}>
              <RowStat label="Invoiced" value={money(stats.invoiced)} />
              <RowStat label="Collected" value={money(stats.collected)} />
              <RowStat label="Outstanding" value={money(stats.outstanding)} />
              <RowStat label="Payment reviews" value={stats.submitted} />
            </Panel>
          </div>

          <Panel title="Recent confirmed payments" icon={CheckCircle2}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stats.recentPayments.map((payment) => (
                <div key={payment.id} className="rounded-xl border border-gray-100 p-4 dark:border-brand-800">
                  <div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{payment.transaction_id || payment.provider_reference || payment.mpesa_receipt || 'Payment'}</p><CheckCircle2 className="h-4 w-4 shrink-0 text-success-600" /></div>
                  <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">{money(payment.amount_kes)}</p>
                  <p className="mt-1 text-xs text-gray-500">{payment.paid_at || payment.created_at || 'Confirmed by Django'}</p>
                </div>
              ))}
            </div>
            {!stats.recentPayments.length && <div className="py-6 text-center text-sm text-gray-500">No confirmed payments returned by Django.</div>}
          </Panel>

          <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-800 dark:border-brand-800 dark:bg-brand-900/20 dark:text-brand-200"><Clock3 className="mr-2 inline h-4 w-4" />Insights are presentation-only. Mutations, payment confirmation, subscription entitlement and renter/unit ownership remain enforced by Django.</div>
        </>
      )}
    </section>
  );
}

function invoicesCount(data: Row | null) {
  return Array.isArray(data?.rentInvoices) ? data.rentInvoices.length : 0;
}

function Insight({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail?: string; icon: typeof Wallet }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>{detail && <p className="mt-1 text-xs text-gray-500">{detail}</p>}</div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"><Icon className="h-5 w-5" /></span></div></div>;
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Wallet; children: ReactNode }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950"><div className="mb-4 flex items-center gap-2"><Icon className="h-5 w-5 text-brand-600" /><h3 className="font-bold text-gray-900 dark:text-white">{title}</h3></div>{children}</div>;
}

function RowStat({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) {
  return <div className="flex items-center justify-between border-b border-gray-100 py-3 last:border-0 dark:border-brand-800"><span className="text-sm text-gray-500">{label}</span><span className={`text-sm font-bold ${danger ? 'text-error-600' : 'text-gray-900 dark:text-white'}`}>{value}</span></div>;
}
