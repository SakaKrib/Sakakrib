import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Crown,
  Loader2,
  X,
  Zap,
} from "lucide-react";

interface PMSSubscription {
  subscription_id: string;
  plan_id: string;
  plan_name: "STARTER" | "GROWTH" | "PRO" | "ENTERPRISE";
  max_listings: number | null;
  billing_cycle: "MONTHLY" | "ANNUAL";
  status:
    | "PENDING_PAYMENT"
    | "ACTIVE"
    | "GRACE_PERIOD"
    | "EXPIRED"
    | "CANCELLED";
  current_period_start: string;
  current_period_end: string;
  grace_period_end: string | null;
  auto_renew: boolean;
}

type PlanName = "STARTER" | "GROWTH" | "PRO" | "ENTERPRISE";
type BillingCycle = "MONTHLY" | "ANNUAL";

// Matches subscription_plans columns exactly — no monthlyPrice/
// annualPrice/maxUnits camelCase renaming and no local features/
// popular flags that don't exist in the DB (those were previously
// hardcoded here; if you want marketing copy per plan, source it
// from a small static lookup keyed by plan id, not by duplicating
// price/limit data).
interface PMSPlan {
  id: string;
  name: PlanName;
  max_listings: number | null;
  monthly_price_kes: number;
  annual_price_kes: number;
}

interface PMSUpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription?: PMSSubscription | null;
  // Live plans from subscription_plans (e.g. via getPMSPlans() in
  // pmsService.ts). This dialog no longer fetches or hardcodes its
  // own copy of plan data.
  plans: PMSPlan[];
  plansLoading?: boolean;
  onContinue?: (params: {
    planId: string;
    planName: PlanName;
    billingCycle: BillingCycle;
    amountKes: number;
  }) => Promise<void> | void;
}

