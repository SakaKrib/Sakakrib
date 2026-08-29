import { useEffect, useState } from "react";
import {
  Check,
  Crown,
  Home,
  Users,
} from "lucide-react";

import { protectedGet } from "@/lib/protectedApi";

import PMSCheckoutModal, {
  type PMSCheckoutPlan,
} from "@/modals/Pmscheckoutmodal";
import type { PMSCheckoutAudience } from "@/lib/LandlordTs/Pmspayments";

/* ============================================================
 * TYPES
 * ============================================================ */

export type PMSAudience =
  | "landlord"
  | "real_estate";

export type PMSBillingCycle =
  | "MONTHLY"
  | "ANNUAL";

export type PMSPlanName =
  | "STARTER"
  | "GROWTH"
  | "PRO"
  | "ENTERPRISE";

export interface PMSSubscriptionPlan {
  id: string;
  name: PMSPlanName;
  audience: "LANDLORD" | "REAL_ESTATE";

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

/* ============================================================
 * PROPS
 * ============================================================ */

export interface PMSPlanSelectorProps {

  /**
   * Optional - fired when payment starts, purely informational
   * (e.g. analytics). The selector opens its own PMSCheckoutModal
   * regardless of whether this is provided, so the pay button works
   * even if a parent never wires this up.
   */
  onProceedToPayment?: (
    plan: PMSSubscriptionPlan,
    billingCycle: PMSBillingCycle
  ) => void;

  /**
   * Optional - fired once PMSCheckoutModal confirms the payment
   * succeeded (invoice PAID / subscription ACTIVE). Use this to
   * refresh whatever subscription state the parent page displays.
   */
  onPaymentSuccess?: () => void;
  
  /**
   * Determines which subscription_plans.audience
   * is loaded.
   */
  role: PMSAudience;

  /**
   * Database ID of the currently selected plan.
   */
  selectedPlanId?: string | null;
  selectedPlanName?: PMSPlanName | null;

  /**
   * Current billing cycle being previewed.
   */
  billingCycle: PMSBillingCycle;

  /**
   * Existing subscription plan ID.
   */
  currentPlanId?: string | null;
  currentPlanName?: PMSPlanName | null;

  /**
   * Existing subscription billing cycle.
   */
  currentBillingCycle?: PMSBillingCycle | null;

  disabled?: boolean;

  onGoToDashboard: () => void;

  /**
   * Returns the complete database plan.
   */
  onPlanChange: (
    plan: PMSSubscriptionPlan
  ) => void;

