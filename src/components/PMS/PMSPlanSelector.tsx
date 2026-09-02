import { useEffect, useState } from 'react';
import { Check, Crown, Home, Users } from 'lucide-react';
import { protectedGet } from '@/lib/djangoApi';
import PMSCheckoutModal, { type PMSCheckoutPlan } from '@/modals/Pmscheckoutmodal';
import type { PMSCheckoutAudience } from '@/lib/LandlordTs/Pmspayments';

export type PMSAudience = 'landlord' | 'real_estate';
export type PMSBillingCycle = 'MONTHLY' | 'ANNUAL';
export type PMSPlanName = 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';

export interface PMSSubscriptionPlan {
  id: string;
  name: PMSPlanName;
  audience: 'LANDLORD' | 'REAL_ESTATE';
  max_listings: number | null;
  max_units_per_listing: number | null;
  monthly_price_kes: number;
  annual_price_kes: number;
  paypal_product_id: string | null;
  paypal_monthly_plan_id: string | null;
  paypal_annual_plan_id: string | null;
  paypal_monthly_price_usd: number | null;
  paypal_annual_price_usd: number | null;
  paypal_fx_rate: number | null;
}

export interface PMSPlanSelectorProps {
  onProceedToPayment?: (plan: PMSSubscriptionPlan, billingCycle: PMSBillingCycle) => void;
  onPaymentSuccess?: () => void;
  role: PMSAudience;
  selectedPlanId?: string | null;
  selectedPlanName?: PMSPlanName | null;
  billingCycle: PMSBillingCycle;
  currentPlanId?: string | null;
  currentPlanName?: PMSPlanName | null;
  currentBillingCycle?: PMSBillingCycle | null;
  disabled?: boolean;
  listingId?: string | null;
  onGoToDashboard: () => void;
  onPlanChange: (plan: PMSSubscriptionPlan) => void;
  onBillingCycleChange: (cycle: PMSBillingCycle) => void;
}

function formatKES(value: number | null | undefined) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function formatLimit(value: number | null) {
  return value === null ? 'Unlimited' : Number(value).toLocaleString('en-KE');
}

function normalizePlanName(value: unknown): PMSPlanName {
  const name = String(value ?? '').trim().toUpperCase();
  return ['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'].includes(name)
    ? (name as PMSPlanName)
    : 'STARTER';
}