function formatKES(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

function getActionLabel(
  subscription: PMSSubscription | null | undefined
) {
  if (!subscription) {
    return "Continue to Payment";
  }

  switch (subscription.status) {
    case "GRACE_PERIOD":
    case "EXPIRED":
      return "Renew Subscription";

    case "PENDING_PAYMENT":
      return "Continue Payment";

    case "ACTIVE":
      return "Change Plan";

    case "CANCELLED":
      return "Subscribe Again";

    default:
      return "Continue to Payment";
  }
}

export default function PMSUpgradeDialog({
  open,
  onOpenChange,
  subscription,
  plans,
  plansLoading = false,
  onContinue,
}: PMSUpgradeDialogProps) {
  const [billingCycle, setBillingCycle] =
    useState<BillingCycle>(
      subscription?.billing_cycle ?? "MONTHLY"
    );

  const [selectedPlan, setSelectedPlan] =
    useState<PlanName | null>(
      subscription?.plan_name ?? null
    );

  const [processing, setProcessing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  // Default the selection once plans have loaded, if nothing is
  // selected yet (e.g. a brand-new subscriber with no current plan).
  useEffect(() => {
    if (!selectedPlan && plans.length > 0) {
      setSelectedPlan(plans[0].name);
    }
  }, [plans, selectedPlan]);

  const selectedPlanData = useMemo(() => {
    return plans.find(
      (plan) => plan.name === selectedPlan
    );
  }, [plans, selectedPlan]);

  const amountKes =
    selectedPlanData === undefined
      ? 0
      : billingCycle === "MONTHLY"
      ? selectedPlanData.monthly_price_kes
      : selectedPlanData.annual_price_kes;

  const isCurrentPlan =
    Boolean(
      subscription &&
        subscription.plan_name === selectedPlan &&
        subscription.billing_cycle === billingCycle
    );

  const actionLabel =
    getActionLabel(subscription);

  const handleContinue = async () => {
    if (!selectedPlanData) {
      setError("Please select a subscription plan.");
      return;
    }

    if (isCurrentPlan && subscription?.status === "ACTIVE") {
      setError(
        "You are already subscribed to this plan and billing cycle."
      );
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      if (onContinue) {
        await onContinue({
          planId: selectedPlanData.id,
          planName: selectedPlanData.name,
          billingCycle,
          amountKes,
        });
      }
    } catch (err) {
      console.error(
        "Failed to continue PMS subscription:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to continue with the selected plan."
      );
    } finally {
      setProcessing(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pms-upgrade-dialog-title"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* HEADER */}

        <div className="flex items-start justify-between border-b p-5 md:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100">
              <Crown className="h-5 w-5 text-gray-700" />
            </div>

            <div>
              <h2
                id="pms-upgrade-dialog-title"
                className="text-xl font-bold text-gray-900"
              >
                PMS Subscription
              </h2>

              <p className="mt-1 text-sm text-gray-600">
                Choose the plan that fits your property
                portfolio.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={processing}
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* CONTENT */}

        <div className="overflow-y-auto p-5 md:p-6">
          {/* BILLING CYCLE */}

          <div className="mb-6 flex justify-center">
            <div className="inline-flex rounded-xl border bg-gray-50 p-1">
              <button
                type="button"
                onClick={() =>
                  setBillingCycle("MONTHLY")
                }
                disabled={processing}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
                  billingCycle === "MONTHLY"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                Monthly
              </button>

              <button
                type="button"
                onClick={() =>
                  setBillingCycle("ANNUAL")
                }
                disabled={processing}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
                  billingCycle === "ANNUAL"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                Annual
              </button>
            </div>
          </div>

          {/* PLANS */}

          {plansLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading plans...
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-3">
              {plans.map((plan) => {
                const selected =
                  selectedPlan === plan.name;

                const current =
                  subscription?.plan_name ===
                    plan.name &&
                  subscription?.billing_cycle ===
                    billingCycle;

                const price =
                  billingCycle === "MONTHLY"
                    ? plan.monthly_price_kes
                    : plan.annual_price_kes;

                return (
                  <button
                    key={plan.id}
                    type="button"
                    disabled={processing}
                    onClick={() =>
                      setSelectedPlan(plan.name)
                    }
                    className={`relative flex h-full flex-col rounded-2xl border p-5 text-left transition ${
                      selected
                        ? "border-gray-900 ring-2 ring-gray-900"
                        : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {/* CURRENT */}

                    {current && (
                      <div className="absolute right-4 top-4 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                        Current
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          PMS Plan
                        </p>

                        <h3 className="mt-1 text-xl font-bold text-gray-900">
                          {plan.name}
                        </h3>
                      </div>

                      {selected && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white">
                          <Check className="h-4 w-4" />
                        </div>
                      )}
                    </div>

                    <div className="mt-5">
                      <p className="text-3xl font-bold text-gray-900">
                        {formatKES(price)}
                      </p>

                      <p className="mt-1 text-sm text-gray-500">
                        per{" "}
                        {billingCycle === "MONTHLY"
                          ? "month"
                          : "year"}
                      </p>
                    </div>

                    <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2">
                      <p className="text-sm font-semibold text-gray-800">
                        {plan.max_listings === null
                          ? "Unlimited properties"
                          : `Up to ${plan.max_listings} properties`}
                      </p>
                    </div>
                  </button>
                );
              })}

              {plans.length === 0 && (
                <p className="col-span-full py-8 text-center text-sm text-gray-500">
                  No subscription plans are available right now.
                </p>
              )}
            </div>
          )}

          {/* ERROR */}

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* PAYMENT SUMMARY */}

          <div className="mt-6 rounded-xl border bg-gray-50 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Selected plan
                </p>

                <p className="mt-1 font-bold text-gray-900">
                  {selectedPlan ?? "—"}
                </p>

                <p className="text-sm text-gray-500">
                  {billingCycle === "MONTHLY"
                    ? "Monthly billing"
                    : "Annual billing"}
                </p>
              </div>

              <div className="sm:text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Amount
                </p>

                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {formatKES(amountKes)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}

        <div className="flex flex-col-reverse gap-3 border-t bg-gray-50 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
          <button
            type="button"
            disabled={processing}
            onClick={() => onOpenChange(false)}
            className="light-button"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={
              processing ||
              !selectedPlanData ||
              (isCurrentPlan &&
                subscription?.status ===
                  "ACTIVE")
            }
            onClick={handleContinue}
            className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              actionLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}