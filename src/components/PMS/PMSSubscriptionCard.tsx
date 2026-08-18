import {
  CalendarDays,
  CreditCard,
  Crown,
  RefreshCw,
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

interface PMSSubscriptionCardProps {
  subscription: PMSSubscription;
  onUpgrade?: () => void;
}

const PLAN_PRICES: Record<
  PMSSubscription["plan_name"],
  {
    MONTHLY: number;
    ANNUAL: number;
  }
> = {
  STARTER: {
    MONTHLY: 500,
    ANNUAL: 5000,
  },
  GROWTH: {
    MONTHLY: 1500,
    ANNUAL: 15000,
  },
  PRO: {
    MONTHLY: 3500,
    ANNUAL: 35000,
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatKES(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

function getStatusLabel(
  status: PMSSubscription["status"]
) {
  switch (status) {
    case "ACTIVE":
      return "Active";

    case "PENDING_PAYMENT":
      return "Payment pending";

    case "GRACE_PERIOD":
      return "Grace period";

    case "EXPIRED":
      return "Expired";

    case "CANCELLED":
      return "Cancelled";

    default:
      return status;
  }
}

function getStatusClass(
  status: PMSSubscription["status"]
) {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-700";

    case "PENDING_PAYMENT":
      return "bg-amber-100 text-amber-700";

    case "GRACE_PERIOD":
      return "bg-orange-100 text-orange-700";

    case "EXPIRED":
      return "bg-red-100 text-red-700";

    case "CANCELLED":
      return "bg-gray-100 text-gray-600";

    default:
      return "bg-gray-100 text-gray-600";
  }
}

export default function PMSSubscriptionCard({
  subscription,
  onUpgrade,
}: PMSSubscriptionCardProps) {
  const {
    plan_name,
    max_units,
    billing_cycle,
    status,
    current_period_end,
    auto_renew,
  } = subscription;

  const price =
    PLAN_PRICES[plan_name][billing_cycle];

  const isActive =
    status === "ACTIVE";

  return (
    <div className="rounded-xl border bg-white p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100">
            <Crown className="h-5 w-5 text-gray-700" />
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Current PMS plan
            </p>

            <h2 className="mt-0.5 text-xl font-bold">
              {plan_name}
            </h2>
          </div>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
            status
          )}`}
        >
          {getStatusLabel(status)}
        </span>
      </div>

      {/* Price */}
      <div className="mt-6">
        <p className="text-3xl font-bold">
          {formatKES(price)}
        </p>

        <p className="mt-1 text-sm text-gray-500">
          per{" "}
          {billing_cycle === "MONTHLY"
            ? "month"
            : "year"}
        </p>
      </div>

      {/* Plan details */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Property limit
          </span>

          <span className="font-medium">
            {max_units === null
              ? "Unlimited"
              : `${max_units} properties`}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-gray-500">
            <CalendarDays className="h-4 w-4" />
            Current period
          </span>

          <span className="font-medium">
            {formatDate(
              current_period_end
            )}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-gray-500">
            <RefreshCw className="h-4 w-4" />
            Auto renewal
          </span>

          <span className="font-medium">
            {auto_renew
              ? "Enabled"
              : "Disabled"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        {onUpgrade && (
          <button
            type="button"
            onClick={onUpgrade}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
          >
            <CreditCard className="h-4 w-4" />

            {isActive
              ? "Change plan"
              : "Renew subscription"}
          </button>
        )}
      </div>
    </div>
  );
}