  onBillingCycleChange: (
    cycle: PMSBillingCycle
  ) => void;
}

/* ============================================================
 * HELPERS
 * ============================================================ */

function formatKES(
  value: number | null | undefined
): string {
  const amount = Number(value ?? 0);

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(
    Number.isFinite(amount)
      ? amount
      : 0
  );
}

function formatLimit(
  value: number | null
): string {
  if (value === null) {
    return "Unlimited";
  }

  return Number(value).toLocaleString(
    "en-KE"
  );
}

function audienceLabel(
  role: PMSAudience
): string {
  return role === "landlord"
    ? "Landlord"
    : "Real Estate";
}

function normalizePlanName(
  value: unknown
): PMSPlanName {
  switch (
    String(value ?? "")
      .trim()
      .toUpperCase()
  ) {
    case "STARTER":
      return "STARTER";

    case "GROWTH":
      return "GROWTH";

    case "PRO":
      return "PRO";

    case "ENTERPRISE":
      return "ENTERPRISE";

    default:
      return "STARTER";
  }
}

/* ============================================================
 * COMPONENT
 * ============================================================ */

export default function PMSPlanSelector({
  role,
  selectedPlanId,
  selectedPlanName,
  billingCycle,
  currentPlanId,
  currentPlanName,
  currentBillingCycle,
  disabled = false,
  onPlanChange,
  onBillingCycleChange,
  onProceedToPayment,
  onPaymentSuccess,
  onGoToDashboard,
}: PMSPlanSelectorProps) {
  const [
    plans,
    setPlans,
  ] = useState<PMSSubscriptionPlan[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  // The selector owns the checkout modal itself - the pay button
  // below always opens THIS modal directly. It no longer depends on
  // a parent correctly wiring onProceedToPayment into its own modal
  // (that's exactly what silently broke for the real-estate case
  // previously - the parent's wiring is easy to forget or get
  // wrong, and every future consumer of this component would carry
  // the same risk).
  const [
    checkoutOpen,
    setCheckoutOpen,
  ] = useState(false);

  /* ==========================================================
   * LOAD PLANS FOR CURRENT ROLE
   * ========================================================== */

  useEffect(() => {
    let cancelled = false;

    async function loadPlans() {
      setLoading(true);
      setError(null);

      try {
        const audience =
          role === "landlord"
            ? "LANDLORD"
            : "REAL_ESTATE";

        const data = await protectedGet<PMSSubscriptionPlan[]>(
          `/rest/v1/subscription_plans?select=id,name,audience,max_listings,max_units_per_listing,monthly_price_kes,annual_price_kes,paypal_product_id,paypal_monthly_plan_id,paypal_annual_plan_id,paypal_monthly_price_usd,paypal_annual_price_usd,paypal_fx_rate&audience=eq.${audience}&order=monthly_price_kes.asc`
        );

        if (cancelled) {
          return;
        }

        const normalized: PMSSubscriptionPlan[] =
          (data ?? []).map((row) => ({
            id: String(row.id),

            name: normalizePlanName(
              row.name
            ),

            audience:
              row.audience ===
              "REAL_ESTATE"
                ? "REAL_ESTATE"
                : "LANDLORD",

            max_listings:
              row.max_listings === null
                ? null
                : Number(
                    row.max_listings
                  ),

            max_units_per_listing:
              row.max_units_per_listing ===
              null
                ? null
                : Number(
                    row.max_units_per_listing
                  ),

            monthly_price_kes:
              Number(
                row.monthly_price_kes ?? 0
              ),

            annual_price_kes:
              Number(
                row.annual_price_kes ?? 0
              ),

            paypal_product_id:
              row.paypal_product_id ??
              null,

            paypal_monthly_plan_id:
              row.paypal_monthly_plan_id ??
              null,

            paypal_annual_plan_id:
              row.paypal_annual_plan_id ??
              null,

            paypal_monthly_price_usd:
              row.paypal_monthly_price_usd ===
              null
                ? null
                : Number(
                    row.paypal_monthly_price_usd
                  ),

            paypal_annual_price_usd:
              row.paypal_annual_price_usd ===
              null
                ? null
                : Number(
                    row.paypal_annual_price_usd
                  ),

            paypal_fx_rate:
              row.paypal_fx_rate ===
              null
                ? null
                : Number(
                    row.paypal_fx_rate
                  ),
          }));

        setPlans(normalized);
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error(
          "Failed to load PMS plans:",
          err
        );

        setPlans([]);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load subscription plans."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPlans();

    return () => {
      cancelled = true;
    };
  }, [role]);



  const selectedPlan =
  plans.find(
    (plan) =>
      plan.id === selectedPlanId ||
      plan.name === selectedPlanName
  ) ?? null;

  const isCurrentPlan =
  currentPlanName === selectedPlan?.name &&
    currentBillingCycle === billingCycle;

  const hasCurrentSubscription =
    Boolean(currentPlanName);

  const actionLabel = !hasCurrentSubscription
    ? "Proceed to Payment"
    : isCurrentPlan
      ? "Go to PMS Dashboard"
      : selectedPlan?.name === currentPlanName
        ? "Change Billing Cycle"
        : "Upgrade";

  const checkoutAudience: PMSCheckoutAudience =
    role === "landlord" ? "LANDLORD" : "REAL_ESTATE";

  const checkoutPlan: PMSCheckoutPlan | null =
    selectedPlan
      ? {
          planId: selectedPlan.id,
          planName: selectedPlan.name,
          billingCycle,
          amountKes:
            billingCycle === "MONTHLY"
              ? selectedPlan.monthly_price_kes
              : selectedPlan.annual_price_kes,
        }
      : null;

  const handlePayClick = () => {
    if (!selectedPlan) return;

    if (hasCurrentSubscription && isCurrentPlan) {
      onGoToDashboard();
      return;
    }

    // Fire the optional informational callback, then always open
    // this component's own modal - the parent doesn't need to do
    // anything further for payment to actually work.
    onProceedToPayment?.(selectedPlan, billingCycle);
    setCheckoutOpen(true);
  };

  /* ==========================================================
   * RENDER
   * ========================================================== */

  

  return (
    <div className="space-y-7">
      {/* BILLING CYCLE */}

      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {(
            [
              "MONTHLY",
              "ANNUAL",
            ] as PMSBillingCycle[]
          ).map((cycle) => (
            <button
              key={cycle}
              type="button"
              disabled={disabled}
              onClick={() =>
                onBillingCycleChange(
                  cycle
                )
              }
              className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition-all ${
                billingCycle === cycle
                  ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                  : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              } ${
                disabled
                  ? "cursor-not-allowed opacity-60"
                  : ""
              }`}
            >
              {cycle === "MONTHLY"
                ? "Monthly"
                : "Annual"}
            </button>
          ))}
        </div>
      </div>

      {/* AUDIENCE */}

      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {audienceLabel(role)} subscription
          plans
        </p>
      </div>

      {/* LOADING */}

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

      {/* ERROR */}

      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900/50 dark:bg-red-950/20">
          <Crown className="mx-auto h-8 w-8 text-red-500" />

          <h3 className="mt-3 text-base font-semibold text-red-900 dark:text-red-300">
            Unable to load subscription plans
          </h3>

          <p className="mx-auto mt-2 max-w-lg text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        </div>
      )}

      {/* PLANS */}

      {!loading &&
        !error &&
        plans.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => {
              const selected =
                selectedPlanId === plan.id ||
                selectedPlanName === plan.name;

              const current =
                (currentPlanId === plan.id ||
                  currentPlanName === plan.name) &&
                currentBillingCycle === billingCycle;

              const price =
                billingCycle === "MONTHLY"
                  ? plan.monthly_price_kes
                  : plan.annual_price_kes;

              return (
                <button
                  key={plan.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() =>
                    onPlanChange(plan)
                  }
                  className={`group relative flex h-full flex-col rounded-2xl border bg-white p-6 text-left shadow-sm transition-all dark:bg-gray-900 ${
                    selected
                      ? "border-gray-900 shadow-md ring-2 ring-gray-900/10 dark:border-white"
                      : "border-gray-200 hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-md dark:border-gray-700"
                  } ${
                    disabled
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer"
                  }`}
                >
                  {/* CURRENT */}

                  {current && (
                    <span className="absolute right-20 top-15 inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      Current Plan
                    </span>
                  )}

                  <div className="flex items-start justify-between gap-4 relative">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        {audienceLabel(
                          role
                        )}{" "}
                        PMS
                      </p>

                      <h3 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                        {plan.name}
                      </h3>
                    </div>

                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        selected
                          ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {selected ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <Crown className="h-5 w-5" />
                      )}
                    </div>
                  </div>

                  {/* PRICE */}

                  <div className="mt-7">
                    <div className="flex items-end gap-1">
                      <span className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                        {formatKES(
                          price
                        )}
                      </span>

                      <span className="mb-1 text-sm text-gray-500">
                        /
                        {billingCycle ===
                        "MONTHLY"
                          ? "month"
                          : "year"}
                      </span>
                    </div>
                  </div>

                  {/* LISTING LIMIT */}

                  <div className="mt-6 flex items-center gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-gray-700">
                      <Home className="h-4 w-4 text-gray-700 dark:text-gray-200" />
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">
                        Listings
                      </p>

                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {plan.max_listings ===
                        null
                          ? "Unlimited listings"
                          : `Up to ${formatLimit(
                              plan.max_listings
                            )} listings`}
                      </p>
                    </div>
                  </div>

                  {/* UNIT LIMIT */}

                  {plan.max_units_per_listing !==
                    null && (
                    <div className="mt-3 flex items-center gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-gray-700">
                        <Users className="h-4 w-4 text-gray-700 dark:text-gray-200" />
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">
                          Units per listing
                        </p>

                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          Up to{" "}
                          {formatLimit(
                            plan.max_units_per_listing
                          )}{" "}
                          units
                        </p>
                      </div>
                    </div>
                  )}

                  <div
                    className={`mt-6 flex items-center justify-center rounded-xl border px-2 py-2.5 text-sm font-semibold ${
                      selected
                        ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                        : "border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    }`}
                  >
                    {selected
                      ? "Selected"
                      : current
                      ? "Current Plan"
                      : "Select Plan"}
                  </div>
                </button>
              );
            })}
          </div>
        )}

      {/* PROCEED TO PAYMENT */}

      {!loading &&
        !error &&
        selectedPlan && (
          <div className="flex flex-col items-center gap-3 pt-2">
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Selected plan
              </p>

              <p className="text-base font-bold text-gray-900 dark:text-white">
                {selectedPlan.name}{" "}
                <span className="font-normal text-gray-500">
                  ·{" "}
                  {billingCycle === "MONTHLY"
                    ? formatKES(
                        selectedPlan.monthly_price_kes
                      )
                    : formatKES(
                        selectedPlan.annual_price_kes
                      )}
                  /
                  {billingCycle === "MONTHLY"
                    ? "month"
                    : "year"}
                </span>
              </p>
            </div>

            <button
              type="button"
              disabled={disabled}
              onClick={handlePayClick}
              className={`inline-flex min-w-[240px] items-center justify-center rounded-xl px-6 py-3.5 text-sm font-bold shadow-sm transition-all ${
                disabled
                  ? "cursor-not-allowed bg-gray-300 text-gray-500"
                  : "bg-gray-900 text-white hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-md dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              }`}
            >
              {!hasCurrentSubscription
                ? "Proceed to Payment"
                : isCurrentPlan
                  ? "Go to PMS Dashboard"
                  : "Upgrade"}
            </button>
          </div>
        )}

      {/* EMPTY */}

      {!loading &&
        !error &&
        plans.length === 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <Crown className="mx-auto h-8 w-8 text-gray-500" />

            <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">
              No subscription plans available
            </h3>

            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
              No{" "}
              {audienceLabel(
                role
              ).toLowerCase()}{" "}
              subscription plans are currently
              available.
            </p>
          </div>
        )}

      <PMSCheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        audience={checkoutAudience}
        plan={checkoutPlan}
        onSuccess={() => {
          setCheckoutOpen(false);
          onPaymentSuccess?.();
        }}
      />
    </div>
  );
}