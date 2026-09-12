import { AlertTriangle, Home } from "lucide-react";

// Derived client-side capacity view (see computePMSCapacity in
// pmsService.ts) — listings_used comes from get_my_pms_unit_count
// (a plain integer), max_listings from subscription_plans via the
// subscription. Renamed from unit_count/max_units/remaining_units,
// which don't match any live column names.
interface PMSCapacity {
  listings_used: number;
  max_listings: number | null;
  listings_remaining: number | null;
}

interface PMSUsageBarProps {
  capacity: PMSCapacity | null;
}

export default function PMSUsageBar({
  capacity,
}: PMSUsageBarProps) {
  if (!capacity) {
    return (
      <div className="rounded-xl border bg-white p-5">
        <div className="flex items-center gap-3">
          <Home className="h-5 w-5 text-gray-500" />

          <div>
            <h3 className="font-semibold">
              PMS property usage
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              No usage information available.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const {
    listings_used,
    max_listings,
    listings_remaining,
  } = capacity;

  const isUnlimited =
    max_listings === null;

  const percentage = isUnlimited
    ? 0
    : max_listings > 0
      ? Math.min(
          100,
          (listings_used / max_listings) * 100
        )
      : 0;

  const limitReached =
    !isUnlimited &&
    listings_remaining !== null &&
    listings_remaining <= 0;

  const nearLimit =
    !isUnlimited &&
    !limitReached &&
    percentage >= 80;

  return (
    <div className="rounded-xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
            <Home className="h-5 w-5 text-gray-700" />
          </div>

          <div>
            <h3 className="font-semibold">
              PMS property usage
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              Properties currently managed by PMS
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-xl font-bold">
            {listings_used}
            {!isUnlimited && (
              <>
                {" "}
                <span className="text-sm font-normal text-gray-400">
                  / {max_listings}
                </span>
              </>
            )}
          </p>

          <p className="text-xs text-gray-500">
            {isUnlimited
              ? "Unlimited"
              : listings_used === 1
                ? "property"
                : "properties"}
          </p>
        </div>
      </div>

      {!isUnlimited && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-gray-500">
              Usage
            </span>

            <span className="font-medium text-gray-700">
              {Math.round(percentage)}%
            </span>
          </div>

          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={max_listings ?? 0}
            aria-valuenow={listings_used}
            aria-label="PMS property usage"
          >
            <div
              className={`h-full rounded-full transition-all ${
                limitReached
                  ? "bg-red-500"
                  : nearLimit
                    ? "bg-orange-500"
                    : "bg-green-500"
              }`}
              style={{
                width: `${percentage}%`,
              }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p
              className={`text-xs ${
                limitReached
                  ? "font-medium text-red-600"
                  : nearLimit
                    ? "text-orange-600"
                    : "text-gray-500"
              }`}
            >
              {limitReached
                ? "Plan limit reached"
                : `${listings_remaining ?? 0} ${
                    listings_remaining === 1
                      ? "property"
                      : "properties"
                  } remaining`}
            </p>

            {limitReached && (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            )}
          </div>
        </div>
      )}

      {isUnlimited && (
        <div className="mt-5 rounded-lg bg-gray-50 px-2 py-3">
          <p className="text-sm text-gray-600">
            Your current plan supports unlimited
            properties.
          </p>
        </div>
      )}
    </div>
  );
}