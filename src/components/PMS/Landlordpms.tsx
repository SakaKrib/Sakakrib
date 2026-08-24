import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock3,
  Home,
  Loader2,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';

import {
  addListingToPMS,
  computePMSCapacity,
  getMyAvailablePMSListings,
  getMyPMSListings,
  getMyPMSSubscription,
  getMyPMSUnitCount,
  removeListingFromPMS,
  type PMSAvailableListing,
  type PMSCapacity,
  type PMSListing,
  type PMSSubscription,
} from '@/lib/pmsService';

import {
  getMyPMSUnits,
  getMyRentSummary,
  getUnitPaymentHistory,
  markUnitRentPaidThrough,
  type MarkRentPaidResult,
  type PMSUnit,
  type RentPaymentRecord,
  type RentSummary,
} from '@/lib/Landlordpmsrent';

import LandlordPMSSettings from './Landlordpmssettings';


// ============================================================
// SHARED HELPERS
// ============================================================

function formatKES(value: number) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function formatMonthYear(year: number, month: number) {
  return new Intl.DateTimeFormat('en-KE', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}

const MONTH_INPUT_TODAY = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
})();


// ============================================================
// TOP-LEVEL DATA
// ============================================================

interface LandlordPMSData {
  subscription: PMSSubscription | null;
  capacity: PMSCapacity;
  rentSummary: RentSummary | null;
  pmsListings: PMSListing[];
  availableListings: PMSAvailableListing[];
  units: PMSUnit[];
}

async function loadLandlordPMSData(): Promise<LandlordPMSData> {
  const subscription = await getMyPMSSubscription();

  const [listingsUsed, rentSummary, pmsListings, availableListings, units] =
    await Promise.all([
      getMyPMSUnitCount(subscription?.subscription_id),
      getMyRentSummary(),
      getMyPMSListings(),
      getMyAvailablePMSListings(),
      getMyPMSUnits(),
    ]);

  return {
    subscription,
    capacity: computePMSCapacity(
      listingsUsed,
      subscription?.max_listings ?? null
    ),
    rentSummary,
    pmsListings,
    availableListings,
    units,
  };
}


// ============================================================
// PAGE TYPE
// ============================================================

type PMSPage =
  | 'overview'
  | 'properties'
  | 'units'
  | 'unit-details'
  | 'renters'
  | 'settings';


// ============================================================
// ROOT COMPONENT
// ============================================================

