
import { useMemo, useState } from "react";
import {
  Check,
  Crown,
  Loader2,
  X,
  Zap,
} from "lucide-react";

interface PMSSubscription {
  id: string;
  plan_id: string;
  plan_name: "STARTER" | "GROWTH" | "PRO";
  max_units: number | null;
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

interface PMSUpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription?: PMSSubscription | null;
  onContinue?: (params: {
    planId: string;
    planName: "STARTER" | "GROWTH" | "PRO";
    billingCycle: "MONTHLY" | "ANNUAL";
    amountKes: number;
  }) => Promise<void> | void;
}

type PlanName = "STARTER" | "GROWTH" | "PRO";
type BillingCycle = "MONTHLY" | "ANNUAL";

interface PMSPlan {
  id: string;
  name: PlanName;
  maxUnits: number | null;
  monthlyPrice: number;
  annualPrice: number;
  description: string;
  features: string[];
  popular?: boolean;
}

const PMS_PLANS: PMSPlan[] = [
  {
    id: "e77ef15d-8c6e-4a2e-8a53-177217f21c60",
    name: "STARTER",
    maxUnits: 5,
    monthlyPrice: 500,
    annualPrice: 5000,
    description:
      "For landlords starting with a small property portfolio.",
    features: [
      "Manage up to 5 properties",
      "Property management dashboard",
      "Tenant management",
      "Lease management",
    ],
  },
  {
    id: "f4f50355-9b37-466a-add3-c0f1d16b9e63",
    name: "GROWTH",
    maxUnits: 20,
    monthlyPrice: 1500,
    annualPrice: 15000,
    description:
      "For growing landlords managing multiple properties.",
    features: [
      "Manage up to 20 properties",
      "Property management dashboard",
      "Tenant management",
      "Lease management",
      "Designed for growing portfolios",
    ],
    popular: true,
  },
  {
    id: "d3530c0b-ec22-47d5-b835-ef1a26cf7f5b",
    name: "PRO",
    maxUnits: null,
    monthlyPrice: 3500,
    annualPrice: 35000,
    description:
      "For professional landlords with larger portfolios.",
    features: [
      "Unlimited properties",
      "Property management dashboard",
      "Tenant management",
      "Lease management",
      "Built for professional portfolios",
    ],
  },
];

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
  onContinue,
}: PMSUpgradeDialogProps) {
  const [billingCycle, setBillingCycle] =
    useState<BillingCycle>(
      subscription?.billing_cycle ?? "MONTHLY"
    );

  const [selectedPlan, setSelectedPlan] =
    useState<PlanName>(
      subscription?.plan_name ?? "STARTER"
    );

  const [processing, setProcessing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const selectedPlanData = useMemo(() => {
    return PMS_PLANS.find(
      (plan) => plan.name === selectedPlan
    );
  }, [selectedPlan]);

  const amountKes =
    selectedPlanData === undefined
      ? 0
      : billingCycle === "MONTHLY"
      ? selectedPlanData.monthlyPrice
      : selectedPlanData.annualPrice;

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

          <div className="grid gap-5 lg:grid-cols-3">
            {PMS_PLANS.map((plan) => {
              const selected =
                selectedPlan === plan.name;

              const current =
                subscription?.plan_name ===
                  plan.name &&
                subscription?.billing_cycle ===
                  billingCycle;

              const price =
                billingCycle === "MONTHLY"
                  ? plan.monthlyPrice
                  : plan.annualPrice;

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
                  {/* POPULAR */}

                  {plan.popular && (
                    <div className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">
                      <Zap className="h-3 w-3" />
                      Most Popular
                    </div>
                  )}

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
                      {plan.maxUnits === null
                        ? "Unlimited properties"
                        : `Up to ${plan.maxUnits} properties`}
                    </p>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-gray-600">
                    {plan.description}
                  </p>

                  <div className="mt-5 space-y-2">
                    {plan.features.map(
                      (feature) => (
                        <div
                          key={feature}
                          className="flex items-start gap-2 text-sm text-gray-600"
                        >
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />

                          <span>
                            {feature}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </button>
              );
            })}
          </div>

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
                  {selectedPlan}
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