export default function PMSPlanSelector({
  role,
  selectedPlanId,
  selectedPlanName,
  billingCycle,
  currentPlanId,
  currentPlanName,
  currentBillingCycle,
  disabled = false,
  listingId,
  onGoToDashboard,
  onPlanChange,
  onBillingCycleChange,
  onProceedToPayment,
  onPaymentSuccess,
}: PMSPlanSelectorProps) {
  const [plans, setPlans] = useState<PMSSubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [localSelectedPlanId, setLocalSelectedPlanId] = useState<string | null>(selectedPlanId ?? null);
  const [localSelectedPlanName, setLocalSelectedPlanName] = useState<PMSPlanName | null>(selectedPlanName ?? null);
  const [localBillingCycle, setLocalBillingCycle] = useState<PMSBillingCycle>(billingCycle ?? 'MONTHLY');

  // Parent props are used as initial/current values, but local interaction must
  // remain responsive even when the parent callback does not immediately echo
  // the selected value back through props.
  useEffect(() => {
    setLocalSelectedPlanId(selectedPlanId ?? null);
  }, [selectedPlanId]);

  useEffect(() => {
    setLocalSelectedPlanName(selectedPlanName ?? null);
  }, [selectedPlanName]);

  useEffect(() => {
    setLocalBillingCycle(billingCycle ?? 'MONTHLY');
  }, [billingCycle]);

  useEffect(() => {
    let cancelled = false;
    const audience = role === 'landlord' ? 'LANDLORD' : 'REAL_ESTATE';

    setLoading(true);
    setError(null);

    protectedGet<PMSSubscriptionPlan[]>(`/api/subscriptions/plans/?audience=${audience}`)
      .then((data) => {
        if (cancelled) return;
        setPlans(
          (Array.isArray(data) ? data : []).map((plan) => ({
            ...plan,
            id: String(plan.id),
            name: normalizePlanName(plan.name),
            audience: plan.audience === 'REAL_ESTATE' ? 'REAL_ESTATE' : 'LANDLORD',
            max_listings: plan.max_listings == null ? null : Number(plan.max_listings),
            max_units_per_listing:
              plan.max_units_per_listing == null ? null : Number(plan.max_units_per_listing),
            monthly_price_kes: Number(plan.monthly_price_kes ?? 0),
            annual_price_kes: Number(plan.annual_price_kes ?? 0),
            paypal_product_id: plan.paypal_product_id ?? null,
            paypal_monthly_plan_id: plan.paypal_monthly_plan_id ?? null,
            paypal_annual_plan_id: plan.paypal_annual_plan_id ?? null,
            paypal_monthly_price_usd:
              plan.paypal_monthly_price_usd == null ? null : Number(plan.paypal_monthly_price_usd),
            paypal_annual_price_usd:
              plan.paypal_annual_price_usd == null ? null : Number(plan.paypal_annual_price_usd),
            paypal_fx_rate: plan.paypal_fx_rate == null ? null : Number(plan.paypal_fx_rate),
          })),
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load subscription plans.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [role]);

  const effectivePlanId = localSelectedPlanId;
  const effectivePlanName = localSelectedPlanName;
  const effectiveBillingCycle = localBillingCycle;
  const selectedPlan =
    plans.find((plan) => plan.id === effectivePlanId || plan.name === effectivePlanName) ?? null;

  const isCurrentPlan = Boolean(
    selectedPlan &&
      (currentPlanId === selectedPlan.id || currentPlanName === selectedPlan.name) &&
      currentBillingCycle === effectiveBillingCycle,
  );

  const hasCurrentSubscription = Boolean(currentPlanId || currentPlanName);
  const checkoutAudience: PMSCheckoutAudience = role === 'landlord' ? 'LANDLORD' : 'REAL_ESTATE';
  const checkoutPlan: PMSCheckoutPlan | null = selectedPlan
    ? {
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        billingCycle: effectiveBillingCycle,
        amountKes:
          effectiveBillingCycle === 'MONTHLY'
            ? selectedPlan.monthly_price_kes
            : selectedPlan.annual_price_kes,
      }
    : null;

  const handlePlanChange = (plan: PMSSubscriptionPlan) => {
    setLocalSelectedPlanId(plan.id);
    setLocalSelectedPlanName(plan.name);
    onPlanChange(plan);
  };

  const handleBillingCycleChange = (cycle: PMSBillingCycle) => {
    setLocalBillingCycle(cycle);
    onBillingCycleChange(cycle);
  };

  const handlePayClick = () => {
    if (!selectedPlan) return;
    if (hasCurrentSubscription && isCurrentPlan) {
      onGoToDashboard();
      return;
    }
    onProceedToPayment?.(selectedPlan, effectiveBillingCycle);
    setCheckoutOpen(true);
  };

  return (
    <div className="space-y-7">
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {(['MONTHLY', 'ANNUAL'] as PMSBillingCycle[]).map((cycle) => (
            <button
              key={cycle}
              type="button"
              disabled={disabled}
              onClick={() => handleBillingCycleChange(cycle)}
              className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
                effectiveBillingCycle === cycle
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {cycle === 'MONTHLY' ? 'Monthly' : 'Annual'}
            </button>
          ))}
        </div>
      </div>

      <p className="text-center text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {role === 'landlord' ? 'Landlord' : 'Real Estate'} subscription plans
      </p>

      {loading && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-80 animate-pulse rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && plans.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => {
            const selected = effectivePlanId === plan.id || effectivePlanName === plan.name;
            const current =
              (currentPlanId === plan.id || currentPlanName === plan.name) &&
              currentBillingCycle === effectiveBillingCycle;
            const price =
              effectiveBillingCycle === 'MONTHLY'
                ? plan.monthly_price_kes
                : plan.annual_price_kes;

            return (
              <button
                key={plan.id}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => handlePlanChange(plan)}
                className={`group relative flex h-full flex-col rounded-2xl border bg-white p-6 text-left shadow-sm transition-all dark:bg-gray-900 ${
                  selected
                    ? 'border-gray-900 shadow-md ring-2 ring-gray-900/10 dark:border-white'
                    : 'border-gray-200 hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-md dark:border-gray-700'
                } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      {role === 'landlord' ? 'Landlord' : 'Real Estate'} PMS
                    </p>
                    <h3 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                      {plan.name}
                    </h3>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {selected ? <Check className="h-5 w-5" /> : <Crown className="h-5 w-5" />}
                  </div>
                </div>

                <div className="mt-7">
                  <span className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                    {formatKES(price)}
                  </span>
                  <span className="ml-1 text-sm text-gray-500">
                    /{effectiveBillingCycle === 'MONTHLY' ? 'month' : 'year'}
                  </span>
                </div>

                <div className="mt-6 flex items-center gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-gray-700">
                    <Home className="h-4 w-4 text-gray-700 dark:text-gray-200" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Listings</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {plan.max_listings === null
                        ? 'Unlimited listings'
                        : `Up to ${formatLimit(plan.max_listings)} listings`}
                    </p>
                  </div>
                </div>

                {plan.max_units_per_listing !== null && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-gray-700">
                      <Users className="h-4 w-4 text-gray-700 dark:text-gray-200" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Units per listing</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Up to {formatLimit(plan.max_units_per_listing)} units
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex items-center justify-center rounded-xl border px-2 py-2.5 text-sm font-semibold">
                  {selected ? 'Selected' : current ? 'Current Plan' : 'Select Plan'}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!loading && !error && selectedPlan && (
        <div className="flex flex-col items-center gap-3 pt-2">
          <p className="text-center text-sm text-gray-500">
            Selected:{' '}
            <span className="font-bold text-gray-900 dark:text-white">{selectedPlan.name}</span> ·{' '}
            {formatKES(
              effectiveBillingCycle === 'MONTHLY'
                ? selectedPlan.monthly_price_kes
                : selectedPlan.annual_price_kes,
            )}
            /{effectiveBillingCycle === 'MONTHLY' ? 'month' : 'year'}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={handlePayClick}
            className="inline-flex min-w-[240px] items-center justify-center rounded-xl bg-gray-900 px-6 py-3.5 text-sm font-bold text-white"
          >
            {hasCurrentSubscription && isCurrentPlan
              ? 'Go to PMS Dashboard'
              : hasCurrentSubscription
                ? 'Upgrade'
                : 'Proceed to Payment'}
          </button>
        </div>
      )}

      {!loading && !error && plans.length === 0 && (
        <div className="rounded-2xl border p-10 text-center">
          <Crown className="mx-auto h-8 w-8" />
          <h3 className="mt-4 text-base font-semibold">No subscription plans available</h3>
        </div>
      )}

      <PMSCheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        audience={checkoutAudience}
        plan={checkoutPlan}
        listingId={listingId}
        onSuccess={() => {
          setCheckoutOpen(false);
          onPaymentSuccess?.();
        }}
      />
    </div>
  );
}