export default function LandlordPMS() {
  const [page, setPage] = useState<PMSPage>('overview');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const [data, setData] = useState<LandlordPMSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await loadLandlordPMSData();
      setData(result);
    } catch (err) {
      console.error('Failed to load Landlord PMS:', err);
      setError(
        err instanceof Error ? err.message : 'Unable to load PMS data.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const goTo = (next: PMSPage) => setPage(next);

  const openUnit = (unitId: string) => {
    setSelectedUnitId(unitId);
    setPage('unit-details');
  };

  const selectedUnit = useMemo(
    () => data?.units.find((u) => u.unit_id === selectedUnitId) ?? null,
    [data?.units, selectedUnitId]
  );

  if (loading && !data) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading property management...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="card p-8">
          <XCircle className="mx-auto h-10 w-10 text-error-600" />
          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Unable to load PMS
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {error}
          </p>
          <button type="button" onClick={load} className="btn-primary mt-6">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

      {/* ========================================================
          HEADER + NAV
      ========================================================= */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Property Management
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your properties, units, renters and rent.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start">
          <button
            type="button"
            onClick={() => goTo('settings')}
            className="btn-secondary inline-flex items-center gap-2"
            title="PMS Settings"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>

          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="btn-secondary inline-flex items-center gap-2"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {page !== 'overview' && (
        <button
          type="button"
          onClick={() =>
            page === 'unit-details' ? goTo('units') : goTo('overview')
          }
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          <ArrowLeft className="h-4 w-4" />
          {page === 'unit-details'
            ? 'Back to Units'
            : page === 'settings'
              ? 'Back to PMS'
              : 'Back to Overview'}
        </button>
      )}

      {page === 'overview' && (
        <nav className="mt-6 flex flex-wrap gap-2">
          {(
            [
              ['properties', 'Properties', Building2],
              ['units', 'Units', Home],
              ['renters', 'Renters', Users],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => goTo(key)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-brand-700 dark:bg-brand-900 dark:text-gray-300"
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      )}

      <div className="mt-8">
        {page === 'overview' && (
          <OverviewView data={data} onNavigate={goTo} />
        )}

        {page === 'properties' && (
          <PropertiesView data={data} onChanged={load} />
        )}

        {page === 'units' && (
          <UnitsView units={data.units} onOpenUnit={openUnit} />
        )}

        {page === 'unit-details' && selectedUnit && (
          <UnitDetailsView unit={selectedUnit} onChanged={load} />
        )}

        {page === 'unit-details' && !selectedUnit && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Unit not found.
          </p>
        )}

        {page === 'renters' && (
          <RentersView units={data.units} onOpenUnit={openUnit} />
        )}

        {page === 'settings' && <LandlordPMSSettings />}
      </div>
    </div>
  );
}


// ============================================================
// OVERVIEW
// ============================================================

function OverviewView({
  data,
  onNavigate,
}: {
  data: LandlordPMSData;
  onNavigate: (page: PMSPage) => void;
}) {
  const { subscription, capacity, rentSummary } = data;

  return (
    <div className="space-y-6">

      {/* SUBSCRIPTION */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              PMS Subscription
            </p>
            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
              {subscription ? subscription.plan_name : 'No subscription'}
            </p>
          </div>

          {subscription && (
            <span className="rounded-full bg-success-100 px-3 py-1 text-xs font-semibold text-success-700 dark:bg-success-900/30 dark:text-success-400">
              {subscription.status === 'GRACE_PERIOD'
                ? 'Grace period'
                : 'Active'}
            </span>
          )}
        </div>

        {subscription && (
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 dark:border-brand-800 sm:grid-cols-4">
            <div>
              <p className="text-xs text-gray-400">Properties used</p>
              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {capacity.listings_used}
                {capacity.max_listings !== null && ` / ${capacity.max_listings}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Billing</p>
              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {subscription.billing_cycle === 'MONTHLY' ? 'Monthly' : 'Annual'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Renews</p>
              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {formatDate(subscription.current_period_end)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Auto renew</p>
              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {subscription.auto_renew ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* RENT STATS */}
      {rentSummary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Home}
            label="Total units"
            value={String(rentSummary.total_units)}
          />
          <StatCard
            icon={CheckCircle2}
            label="Occupied"
            value={String(rentSummary.occupied_units)}
            tone="success"
          />
          <StatCard
            icon={Home}
            label="Vacant"
            value={String(rentSummary.vacant_units)}
            tone="warning"
          />
          <StatCard
            icon={Users}
            label="Active renters"
            value={String(rentSummary.total_renters)}
          />
          <StatCard
            icon={Wallet}
            label="Rent due (this month)"
            value={formatKES(rentSummary.monthly_rent_due)}
          />
          <StatCard
            icon={CheckCircle2}
            label="Rent paid (this month)"
            value={formatKES(rentSummary.monthly_rent_paid)}
            tone="success"
          />
          <StatCard
            icon={Clock3}
            label="Outstanding"
            value={formatKES(rentSummary.monthly_rent_outstanding)}
            tone={rentSummary.monthly_rent_outstanding > 0 ? 'warning' : undefined}
          />
        </div>
      )}

      {/* QUICK LINKS */}
      <div className="grid gap-4 sm:grid-cols-3">
        <QuickLinkCard
          icon={Building2}
          title="Properties"
          description={`${data.pmsListings.length} managed`}
          onClick={() => onNavigate('properties')}
        />
        <QuickLinkCard
          icon={Home}
          title="Units"
          description={`${data.units.length} total`}
          onClick={() => onNavigate('units')}
        />
        <QuickLinkCard
          icon={Users}
          title="Renters"
          description={`${data.units.filter((u) => u.assoc_status === 'ACTIVE').length} active`}
          onClick={() => onNavigate('renters')}
        />
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Home;
  label: string;
  value: string;
  tone?: 'success' | 'warning';
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-brand-700 dark:bg-brand-900">
      <div className="flex items-center gap-2 text-gray-400">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p
        className={`mt-2 text-xl font-bold ${
          tone === 'success'
            ? 'text-success-600'
            : tone === 'warning'
              ? 'text-warning-600'
              : 'text-gray-900 dark:text-white'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function QuickLinkCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof Home;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-gray-200 bg-white p-5 text-left transition hover:border-brand-400 dark:border-brand-700 dark:bg-brand-900"
    >
      <Icon className="h-6 w-6 text-brand-600" />
      <p className="mt-3 font-semibold text-gray-900 dark:text-white">
        {title}
      </p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {description}
      </p>
    </button>
  );
}


// ============================================================
// PROPERTIES
// ============================================================

function PropertiesView({
  data,
  onChanged,
}: {
  data: LandlordPMSData;
  onChanged: () => Promise<void>;
}) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (listingId: string) => {
    if (!data.subscription) return;

    setError(null);
    setProcessingId(listingId);

    try {
      await addListingToPMS(data.subscription.subscription_id, listingId);
      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to add property to PMS.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemove = async (listingId: string) => {
    if (!data.subscription) return;

    const confirmed = window.confirm(
      'Remove this property from PMS management?'
    );
    if (!confirmed) return;

    setError(null);
    setProcessingId(listingId);

    try {
      await removeListingFromPMS(
        data.subscription.subscription_id,
        listingId
      );
      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to remove property from PMS.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-900 dark:bg-error-900/20 dark:text-error-400">
          {error}
        </div>
      )}

      {!data.subscription && (
        <div className="rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-900 dark:bg-warning-900/20 dark:text-warning-400">
          An active PMS subscription is required to manage properties.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white dark:border-brand-700 dark:bg-brand-900">
        <div className="border-b border-gray-200 p-5 dark:border-brand-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            Managed properties
          </h2>
        </div>

        {data.pmsListings.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No properties are currently managed by PMS.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-brand-800">
            {data.pmsListings.map((listing) => (
              <div
                key={listing.subscription_listing_id}
                className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {listing.listing_title}
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {listing.listing_city} &middot; {formatKES(listing.listing_price_kes)}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={processingId === listing.listing_id}
                  onClick={() => handleRemove(listing.listing_id)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:border-brand-700 dark:hover:bg-error-900/20"
                >
                  {processingId === listing.listing_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white dark:border-brand-700 dark:bg-brand-900">
        <div className="border-b border-gray-200 p-5 dark:border-brand-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            Available to add
          </h2>
        </div>

        {data.availableListings.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No eligible listings — all your listings are already
            managed by PMS.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-brand-800">
            {data.availableListings.map((listing) => (
              <div
                key={listing.listing_id}
                className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {listing.title}
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {listing.city} &middot; {formatKES(listing.price_kes)}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!data.subscription || processingId === listing.listing_id}
                  onClick={() => handleAdd(listing.listing_id)}
                  className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {processingId === listing.listing_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add to PMS
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================================
// UNITS
// ============================================================

function unitStatusBadge(unit: PMSUnit) {
  if (unit.assoc_status === 'ACTIVE') {
    return {
      label: 'Occupied',
      className:
        'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    };
  }
  return {
    label: unit.availability || 'Vacant',
    className:
      'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300',
  };
}

function UnitsView({
  units,
  onOpenUnit,
}: {
  units: PMSUnit[];
  onOpenUnit: (unitId: string) => void;
}) {
  if (units.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-brand-700 dark:bg-brand-900">
        <Home className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="mt-3 font-medium text-gray-700 dark:text-gray-300">
          No units yet
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Units are added under a PMS-managed property.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-brand-700 dark:bg-brand-900">
      <div className="divide-y divide-gray-100 dark:divide-brand-800">
        {units.map((unit) => {
          const badge = unitStatusBadge(unit);

          return (
            <button
              key={unit.unit_id}
              type="button"
              onClick={() => onOpenUnit(unit.unit_id)}
              className="flex w-full flex-col gap-2 p-5 text-left transition hover:bg-gray-50 dark:hover:bg-brand-800/50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {unit.listing_title} &middot; Unit {unit.unit_number}
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {unit.unit_type} &middot; {formatKES(unit.rent)}/mo
                  {unit.renter_name ? ` \u00b7 ${unit.renter_name}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {unit.rent_paid_in_advance && (
                  <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-800 dark:text-brand-300">
                    Paid in advance
                  </span>
                )}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                >
                  {badge.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}


// ============================================================
// UNIT DETAILS
// ============================================================

function UnitDetailsView({
  unit,
  onChanged,
}: {
  unit: PMSUnit;
  onChanged: () => Promise<void>;
}) {
  const [history, setHistory] = useState<RentPaymentRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [paidThroughInput, setPaidThroughInput] = useState(
    unit.rent_paid_through_month
      ? unit.rent_paid_through_month.slice(0, 7)
      : MONTH_INPUT_TODAY
  );

  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateResult, setUpdateResult] =
    useState<MarkRentPaidResult | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const rows = await getUnitPaymentHistory(unit.unit_id);
      setHistory(rows);
    } catch (err) {
      setHistoryError(
        err instanceof Error ? err.message : 'Unable to load payment history.'
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [unit.unit_id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleMarkPaid = async () => {
    setUpdating(true);
    setUpdateError(null);
    setUpdateResult(null);

    try {
      const [year, month] = paidThroughInput.split('-').map(Number);
      const result = await markUnitRentPaidThrough(
        unit.unit_id,
        new Date(year, month - 1, 1)
      );

      setUpdateResult(result);

      // Refresh everything downstream of this change — the parent
      // unit list, rent summary, and this unit's own payment history.
      await Promise.all([onChanged(), loadHistory()]);
    } catch (err) {
      setUpdateError(
        err instanceof Error ? err.message : 'Unable to update rent status.'
      );
    } finally {
      setUpdating(false);
    }
  };

  const hasActiveRenter = unit.assoc_status === 'ACTIVE';

  return (
    <div className="space-y-6">

      {/* UNIT INFO */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {unit.listing_title}
            </p>
            <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
              Unit {unit.unit_number}
            </h2>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              hasActiveRenter
                ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                : 'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300'
            }`}
          >
            {hasActiveRenter ? 'Occupied' : unit.availability || 'Vacant'}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 dark:border-brand-800 sm:grid-cols-4">
          <div>
            <p className="text-xs text-gray-400">Rent</p>
            <p className="mt-1 font-semibold text-gray-900 dark:text-white">
              {formatKES(unit.rent)}/mo
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Type</p>
            <p className="mt-1 font-semibold text-gray-900 dark:text-white">
              {unit.unit_type}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Beds</p>
            <p className="mt-1 font-semibold text-gray-900 dark:text-white">
              {unit.beds ?? '-'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Baths</p>
            <p className="mt-1 font-semibold text-gray-900 dark:text-white">
              {unit.baths ?? '-'}
            </p>
          </div>
        </div>
      </div>

      {/* RENTER */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Renter
        </h3>

        {hasActiveRenter ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="font-medium text-gray-900 dark:text-white">
                {unit.renter_name}
              </span>
            </div>
            {unit.renter_phone && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Phone className="h-4 w-4 text-gray-400" />
                {unit.renter_phone}
              </div>
            )}
            {unit.renter_email && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Mail className="h-4 w-4 text-gray-400" />
                {unit.renter_email}
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Calendar className="h-4 w-4 text-gray-400" />
              {formatDate(unit.lease_start)} &ndash; {formatDate(unit.lease_end)}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            No active renter associated with this unit.
          </p>
        )}
      </div>

      {/* RENT PAID IN ADVANCE */}
      {hasActiveRenter && unit.payment_tracking_enabled && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Rent Payment Tracking
          </h3>

          <div className="mt-3 flex items-center gap-2 text-sm">
            {unit.rent_paid_in_advance ? (
              <CheckCircle2 className="h-4 w-4 text-success-600" />
            ) : (
              <Clock3 className="h-4 w-4 text-gray-400" />
            )}
            <span className="text-gray-700 dark:text-gray-300">
              {unit.rent_paid_in_advance
                ? `Paid through ${formatDate(unit.rent_paid_through_month)}`
                : 'Not paid in advance'}
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Paid through
              </label>
              <input
                type="month"
                value={paidThroughInput}
                min={MONTH_INPUT_TODAY}
                onChange={(e) => setPaidThroughInput(e.target.value)}
                className="input-field"
              />
            </div>

            <button
              type="button"
              onClick={handleMarkPaid}
              disabled={updating}
              className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {updating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Update Rent Status
            </button>
          </div>

          {updateError && (
            <div className="mt-3 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-900 dark:bg-error-900/20 dark:text-error-400">
              {updateError}
            </div>
          )}

          {updateResult && (
            <div className="mt-3 rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700 dark:border-success-900 dark:bg-success-900/20 dark:text-success-400">
              Marked paid through {formatDate(updateResult.paid_through_month)}
              {' — '}
              {updateResult.months_marked_paid} month
              {updateResult.months_marked_paid === 1 ? '' : 's'} recorded
              {updateResult.months_already_paid > 0 &&
                ` (${updateResult.months_already_paid} already paid)`}
              .
            </div>
          )}
        </div>
      )}

      {hasActiveRenter && !unit.payment_tracking_enabled && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-brand-700 dark:bg-brand-800/30 dark:text-gray-400">
          Payment tracking is not enabled for this unit.
        </div>
      )}

      {/* PAYMENT HISTORY */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-brand-700 dark:bg-brand-900">
        <div className="border-b border-gray-200 p-5 dark:border-brand-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Payment history
          </h3>
        </div>

        {historyLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : historyError ? (
          <p className="p-5 text-sm text-error-600">{historyError}</p>
        ) : history.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No payment records yet.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-brand-800">
            {history.map((record) => (
              <div
                key={record.id}
                className="flex items-center justify-between p-4"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatMonthYear(record.period_year, record.period_month)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {record.payment_method || record.payment_provider || 'Manual'}
                    {record.paid_at && ` \u00b7 ${formatDate(record.paid_at)}`}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatKES(record.amount_kes)}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      record.status === 'PAID'
                        ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                        : 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400'
                    }`}
                  >
                    {record.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================================
// RENTERS
//
// Reuses get_my_pms_units data (already includes renter info per
// unit) rather than a separate RPC — get_my_renter_associations is
// renter-scoped only (renter_user_id = auth.uid()) and cannot be
// used for the landlord's view; there is no dedicated "landlord's
// renters" RPC. Flagged as a gap in the audit report; this view
// works within what the database actually provides today.
// ============================================================

function RentersView({
  units,
  onOpenUnit,
}: {
  units: PMSUnit[];
  onOpenUnit: (unitId: string) => void;
}) {
  const renters = units.filter((u) => u.assoc_status === 'ACTIVE');

  if (renters.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-brand-700 dark:bg-brand-900">
        <Users className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="mt-3 font-medium text-gray-700 dark:text-gray-300">
          No active renters
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Renters appear here once linked to an occupied unit.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-brand-700 dark:bg-brand-900">
      <div className="divide-y divide-gray-100 dark:divide-brand-800">
        {renters.map((unit) => (
          <button
            key={unit.unit_id}
            type="button"
            onClick={() => onOpenUnit(unit.unit_id)}
            className="flex w-full flex-col gap-2 p-5 text-left transition hover:bg-gray-50 dark:hover:bg-brand-800/50 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">
                {unit.renter_name}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {unit.listing_title} &middot; Unit {unit.unit_number}
                {unit.renter_phone && ` \u00b7 ${unit.renter_phone}`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {unit.rent_paid_in_advance && (
                <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-800 dark:text-brand-300">
                  Paid through {formatDate(unit.rent_paid_through_month)}
                </span>
              )}
              <span className="font-medium text-gray-900 dark:text-white">
                {formatKES(unit.rent)}/mo
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}