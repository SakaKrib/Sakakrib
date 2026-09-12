import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  XCircle,
} from "lucide-react";

interface PMSSubscription {
  status:
    | "PENDING_PAYMENT"
    | "ACTIVE"
    | "GRACE_PERIOD"
    | "EXPIRED"
    | "CANCELLED";

  current_period_end: string;
  grace_period_end: string | null;
}

interface PMSStatusBannerProps {
  subscription: PMSSubscription;
  onRenew?: () => void;
}

function formatDate(value: string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getDaysRemaining(value: string | null) {
  if (!value) return 0;

  const difference = new Date(value).getTime() - Date.now();

  return Math.max(
    0,
    Math.ceil(difference / (1000 * 60 * 60 * 24))
  );
}

export default function PMSStatusBanner({
  subscription,
  onRenew,
}: PMSStatusBannerProps) {
  const {
    status,
    current_period_end,
    grace_period_end,
  } = subscription;

  if (status === "ACTIVE") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-brand-700 dark:bg-brand-950 dark:text-gray-200">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />

        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">
            PMS subscription active
          </h3>

          <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
            Your property management access is active.
          </p>

          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            Current period ends{" "}
            <strong>{formatDate(current_period_end)}</strong>
          </p>
        </div>
      </div>
    );
  }

  if (status === "PENDING_PAYMENT") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-brand-700 dark:bg-brand-950 dark:text-gray-200">
        <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />

        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Payment required
          </h3>

          <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
            Your PMS subscription is waiting for payment.
            PMS management access has not been activated.
          </p>

          {onRenew && (
            <button
              type="button"
              onClick={onRenew}
              className="mt-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
            >
              Complete payment
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status === "GRACE_PERIOD") {
    const daysRemaining = getDaysRemaining(grace_period_end);

    return (
      <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-brand-700 dark:bg-brand-950 dark:text-gray-200">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />

        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Your PMS subscription has expired
          </h3>

          <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
            You are currently in your grace period. Renew
            before the grace period ends to keep your PMS
            properties active.
          </p>

          <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
            {daysRemaining > 0 ? (
              <>
                <strong>
                  {daysRemaining}{" "}
                  {daysRemaining === 1 ? "day" : "days"}
                </strong>{" "}
                remaining.
              </>
            ) : (
              "Grace period ending soon."
            )}

            {grace_period_end && (
              <>
                {" "}
                Grace period ends{" "}
                <strong>{formatDate(grace_period_end)}</strong>.
              </>
            )}
          </div>

          {onRenew && (
            <button
              type="button"
              onClick={onRenew}
              className="mt-4 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
            >
              Renew with M-Pesa
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status === "EXPIRED") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-brand-700 dark:bg-brand-950 dark:text-gray-200">
        <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />

        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            PMS subscription expired
          </h3>

          <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
            Your PMS management features are currently
            locked. Your property information remains
            available in read-only mode.
          </p>

          <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
            Renew your subscription to restore property
            management access.
          </p>

          {onRenew && (
            <button
              type="button"
              onClick={onRenew}
              className="mt-4 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
            >
              Reactivate PMS
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status === "CANCELLED") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-brand-700 dark:bg-brand-950 dark:text-gray-200">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400" />

        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">
            PMS subscription cancelled
          </h3>

          <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
            Your subscription is no longer active. Your
            property data has not been deleted.
          </p>

          {onRenew && (
            <button
              type="button"
              onClick={onRenew}
              className="mt-4 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
            >
              Subscribe again
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
