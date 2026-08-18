
import { Check, Crown, Zap } from "lucide-react";

export type PMSPlanName =
  | "STARTER"
  | "GROWTH"
  | "PRO";

export type PMSBillingCycle =
  | "MONTHLY"
  | "ANNUAL";

export interface PMSPlan {
  id: string;
  name: PMSPlanName;
  maxUnits: number | null;
  monthlyPrice: number;
  annualPrice: number;
  description: string;
  features: string[];
  popular?: boolean;
}

export const PMS_PLANS: PMSPlan[] = [
  {
    id: "e77ef15d-8c6e-4a2e-8a53-177217f21c60",
    name: "STARTER",
    maxUnits: 5,
    monthlyPrice: 500,
    annualPrice: 5000,
    description:
      "For landlords starting with a small property portfolio.",
    features: [
      "Up to 5 properties",
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
      "Up to 20 properties",
      "Property management dashboard",
      "Tenant management",
      "Lease management",
      "Growing portfolio support",
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
      "Professional portfolio support",
    ],
  },
];

interface PMSPlanSelectorProps {
  selectedPlan: PMSPlanName;
  billingCycle: PMSBillingCycle;
  currentPlan?: PMSPlanName | null;
  currentBillingCycle?: PMSBillingCycle | null;
  disabled?: boolean;
  onPlanChange: (
    plan: PMSPlanName
  ) => void;
  onBillingCycleChange: (
    cycle: PMSBillingCycle
  ) => void;
}

function formatKES(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function PMSPlanSelector({
  selectedPlan,
  billingCycle,
  currentPlan,
  currentBillingCycle,
  disabled = false,
  onPlanChange,
  onBillingCycleChange,
}: PMSPlanSelectorProps) {
  return (
    <div className="space-y-6">
      {/* BILLING CYCLE */}

      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border bg-gray-50 p-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              onBillingCycleChange(
                "MONTHLY"
              )
            }
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
            disabled={disabled}
            onClick={() =>
              onBillingCycleChange(
                "ANNUAL"
              )
            }
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
            currentPlan === plan.name &&
            currentBillingCycle ===
              billingCycle;

          const price =
            billingCycle === "MONTHLY"
              ? plan.monthlyPrice
              : plan.annualPrice;

          return (
            <button
              key={plan.id}
              type="button"
              disabled={disabled}
              onClick={() =>
                onPlanChange(plan.name)
              }
              className={`relative flex h-full flex-col rounded-2xl border p-5 text-left transition ${
                selected
                  ? "border-gray-900 ring-2 ring-gray-900"
                  : "border-gray-200 hover:border-gray-400"
              }`}
            >
              {/* POPULAR */}

              {plan.popular && (
                <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">
                  <Zap className="h-3 w-3" />
                  Most Popular
                </span>
              )}

              {/* CURRENT */}

              {current && (
                <span className="absolute right-4 top-4 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                  Current
                </span>
              )}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    PMS Plan
                  </p>

                  <h3 className="mt-1 text-xl font-bold">
                    {plan.name}
                  </h3>
                </div>

                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    selected
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {selected ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Crown className="h-5 w-5" />
                  )}
                </div>
              </div>

              <div className="mt-5">
                <p className="text-3xl font-bold">
                  {formatKES(price)}
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  per{" "}
                  {billingCycle ===
                  "MONTHLY"
                    ? "month"
                    : "year"}
                </p>
              </div>

              <div className="mt-4 rounded-lg bg-gray-50 p-3">
                <p className="text-sm font-semibold">
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
    </div>
  );
}

