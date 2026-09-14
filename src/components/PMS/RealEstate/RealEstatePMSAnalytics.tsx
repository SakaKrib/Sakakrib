import { useEffect, useState } from 'react';
import { BarChart3, Building2, CircleDollarSign, Home, RefreshCw, Users, WalletCards } from 'lucide-react';
import { getRealEstatePMSAnalytics, type RealEstatePMSAnalyticsResponse } from '@/lib/RealEstateTs/RealEstatePMSAnalyticsService';

const money = (value: number) => `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function Metric({ icon: Icon, label, value, note }: { icon: typeof Home; label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-brand-800 dark:bg-brand-800/60">
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400"><Icon className="h-4 w-4" /><span className="text-xs font-semibold">{label}</span></div>
      <p className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{note}</p>
    </div>
  );
}

export default function RealEstatePMSAnalytics() {
  const [data, setData] = useState<RealEstatePMSAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getRealEstatePMSAnalytics());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load portfolio analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading) return <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-900"><p className="text-sm text-gray-500 dark:text-gray-400">Loading portfolio analytics...</p></section>;
  if (error || !data) return <section className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-900/20"><div className="flex items-center justify-between gap-4"><p className="text-sm text-red-700 dark:text-red-300">{error ?? 'No analytics data returned.'}</p><button type="button" onClick={() => void load()} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-800 dark:text-red-300"><RefreshCw className="mr-1 inline h-3.5 w-3.5" />Retry</button></div></section>;

  const { summary, trend } = data;
  const maxTrend = Math.max(1, ...trend.map((item) => Math.max(item.invoiced, item.collected)));

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-brand-600 dark:text-brand-300" /><h2 className="text-lg font-bold text-gray-900 dark:text-white">Portfolio analytics</h2></div><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Occupancy, lease health, rent performance and collection trends from the PMS data.</p></div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 self-start rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-brand-700"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Building2} label="Properties" value={String(summary.properties)} note={`${summary.units} total units`} />
        <Metric icon={Users} label="Occupancy" value={`${summary.occupancy_rate}%`} note={`${summary.occupied_units} occupied · ${summary.vacant_units} vacant`} />
        <Metric icon={Home} label="Active leases" value={String(summary.active_leases)} note={`${summary.leases_expiring_90_days} expiring within 90 days`} />
        <Metric icon={WalletCards} label="Scheduled rent" value={money(summary.scheduled_rent)} note="Current active lease schedule" />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Metric icon={CircleDollarSign} label="Invoiced" value={money(summary.invoiced)} note="Recorded rent invoices" />
        <Metric icon={CircleDollarSign} label="Collected" value={money(summary.collected)} note={`${summary.collection_rate}% collection rate`} />
        <Metric icon={WalletCards} label="Outstanding" value={money(summary.outstanding)} note="Invoiced less recorded collections" />
      </div>

      <div className="mt-6 rounded-xl border border-gray-100 p-4 dark:border-brand-800">
        <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-gray-900 dark:text-white">Six-month rent trend</h3><span className="text-xs text-gray-500 dark:text-gray-400">Invoiced vs collected</span></div>
        <div className="mt-4 space-y-3">
          {trend.map((item) => (
            <div key={item.month}>
              <div className="mb-1 flex items-center justify-between text-xs"><span className="font-semibold text-gray-600 dark:text-gray-300">{item.month}</span><span className="text-gray-500 dark:text-gray-400">{money(item.collected)} / {money(item.invoiced)}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-brand-800"><div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (item.invoiced / maxTrend) * 100)}%` }} /></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-brand-800"><div className="h-full rounded-full bg-success-500" style={{ width: `${Math.min(100, (item.collected / maxTrend) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
