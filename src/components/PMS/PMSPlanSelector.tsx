import { Check, Crown } from "lucide-react";

export type PMSPlanName =
  | "STARTER"
  | "GROWTH"
  | "PRO"
  | "ENTERPRISE";

export type PMSBillingCycle =
  | "MONTHLY"
  | "ANNUAL";

// Matches subscription_plans columns exactly.
export interface PMSPlan {
  id: string;
  name: PMSPlanName;
  max_listings: number | null;
  monthly_price_kes: number;
  annual_price_kes: number;
}

interface PMSPlanSelectorProps {
  // Live plans from subscription_plans (e.g. getPMSPlans() in
  // pmsService.ts). No plan data is hardcoded in this component.
  plans: PMSPlan[];
  selectedPlan: PMSPlanName | null;
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
  plans,
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
        {plans.map((plan) => {
          const selected =
            selectedPlan === plan.name;

          const current =
            currentPlan === plan.name &&
            currentBillingCycle ===
              billingCycle;

          const price =
            billingCycle === "MONTHLY"
              ? plan.monthly_price_kes
              : plan.annual_price_kes;

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
    </div>
  );
}