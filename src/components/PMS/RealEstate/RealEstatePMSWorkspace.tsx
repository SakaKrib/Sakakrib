import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldAlert,
  WalletCards,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import {
  loadRealEstateDashboardData,
  type RealEstateDashboardData,
} from '@/lib/RealEstateTs/Realestateservice';
import RealEstatePMS from './Realestatepms';

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(date);
}

function Stat({ icon: Icon, label, value, note }: { icon: typeof CalendarDays; label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{note}</p>
        </div>
        <div className="rounded-xl bg-brand-50 p-2.5 dark:bg-brand-800">
          <Icon className="h-5 w-5 text-brand-600 dark:text-brand-300" />
        </div>
      </div>
    </div>
  );
}

function PortfolioCalendar({ listings }: { listings: RealEstateDashboardData['listings'] }) {
  const [month, setMonth] = useState(() => new Date());

  const days = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1).getDay();
    const totalDays = new Date(year, monthIndex + 1, 0).getDate();
    const cells: Array<number | null> = Array(firstDay).fill(null);
    for (let day = 1; day <= totalDays; day += 1) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month]);

  const createdByDay = useMemo(() => {
    const result = new Set<number>();
    listings.forEach((listing) => {
      const date = new Date(listing.created_at);
      if (date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth()) {
        result.add(date.getDate());
      }
    });
    return result;
  }, [listings, month]);

  const monthLabel = new Intl.DateTimeFormat('en-KE', { month: 'long', year: 'numeric' }).format(month);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Portfolio calendar</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Listing activity from Django records.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))} className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700">Previous</button>
          <span className="min-w-36 text-center text-sm font-semibold text-gray-900 dark:text-white">{monthLabel}</span>
          <button type="button" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))} className="rounded-lg border px-3 py-2 text-sm dark:border-brand-700">Next</button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-400">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="py-2">{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => (
          <div key={`${day ?? 'empty'}-${index}`} className="min-h-14 rounded-lg border border-gray-100 p-2 dark:border-brand-800">
            {day && (
              <>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{day}</span>
                {createdByDay.has(day) && <span className="mt-2 block rounded-md bg-brand-100 px-1.5 py-1 text-[10px] font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-300">Listing activity</span>}
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function RealEstatePMSWorkspace() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [data, setData] = useState<RealEstateDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await loadRealEstateDashboardData(profile?.id ?? ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load real-estate PMS statistics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">Loading real-estate property management...</div>;
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
          <p className="font-semibold">Unable to load real-estate PMS</p>
          <p className="mt-1">{error ?? 'No dashboard data was returned by Django.'}</p>
          <button type="button" onClick={() => void load(true)} className="btn-primary mt-4 inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" />Retry</button>
        </div>
      </div>
    );
  }

  const listings = data.listings;
  const published = listings.filter((item) => item.is_published && item.is_approved).length;
  const pending = listings.filter((item) => !item.is_approved && !['rejected', 'declined'].includes((item.approval_status ?? '').toLowerCase())).length;
  const managed = listings.filter((item) => item.pms_managed).length;
  const unpaid = listings.filter((item) => !item.is_paid && !item.pms_managed).length;
  const capacity = data.subscription?.max_listings;
  const remaining = capacity === null || capacity === undefined ? null : Math.max(0, capacity - managed);

  return (
    <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
            <ShieldAlert className="h-3.5 w-3.5" /> Django-backed PMS
          </div>
          <h1 className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">Real Estate Property Management</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your subscription, listing capacity, publishing state, and portfolio activity come from Django.</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold dark:border-brand-700 dark:bg-brand-900"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh data</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat icon={BarChart3} label="Total listings" value={String(listings.length)} note="Django portfolio" />
        <Stat icon={CheckCircle2} label="Published" value={String(published)} note="Approved + published" />
        <Stat icon={Clock3} label="Pending" value={String(pending)} note="Awaiting approval" />
        <Stat icon={WalletCards} label="PMS managed" value={String(managed)} note={remaining === null ? 'Unlimited capacity' : `${remaining} remaining`} />
        <Stat icon={ShieldAlert} label="Payment required" value={String(unpaid)} note="Non-PMS listings" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <PortfolioCalendar listings={listings} />
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-900">
          <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-brand-600 dark:text-brand-300" /><h2 className="text-lg font-bold text-gray-900 dark:text-white">Portfolio performance</h2></div>
          <div className="mt-5 space-y-4">
            <div><div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Published rate</span><strong className="text-gray-900 dark:text-white">{listings.length ? Math.round((published / listings.length) * 100) : 0}%</strong></div><div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-brand-800"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${listings.length ? Math.round((published / listings.length) * 100) : 0}%` }} /></div></div>
            <div><div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">PMS utilization</span><strong className="text-gray-900 dark:text-white">{capacity ? Math.round((managed / capacity) * 100) : 100}%</strong></div><div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-brand-800"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${capacity ? Math.min(100, Math.round((managed / capacity) * 100)) : 100}%` }} /></div></div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/60"><p className="text-xs text-gray-500 dark:text-gray-400">Subscription</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{data.subscription?.plan_name ?? 'None'}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{data.subscription?.subscription_status ?? '—'}</p></div>
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/60"><p className="text-xs text-gray-500 dark:text-gray-400">Period ends</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{formatDate(data.subscription?.current_period_end)}</p></div>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-8">
        <RealEstatePMS
          onCreateListing={() => navigate('post-listing')}
          onOpenListing={(listingId) => navigate('listing-detail', listingId)}
        />
      </div>
    </div>
  );
}
