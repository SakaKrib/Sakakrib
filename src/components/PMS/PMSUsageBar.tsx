import { AlertTriangle, Home } from "lucide-react";

interface PMSUnitCount {
  unit_count: number;
  max_units: number | null;
  remaining_units: number | null;
}

interface PMSUsageBarProps {
  unitCount: PMSUnitCount | null;
}

export default function PMSUsageBar({
  unitCount,
}: PMSUsageBarProps) {
  if (!unitCount) {
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
    unit_count,
    max_units,
    remaining_units,
  } = unitCount;

  const isUnlimited =
    max_units === null;

  const percentage = isUnlimited
    ? 0
    : max_units > 0
      ? Math.min(
          100,
          (unit_count / max_units) * 100
        )
      : 0;

  const limitReached =
    !isUnlimited &&
    remaining_units !== null &&
    remaining_units <= 0;

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
            {unit_count}
            {!isUnlimited && (
              <>
                {" "}
                <span className="text-sm font-normal text-gray-400">
                  / {max_units}
                </span>
              </>
            )}
          </p>

          <p className="text-xs text-gray-500">
            {isUnlimited
              ? "Unlimited"
              : unit_count === 1
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
            aria-valuemax={max_units ?? 0}
            aria-valuenow={unit_count}
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
                : `${remaining_units ?? 0} ${
                    remaining_units === 1
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
        <div className="mt-5 rounded-lg bg-gray-50 px-4 py-3">
          <p className="text-sm text-gray-600">
            Your current plan supports unlimited
            properties.
          </p>
        </div>
      )}
    </div>
  );
}