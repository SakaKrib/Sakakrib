import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
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
  WalletCards,
  XCircle,
} from 'lucide-react';

import {
  addListingToPMS,
  computePMSCapacity,
  getMyAvailablePMSListings,
  getMyPMSListings,
  getMyPMSSubscription,
  getMyPMSUnitCount,
  getPMSPlans,
  removeListingFromPMS,
  type PMSAvailableListing,
  type PMSBillingCycle,
  type PMSCapacity,
  type PMSListing,
  type PMSPlan,
  type PMSSubscription,
} from '@/lib/LandlordTs/LandlordpmsService';

import {
  getMyPMSUnits,
  getMyRentSummary,
  getUnitPaymentHistory,
  markUnitRentPaidThrough,
  type MarkRentPaidResult,
  type PMSUnit,
  type RentPaymentRecord,
  type RentSummary,
} from '@/lib/LandlordTs/Landlordpmsrent';

import LandlordPMSSettings from '@/components/PMS/LandlordPms/Landlordpmssettings';

import LandlordPMSInvoices from '@/components/PMS/LandlordPms/Landlordpmsinvoices';

import PMSPlanSelector, {
  type PMSSubscriptionPlan,
  type PMSBillingCycle as PMSPlanSelectorBillingCycle,
} from '@/components/PMS/PMSPlanSelector';

import LandlordPMSPaymentConfirmations from '@/components/PMS/LandlordPms/Landlordpmspaymentconfirmations';

// import LandlordPMSRenters from '@/components/PMS/LandlordPms/LandlordPMSRenters';


// ============================================================
// HELPERS
// ============================================================

function formatKES(value: number | null | undefined): string {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return 'KES 0';
  }

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not set';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
  }).format(date);
}

function formatMonthYear(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-KE', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}



/**
 * Only ACTIVE and GRACE_PERIOD are usable PMS subscriptions.
 *
 * PENDING_PAYMENT does NOT grant PMS access.
 * EXPIRED and CANCELLED do NOT grant PMS access.
 */
function hasUsableSubscription(
  subscription: PMSSubscription | null,
): boolean {
  if (!subscription) return false;

  return (
    subscription.status === 'ACTIVE' ||
    subscription.status === 'GRACE_PERIOD'
  );
}

function getSubscriptionLabel(
  subscription: PMSSubscription | null,
): string {
  if (!subscription) {
    return 'No subscription';
  }

  switch (subscription.status) {
    case 'ACTIVE':
      return 'Active';

    case 'GRACE_PERIOD':
      return 'Grace period';

    case 'PENDING_PAYMENT':
      return 'Payment pending';

    case 'EXPIRED':
      return 'Expired';

    case 'CANCELLED':
      return 'Cancelled';

    default:
      return subscription.status;
  }
}

function getSubscriptionBadgeClass(
  subscription: PMSSubscription | null,
): string {
  if (!subscription) {
    return 'bg-gray-100 text-gray-700 dark:bg-brand-800 dark:text-gray-300';
  }

  switch (subscription.status) {
    case 'ACTIVE':
      return 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400';

    case 'GRACE_PERIOD':
      return 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400';

    case 'PENDING_PAYMENT':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';

    case 'EXPIRED':
    case 'CANCELLED':
      return 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400';

    default:
      return 'bg-gray-100 text-gray-700 dark:bg-brand-800 dark:text-gray-300';
  }
}


// ============================================================
// DASHBOARD DATA
// ============================================================

interface LandlordPMSData {
  subscription: PMSSubscription | null;
  capacity: PMSCapacity;
  rentSummary: RentSummary | null;

  pmsListings: PMSListing[];
  availableListings: PMSAvailableListing[];

  units: PMSUnit[];

  plans: PMSPlan[];
}

async function loadLandlordPMSData(): Promise<LandlordPMSData> {
  const [
    subscription,
    rentSummary,
    pmsListings,
    availableListings,
    units,
    plans,
  ] = await Promise.all([
    getMyPMSSubscription(),
    getMyRentSummary(),
    getMyPMSListings(),
    getMyAvailablePMSListings(),
    getMyPMSUnits(),
    getPMSPlans(),
  ]);

  /**
   * There is no subscription yet.
   *
   * We still load the dashboard so that the landlord can see
   * available plans and purchase PMS.
   */
  const listingsUsed = subscription
    ? await getMyPMSUnitCount(subscription.subscription_id)
    : 0;

  const capacity = computePMSCapacity(
    listingsUsed,
    subscription,
  );

  

  return {
    subscription,
    capacity,
    rentSummary,
    pmsListings,
    availableListings,
    units,
    plans,
  };
}



// ============================================================
// PAGE
// ============================================================

type PMSPage =
  | 'overview'
  | 'properties'
  | 'units'
  | 'unit-details'
  | 'renters'
  | 'invoices'
  | 'payment-confirmations'
  | 'settings';


// ============================================================
// ROOT
// ============================================================

export default function LandlordPMS() {
  const [page, setPage] = useState<PMSPage>('overview');

  const [selectedUnitId, setSelectedUnitId] =
    useState<string | null>(null);

  const [data, setData] =
    useState<LandlordPMSData | null>(null);


  

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result =
        await loadLandlordPMSData();

      setData(result);
    } catch (err) {
      console.error(
        'Failed to load Landlord PMS:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load property management.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const goTo = useCallback(
    (next: PMSPage) => {
      setPage(next);
    },
    [],
  );

  const openUnit = useCallback(
    (unitId: string) => {
      setSelectedUnitId(unitId);
      setPage('unit-details');
    },
    [],
  );

  const selectedUnit = useMemo(
    () =>
      data?.units.find(
        (unit) =>
          unit.unit_id === selectedUnitId,
      ) ?? null,
    [data?.units, selectedUnitId],
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

          <button
            type="button"
            onClick={() => void load()}
            className="btn-primary mt-6"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const subscriptionIsUsable =
    hasUsableSubscription(data.subscription);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

      {/* ======================================================
          HEADER
      ====================================================== */}

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
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                loading ? 'animate-spin' : ''
              }`}
            />
            Refresh
          </button>
        </div>
      </div>


      {/* ======================================================
          GLOBAL ERROR
      ====================================================== */}

      {error && data && (
        <div className="mt-6 rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-900 dark:bg-error-900/20 dark:text-error-400">
          {error}
        </div>
      )}


      {/* ======================================================
          NAVIGATION
      ====================================================== */}

      {page !== 'overview' && (
        <button
          type="button"
          onClick={() =>
            page === 'unit-details'
              ? goTo('units')
              : goTo('overview')
          }
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          <ArrowLeft className="h-4 w-4" />

          {page === 'unit-details'
            ? 'Back to Units'
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
              ['invoices', 'Invoices', FileText],
              [
                'payment-confirmations',
                'Payment Confirmations',
                CheckCircle2,
              ],
            ] as const
          ).map(([key, label, Icon]) => {
            const restricted =
              !subscriptionIsUsable;

            return (
              <button
                key={key}
                type="button"
                disabled={restricted}
                onClick={() => goTo(key)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-700 dark:bg-brand-900 dark:text-gray-300"
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </nav>
      )}


      {/* ======================================================
          CONTENT
      ====================================================== */}

      <div className="mt-8">

        {page === 'overview' && (
          <OverviewView
            data={data}
            onNavigate={goTo}
            onSubscriptionChanged={load}
          />
        )}

        {page === 'properties' && (
          <PropertiesView
            data={data}
            onChanged={load}
          />
        )}

        {page === 'units' && (
          <UnitsView
            units={data.units}
            onOpenUnit={openUnit}
          />
        )}

        {page === 'unit-details' && selectedUnit && (
          <UnitDetailsView
            unit={selectedUnit}
            onChanged={load}
          />
        )}

        {page === 'unit-details' && !selectedUnit && (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-brand-700 dark:bg-brand-900">
            <XCircle className="mx-auto h-8 w-8 text-error-500" />

            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Unit not found.
            </p>

            <button
              type="button"
              onClick={() => goTo('units')}
              className="btn-primary mt-5"
            >
              Back to Units
            </button>
          </div>
        )}

        {/* {page === 'renters' && (
          <LandlordPMSRenters
            units={data.units}
            onChanged={load}
          />
        )} */}

        {page === 'invoices' && (
          <LandlordPMSInvoices
            units={data.units}
          />
        )}

        {page === 'payment-confirmations' && (
          <LandlordPMSPaymentConfirmations
            units={data.units}
          />
        )}

        {page === 'settings' && (
          <LandlordPMSSettings />
        )}
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
  onSubscriptionChanged,
}: {
  data: LandlordPMSData;
  onNavigate: (page: PMSPage) => void;
  onSubscriptionChanged: () => Promise<void>;
}) {
  const {
    subscription,
    capacity,
    rentSummary,
    plans,
  } = data;

  const usable =
    hasUsableSubscription(subscription);

  return (
    <div className="space-y-6">

      <SubscriptionPanel
        subscription={subscription}
        capacity={capacity}
        plans={plans}
        onChanged={onSubscriptionChanged}
        onNavigate={onNavigate}
      />

      {usable && rentSummary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <StatCard
            icon={Home}
            label="Total units"
            value={String(
              rentSummary.total_units,
            )}
          />

          <StatCard
            icon={CheckCircle2}
            label="Occupied"
            value={String(
              rentSummary.occupied_units,
            )}
            tone="success"
          />

          <StatCard
            icon={Home}
            label="Vacant"
            value={String(
              rentSummary.vacant_units,
            )}
            tone="warning"
          />

          <StatCard
            icon={Users}
            label="Active renters"
            value={String(
              rentSummary.total_renters,
            )}
          />

          <StatCard
            icon={Wallet}
            label="Rent due"
            value={formatKES(
              rentSummary.monthly_rent_due,
            )}
          />

          <StatCard
            icon={CheckCircle2}
            label="Rent paid"
            value={formatKES(
              rentSummary.monthly_rent_paid,
            )}
            tone="success"
          />

          <StatCard
            icon={Clock3}
            label="Outstanding"
            value={formatKES(
              rentSummary.monthly_rent_outstanding,
            )}
            tone={
              rentSummary.monthly_rent_outstanding > 0
                ? 'warning'
                : undefined
            }
          />
        </div>
      )}

      {usable && (
        <div className="grid gap-4 sm:grid-cols-3">

          <QuickLinkCard
            icon={Building2}
            title="Properties"
            description={`${data.pmsListings.length} managed`}
            onClick={() =>
              onNavigate('properties')
            }
          />

          <QuickLinkCard
            icon={Home}
            title="Units"
            description={`${data.units.length} total`}
            onClick={() =>
              onNavigate('units')
            }
          />

          <QuickLinkCard
            icon={Users}
            title="Renters"
            description={`${
              data.units.filter(
                (unit) =>
                  unit.assoc_status === 'ACTIVE',
              ).length
            } active`}
            onClick={() =>
              onNavigate('renters')
            }
          />

        </div>
      )}
    </div>
  );
}


// ============================================================
// SUBSCRIPTION PANEL
// ============================================================

function SubscriptionPanel({
  subscription,
  capacity,
  onChanged,
  onNavigate,
}: {
  subscription: PMSSubscription | null;
  capacity: PMSCapacity;
  // `plans` is intentionally no longer a required prop here - the
  // real PMSPlanSelector fetches LANDLORD-audience plans itself
  // (see its own useEffect), so the duplicate plans list this panel
  // used to receive and render its own grid from is gone. Still
  // accepted (unused) so the OverviewView call site above doesn't
  // need to change.
  plans?: PMSPlan[];
  onChanged: () => Promise<void>;
  onNavigate: (page: PMSPage) => void;
}) {
  const [selectedPlan, setSelectedPlan] =
    useState<PMSSubscriptionPlan | null>(null);

  const [billingCycle, setBillingCycle] =
    useState<PMSPlanSelectorBillingCycle>(
      (subscription?.billing_cycle as PMSPlanSelectorBillingCycle) ?? 'MONTHLY',
    );

  // PMSCheckoutModal is owned internally by PMSPlanSelector itself
  // (it opens on its own pay button click, no wiring required here)
  // - this panel doesn't need its own checkout state or a second
  // modal render, which would otherwise stack two overlapping
  // modals on the same click.

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">

      <div className="flex flex-wrap items-start justify-between gap-4">

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            PMS Subscription
          </p>

          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
            {subscription?.plan_name ||
              'No subscription'}
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${getSubscriptionBadgeClass(
            subscription,
          )}`}
        >
          {getSubscriptionLabel(
            subscription,
          )}
        </span>

      </div>

      {subscription && (
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 dark:border-brand-800 sm:grid-cols-4">

          <div>
            <p className="text-xs text-gray-400">
              Properties used
            </p>

            <p className="mt-1 font-semibold text-gray-900 dark:text-white">
              {capacity.listings_used}

              {capacity.max_listings !== null &&
                ` / ${capacity.max_listings}`}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-400">
              Billing
            </p>

            <p className="mt-1 font-semibold text-gray-900 dark:text-white">
              {subscription.billing_cycle ===
              'MONTHLY'
                ? 'Monthly'
                : 'Annual'}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-400">
              Period ends
            </p>

            <p className="mt-1 font-semibold text-gray-900 dark:text-white">
              {formatDate(
                subscription.current_period_end,
              )}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-400">
              Auto renew
            </p>

            <p className="mt-1 font-semibold text-gray-900 dark:text-white">
              {subscription.auto_renew
                ? 'Enabled'
                : 'Disabled'}
            </p>
          </div>

        </div>
      )}

      {subscription?.status ===
        'GRACE_PERIOD' && (
        <div className="mt-4 rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-900 dark:bg-warning-900/20 dark:text-warning-400">
          Your PMS subscription is in its grace
          period. Renew your subscription to
          retain full property-management access.
        </div>
      )}

      {subscription?.status ===
        'PENDING_PAYMENT' && (
        <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-700 dark:border-orange-900 dark:bg-orange-900/20 dark:text-orange-400">
          Your subscription payment is being
          processed. PMS access will become
          available after the payment is confirmed.
        </div>
      )}

      {(subscription?.status === 'EXPIRED' ||
        subscription?.status === 'CANCELLED') && (
        <div className="mt-4 rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-900 dark:bg-error-900/20 dark:text-error-400">
          Your PMS subscription is not currently
          active. Select a plan below to renew
          access.
        </div>
      )}

      {!subscription ||
        subscription.status === 'EXPIRED' ||
        subscription.status === 'CANCELLED' ? (
        <div className="mt-6 border-t border-gray-100 pt-6 dark:border-brand-800">

          <div className="mb-5">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Choose a PMS plan
            </h3>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Select a plan, then pay with M-Pesa or PayPal.
            </p>
          </div>

          <PMSPlanSelector
            role="landlord"
            selectedPlanId={selectedPlan?.id ?? null}
            billingCycle={billingCycle}
            currentPlanId={subscription?.plan_id ?? null}
            currentBillingCycle={
              (subscription?.billing_cycle as PMSPlanSelectorBillingCycle) ?? null
            }
            onPlanChange={setSelectedPlan}
            onBillingCycleChange={setBillingCycle}
            onPaymentSuccess={onChanged}
            onGoToDashboard={() => onNavigate('overview')}
          />

        </div>
      ) : null}

    </div>
  );
}


// ============================================================
// STAT CARD
// ============================================================

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


// ============================================================
// QUICK LINK
// ============================================================

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
  const [processingId, setProcessingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const subscription =
    data.subscription;

  const canManage =
    hasUsableSubscription(subscription);

  const handleAdd = async (
    listingId: string,
  ) => {
    if (!subscription || !canManage) {
      setError(
        'An active PMS subscription is required.',
      );
      return;
    }

    if (
      data.capacity.max_listings !== null &&
      data.capacity.listings_used >=
        data.capacity.max_listings
    ) {
      setError(
        'Your PMS listing limit has been reached. Upgrade your plan to add another property.',
      );
      return;
    }

    setError(null);
    setProcessingId(listingId);

    try {
      await addListingToPMS(
        subscription.subscription_id,
        listingId,
      );

      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to add property to PMS.',
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemove = async (
    listingId: string,
  ) => {
    if (!subscription || !canManage) {
      setError(
        'An active PMS subscription is required.',
      );
      return;
    }

    const confirmed =
      window.confirm(
        'Remove this property from PMS management?',
      );

    if (!confirmed) return;

    setError(null);
    setProcessingId(listingId);

    try {
      await removeListingFromPMS(
        subscription.subscription_id,
        listingId,
      );

      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to remove property from PMS.',
      );
    } finally {
      setProcessingId(null);
    }
  };

  if (!canManage) {
    return (
      <div className="rounded-xl border border-warning-200 bg-warning-50 p-8 text-center dark:border-warning-900 dark:bg-warning-900/20">
        <WalletCards className="mx-auto h-10 w-10 text-warning-600" />

        <h2 className="mt-4 text-lg font-bold text-warning-800 dark:text-warning-300">
          PMS subscription required
        </h2>

        <p className="mx-auto mt-2 max-w-md text-sm text-warning-700 dark:text-warning-400">
          Activate a PMS subscription before
          managing properties.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-900 dark:bg-error-900/20 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">

        <div className="flex flex-wrap items-center justify-between gap-3">

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Property capacity
            </p>

            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
              {data.capacity.listings_used}

              {data.capacity.max_listings !== null &&
                ` / ${data.capacity.max_listings}`}
            </p>
          </div>

          {data.capacity.listings_remaining !== null && (
            <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-300">
              {data.capacity.listings_remaining}{' '}
              remaining
            </span>
          )}

        </div>

      </div>

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

            {data.pmsListings.map(
              (listing) => (
                <div
                  key={
                    listing.subscription_listing_id
                  }
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {listing.listing_title}
                    </p>

                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {listing.listing_city}
                      {' · '}
                      {formatKES(
                        listing.listing_price_kes,
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={
                      processingId ===
                      listing.listing_id
                    }
                    onClick={() =>
                      void handleRemove(
                        listing.listing_id,
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:border-brand-700 dark:hover:bg-error-900/20"
                  >
                    {processingId ===
                    listing.listing_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}

                    Remove
                  </button>
                </div>
              ),
            )}

          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white dark:border-brand-700 dark:bg-brand-900">

        <div className="border-b border-gray-200 p-5 dark:border-brand-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            Available to add
          </h2>
        </div>

        {data.availableListings.length ===
        0 ? (
          <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No eligible listings are currently
            available.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-brand-800">

            {data.availableListings.map(
              (listing) => {

                const atLimit =
                  data.capacity.max_listings !==
                    null &&
                  data.capacity.listings_used >=
                    data.capacity.max_listings;

                return (
                  <div
                    key={listing.listing_id}
                    className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                  >

                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {listing.title}
                      </p>

                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {listing.city}
                        {' · '}
                        {formatKES(
                          listing.price_kes,
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={
                        processingId ===
                          listing.listing_id ||
                        atLimit
                      }
                      onClick={() =>
                        void handleAdd(
                          listing.listing_id,
                        )
                      }
                      className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {processingId ===
                      listing.listing_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}

                      {atLimit
                        ? 'Limit reached'
                        : 'Add to PMS'}
                    </button>

                  </div>
                );
              },
            )}

          </div>
        )}
      </div>

    </div>
  );
}


// ============================================================
// UNITS
// ============================================================

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
        <Home className="mx-auto h-10 w-10 text-gray-400" />

        <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
          No units found
        </h2>

        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Units belonging to your PMS-managed properties
          will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Units
        </h2>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          View your managed units and their renter status.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-brand-700 dark:bg-brand-900">

        <div className="divide-y divide-gray-100 dark:divide-brand-800">

          {units.map((unit) => {
            const occupied =
              unit.assoc_status === 'ACTIVE';

            return (
              <div
                key={unit.unit_id}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
              >

                <div className="flex items-start gap-4">

                  <div className="rounded-lg bg-brand-50 p-3 dark:bg-brand-800">
                    <Home className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      Unit {unit.unit_id.slice(0, 8)}
                    </h3>

                    <div className="mt-2 flex flex-wrap items-center gap-2">

                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          occupied
                            ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300'
                        }`}
                      >
                        {occupied
                          ? 'Occupied'
                          : 'Vacant'}
                      </span>

                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Unit ID: {unit.unit_id}
                      </span>

                    </div>
                  </div>

                </div>

                <button
                  type="button"
                  onClick={() =>
                    onOpenUnit(unit.unit_id)
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:border-brand-400 hover:text-brand-600 dark:border-brand-700 dark:text-gray-300"
                >
                  <Eye className="h-4 w-4" />
                  View details
                </button>

              </div>
            );
          })}

        </div>

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
  const [payments, setPayments] =
    useState<RentPaymentRecord[]>([]);

  const [loadingPayments, setLoadingPayments] =
    useState(true);

  const [processing, setProcessing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const loadPayments = useCallback(
    async () => {
      setLoadingPayments(true);
      setError(null);

      try {
        const result =
          await getUnitPaymentHistory(
            unit.unit_id,
          );

        setPayments(result);
      } catch (err) {
        console.error(
          'Failed to load unit payment history:',
          err,
        );

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load payment history.',
        );
      } finally {
        setLoadingPayments(false);
      }
    },
    [unit.unit_id],
  );

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

    // selector month
const [paidThroughMonth, setPaidThroughMonth] =
  useState(() => {
    const now = new Date();

    return `${now.getFullYear()}-${String(
      now.getMonth() + 1,
    ).padStart(2, '0')}`;
  });

  const handleMarkPaid = async () => {
    setProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const [year, month] =
        paidThroughMonth.split('-').map(Number);

      const paidThroughDate = new Date(
        year,
        month - 1,
        1,
      );

      const result: MarkRentPaidResult =
        await markUnitRentPaidThrough(
          unit.unit_id,
          paidThroughDate,
        );

      const message =
        typeof result === 'string'
          ? result
          : 'Rent payment recorded successfully.';

      setSuccess(message);

      await loadPayments();
      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to record rent payment.',
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">

      <div>
        <div className="flex items-center gap-3">

          <div className="rounded-xl bg-brand-50 p-3 dark:bg-brand-800">
            <Home className="h-6 w-6 text-brand-600 dark:text-brand-400" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Unit details
            </h2>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Unit ID: {unit.unit_id}
            </p>
          </div>

        </div>
      </div>


      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-900 dark:bg-error-900/20 dark:text-error-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-success-200 bg-success-50 p-4 text-sm text-success-700 dark:border-success-900 dark:bg-success-900/20 dark:text-success-400">
          {success}
        </div>
      )}


      <div className="grid gap-4 sm:grid-cols-2">

        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">

          <div className="flex items-center gap-2 text-gray-400">
            <Home className="h-4 w-4" />

            <span className="text-xs font-medium uppercase tracking-wide">
              Status
            </span>
          </div>

          <p className="mt-2 font-semibold text-gray-900 dark:text-white">
            {unit.assoc_status === 'ACTIVE'
              ? 'Occupied'
              : 'Vacant'}
          </p>

        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">

          <div className="flex items-center gap-2 text-gray-400">
            <Calendar className="h-4 w-4" />

            <span className="text-xs font-medium uppercase tracking-wide">
              Unit ID
            </span>
          </div>

          <p className="mt-2 break-all font-semibold text-gray-900 dark:text-white">
            {unit.unit_id}
          </p>

        </div>

      </div>


      <div className="rounded-xl border border-gray-200 bg-white dark:border-brand-700 dark:bg-brand-900">

        <div className="flex flex-col gap-3 border-b border-gray-200 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-brand-700">

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Rent management
            </h3>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Record the unit's rent payment and review
              its payment history.
            </p>
          </div>

          <button
            type="button"
            disabled={processing}
            onClick={() =>
              void handleMarkPaid()
            }
            className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}

            {processing
              ? 'Recording...'
              : 'Mark rent paid'}
          </button>

        </div>


        <div className="p-5">

          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <Wallet className="h-4 w-4" />

            <span className="text-sm font-medium">
              Payment history
            </span>
          </div>

          {loadingPayments ? (
            <div className="flex items-center justify-center py-8 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading payment history...
            </div>
          ) : payments.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No rent payments recorded yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">

              <table className="min-w-full text-sm">

                <thead>
                  <tr className="border-b border-gray-200 text-left dark:border-brand-700">

                    <th className="px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">
                      Date
                    </th>

                    <th className="px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">
                      Amount
                    </th>

                    <th className="px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">
                      Status
                    </th>

                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 dark:divide-brand-800">

                  {payments.map(
                    (payment, index) => {
                      const paymentRecord =
                        payment as RentPaymentRecord & {
                          id?: string;
                          payment_id?: string;
                          paid_at?: string | null;
                          amount?: number | null;
                          amount_kes?: number | null;
                          status?: string | null;
                        };

                      const paymentDate =
                        paymentRecord.paid_at ??
                        (
                          paymentRecord as unknown as {
                            payment_date?: string | null;
                          }
                        ).payment_date ??
                        null;

                      const amount =
                        paymentRecord.amount_kes ??
                        paymentRecord.amount ??
                        null;

                      const status =
                        paymentRecord.status ??
                        'PAID';

                      return (
                        <tr
                          key={
                            paymentRecord.id ??
                            paymentRecord.payment_id ??
                            `${unit.unit_id}-${index}`
                          }
                        >
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300">
                            {formatDate(
                              paymentDate,
                            )}
                          </td>

                          <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">
                            {formatKES(
                              amount,
                            )}
                          </td>

                          <td className="px-3 py-3">
                            <span className="rounded-full bg-success-100 px-2.5 py-1 text-xs font-semibold text-success-700 dark:bg-success-900/30 dark:text-success-400">
                              {status}
                            </span>
                          </td>
                        </tr>
                      );
                    },
                  )}

                </tbody>

              </table>

            </div>
          )}

        </div>

      </div>

    </div>
  );
}