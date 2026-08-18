import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

interface PMSSubscription {
  id: string;
  landlord_id: string;
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

interface PMSUnitCount {
  unit_count: number;
  max_units: number | null;
  remaining_units: number | null;
}

interface PMSListing {
  id: string;
  title: string;
  city: string;
  county: string;
  price_kes: number;
  is_published: boolean;
  status?: string;
  activated_at?: string;
  deactivated_at?: string | null;
}

export default function PMSSubscriptionPage() {
  const [subscription, setSubscription] =
    useState<PMSSubscription | null>(null);

  const [unitCount, setUnitCount] =
    useState<PMSUnitCount | null>(null);

  const [listings, setListings] =
    useState<PMSListing[]>([]);

  const [availableListings, setAvailableListings] =
    useState<PMSListing[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [processingListingId, setProcessingListingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [actionError, setActionError] =
    useState<string | null>(null);

  /*
   * --------------------------------------------------------
   * LOAD PMS DATA
   * --------------------------------------------------------
   */

  const loadSubscription = useCallback(
    async () => {
      try {
        setError(null);

        const [
          subscriptionResult,
          unitCountResult,
          listingsResult,
          availableListingsResult,
        ] = await Promise.all([
          supabase.rpc(
            "get_my_pms_subscription"
          ),

          supabase.rpc(
            "get_my_pms_unit_count"
          ),

          supabase.rpc(
            "get_my_pms_listings"
          ),

          supabase.rpc(
            "get_my_available_pms_listings"
          ),
        ]);

        if (subscriptionResult.error) {
          throw subscriptionResult.error;
        }

        if (unitCountResult.error) {
          throw unitCountResult.error;
        }

        if (listingsResult.error) {
          throw listingsResult.error;
        }

        if (availableListingsResult.error) {
          throw availableListingsResult.error;
        }

        /*
         * ----------------------------------------------------
         * NORMALIZE SUBSCRIPTION
         * ----------------------------------------------------
         */

        const rawSubscription =
          subscriptionResult.data;

        const normalizedSubscription =
          Array.isArray(rawSubscription)
            ? rawSubscription[0] ?? null
            : rawSubscription ?? null;

        /*
         * ----------------------------------------------------
         * NORMALIZE UNIT COUNT
         * ----------------------------------------------------
         */

        const rawUnitCount =
          unitCountResult.data;

        const normalizedUnitCount =
          Array.isArray(rawUnitCount)
            ? rawUnitCount[0] ?? null
            : rawUnitCount ?? null;

        /*
         * ----------------------------------------------------
         * SAVE SUBSCRIPTION
         * ----------------------------------------------------
         */

        setSubscription(
          normalizedSubscription
        );

        /*
         * ----------------------------------------------------
         * SAVE UNIT COUNT
         * ----------------------------------------------------
         */

        setUnitCount(
          normalizedUnitCount
            ? {
                unit_count: Number(
                  normalizedUnitCount.unit_count ??
                    0
                ),

                max_units:
                  normalizedUnitCount.max_units ==
                  null
                    ? null
                    : Number(
                        normalizedUnitCount.max_units
                      ),

                remaining_units:
                  normalizedUnitCount.remaining_units ==
                  null
                    ? null
                    : Number(
                        normalizedUnitCount.remaining_units
                      ),
              }
            : null
        );

        /*
         * ----------------------------------------------------
         * SAVE LISTINGS
         * ----------------------------------------------------
         */

        setListings(
          Array.isArray(
            listingsResult.data
          )
            ? listingsResult.data
            : []
        );

        setAvailableListings(
          Array.isArray(
            availableListingsResult.data
          )
            ? availableListingsResult.data
            : []
        );
      } catch (err) {
        console.error(
          "Failed to load PMS subscription:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load your PMS subscription."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  /*
   * --------------------------------------------------------
   * INITIAL LOAD
   * --------------------------------------------------------
   */

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  /*
   * --------------------------------------------------------
   * REFRESH
   * --------------------------------------------------------
   */

  const handleRefresh = async () => {
    if (refreshing) {
      return;
    }

    setRefreshing(true);

    await loadSubscription();
  };

  /*
   * --------------------------------------------------------
   * ADD PROPERTY TO PMS
   * --------------------------------------------------------
   */

  const handleAddToPMS = async (
    listingId: string
  ) => {
    if (!subscription?.id) {
      setActionError(
        "No PMS subscription found."
      );

      return;
    }

    const usedUnits =
      Number(unitCount?.unit_count ?? 0);

    const maxUnits =
      unitCount?.max_units ??
      subscription.max_units ??
      null;

    if (
      maxUnits !== null &&
      usedUnits >= maxUnits
    ) {
      setActionError(
        "You have reached your PMS property limit. Upgrade your plan to add another property."
      );

      return;
    }

    try {
      setProcessingListingId(listingId);
      setActionError(null);

      const { error: rpcError } =
        await supabase.rpc(
          "add_listing_to_pms",
          {
            p_subscription_id:
              subscription.id,

            p_listing_id:
              listingId,
          }
        );

      if (rpcError) {
        throw rpcError;
      }

      await loadSubscription();
    } catch (err) {
      console.error(
        "Failed to add listing to PMS:",
        err
      );

      setActionError(
        err instanceof Error
          ? err.message
          : "Unable to add property to PMS."
      );
    } finally {
      setProcessingListingId(null);
    }
  };

  /*
   * --------------------------------------------------------
   * REMOVE PROPERTY FROM PMS
   * --------------------------------------------------------
   */

  const handleRemoveFromPMS = async (
    listingId: string
  ) => {
    if (!subscription?.id) {
      setActionError(
        "No PMS subscription found."
      );

      return;
    }

    const confirmed =
      window.confirm(
        "Remove this property from PMS management?"
      );

    if (!confirmed) {
      return;
    }

    try {
      setProcessingListingId(listingId);
      setActionError(null);

      const { error: rpcError } =
        await supabase.rpc(
          "remove_listing_from_pms",
          {
            p_subscription_id:
              subscription.id,

            p_listing_id:
              listingId,
          }
        );

      if (rpcError) {
        throw rpcError;
      }

      await loadSubscription();
    } catch (err) {
      console.error(
        "Failed to remove listing from PMS:",
        err
      );

      setActionError(
        err instanceof Error
          ? err.message
          : "Unable to remove property from PMS."
      );
    } finally {
      setProcessingListingId(null);
    }
  };

  /*
   * --------------------------------------------------------
   * LOADING
   * --------------------------------------------------------
   */

  if (loading) {
    return (
      <section className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-gray-200" />

          <div className="h-40 rounded-xl bg-gray-200" />

          <div className="h-28 rounded-xl bg-gray-200" />

          <div className="h-40 rounded-xl bg-gray-200" />
        </div>
      </section>
    );
  }

  /*
   * --------------------------------------------------------
   * LOAD ERROR
   * --------------------------------------------------------
   */

  if (error) {
    return (
      <section className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

            <div>
              <p className="font-semibold text-red-800">
                Unable to load PMS
              </p>

              <p className="mt-1 text-sm text-red-700">
                {error}
              </p>

              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="light-button mt-4 inline-flex items-center"
              >
                {refreshing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}

                Try Again
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  /*
   * --------------------------------------------------------
   * NO SUBSCRIPTION
   * --------------------------------------------------------
   */

  if (!subscription) {
    return (
      <section className="space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-bold">
            Property Management
          </h1>

          <p className="mt-1 text-sm text-gray-600">
            Manage your rental properties with
            Saka Crib PMS.
          </p>
        </header>

        <div className="rounded-xl border bg-white p-8 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
            <Building2 className="h-6 w-6 text-gray-700" />
          </div>

          <h2 className="mt-5 text-xl font-bold">
            Start managing your properties
          </h2>

          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600">
            Choose a PMS subscription to manage
            your rental properties, monitor units,
            and control your property portfolio.
          </p>

          <button
            type="button"
            className="light-button mt-5 inline-flex items-center"
          >
            <CreditCard className="mr-2 h-4 w-4" />

            Choose a Plan
          </button>
        </div>
      </section>
    );
  }

  /*
   * --------------------------------------------------------
   * CALCULATE USAGE
   * --------------------------------------------------------
   */

  const usedUnits =
    Number(unitCount?.unit_count ?? 0);

  const maxUnits =
    unitCount?.max_units ??
    subscription.max_units ??
    null;

  const remainingUnits =
    unitCount?.remaining_units ??
    (maxUnits === null
      ? null
      : Math.max(
          0,
          maxUnits - usedUnits
        ));

  const usagePercentage =
    maxUnits === null
      ? null
      : Math.min(
          100,
          maxUnits > 0
            ? (usedUnits / maxUnits) * 100
            : 100
        );

  const canManageProperties =
    subscription.status === "ACTIVE" ||
    subscription.status ===
      "GRACE_PERIOD";

  const limitReached =
    maxUnits !== null &&
    usedUnits >= maxUnits;

  /*
   * --------------------------------------------------------
   * DASHBOARD
   * --------------------------------------------------------
   */

  return (
    <section className="space-y-6 p-6">
      {/* -------------------------------------------------- */}
      {/* HEADER */}
      {/* -------------------------------------------------- */}

      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Property Management
          </h1>

          <p className="mt-1 text-sm text-gray-600">
            Manage your PMS subscription and
            rental properties.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="light-button inline-flex items-center justify-center"
        >
          {refreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}

          Refresh
        </button>
      </header>

      {/* -------------------------------------------------- */}
      {/* ACTION ERROR */}
      {/* -------------------------------------------------- */}

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

            <div className="flex-1">
              <p className="font-semibold text-red-800">
                PMS action failed
              </p>

              <p className="mt-1 text-sm text-red-700">
                {actionError}
              </p>

              <button
                type="button"
                onClick={() =>
                  setActionError(null)
                }
                className="light-button mt-3"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* PENDING PAYMENT */}
      {/* -------------------------------------------------- */}

      {subscription.status ===
        "PENDING_PAYMENT" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

            <div>
              <h2 className="font-semibold text-amber-800">
                Payment pending
              </h2>

              <p className="mt-1 text-sm text-amber-700">
                Complete your M-Pesa payment to
                activate PMS management.
              </p>

              <button
                type="button"
                className="light-button mt-4"
              >
                Complete Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* SUBSCRIPTION */}
      {/* -------------------------------------------------- */}

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-gray-500">
              Current plan
            </p>

            <h2 className="mt-1 text-2xl font-bold">
              {subscription.plan_name}
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              Billed{" "}
              {subscription.billing_cycle ===
              "MONTHLY"
                ? "monthly"
                : "annually"}
            </p>
          </div>

          <SubscriptionStatus
            status={subscription.status}
          />
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <InfoItem
            label="Period started"
            value={formatDate(
              subscription.current_period_start
            )}
          />

          <InfoItem
            label="Period ends"
            value={formatDate(
              subscription.current_period_end
            )}
          />

          <InfoItem
            label="Auto renewal"
            value={
              subscription.auto_renew
                ? "Enabled"
                : "Disabled"
            }
          />
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* USAGE */}
      {/* -------------------------------------------------- */}

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">
              PMS property usage
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              Properties currently managed by PMS.
            </p>
          </div>

          <span className="font-semibold">
            {usedUnits}

            {maxUnits === null
              ? " / Unlimited"
              : ` / ${maxUnits}`}
          </span>
        </div>

        {usagePercentage !== null && (
          <>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all ${
                  usagePercentage >= 100
                    ? "bg-red-500"
                    : usagePercentage >= 80
                    ? "bg-amber-500"
                    : "bg-green-500"
                }`}
                style={{
                  width: `${usagePercentage}%`,
                }}
              />
            </div>

            <div className="mt-3 flex justify-between text-xs text-gray-500">
              <span>
                {remainingUnits ?? 0}{" "}
                {remainingUnits === 1
                  ? "property"
                  : "properties"}{" "}
                remaining
              </span>

              <span>
                {Math.round(
                  usagePercentage
                )}
                %
              </span>
            </div>
          </>
        )}

        {maxUnits === null && (
          <p className="mt-4 text-sm text-green-700">
            Unlimited PMS properties available.
          </p>
        )}

        {limitReached && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />

            <span>
              You have reached your plan's
              property limit. Upgrade your plan
              to add more properties.
            </span>
          </div>
        )}
      </div>

      {/* -------------------------------------------------- */}
      {/* GRACE PERIOD */}
      {/* -------------------------------------------------- */}

      {subscription.status ===
        "GRACE_PERIOD" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

            <div>
              <h2 className="font-semibold text-amber-800">
                Your subscription is in the grace
                period
              </h2>

              <p className="mt-1 text-sm text-amber-700">
                Renew before{" "}
                {subscription.grace_period_end
                  ? formatDate(
                      subscription.grace_period_end
                    )
                  : "the grace period ends"}{" "}
                to maintain PMS access.
              </p>

              <button
                type="button"
                className="light-button mt-4"
              >
                Renew Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* EXPIRED */}
      {/* -------------------------------------------------- */}

      {subscription.status ===
        "EXPIRED" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

            <div>
              <h2 className="font-semibold text-red-800">
                PMS subscription expired
              </h2>

              <p className="mt-1 text-sm text-red-700">
                Your PMS-managed properties have
                been deactivated. Renew your
                subscription to restore management
                access.
              </p>

              <button
                type="button"
                className="light-button mt-4"
              >
                Renew Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* CANCELLED */}
      {/* -------------------------------------------------- */}

      {subscription.status ===
        "CANCELLED" && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-gray-600" />

            <div>
              <h2 className="font-semibold text-gray-800">
                PMS subscription cancelled
              </h2>

              <p className="mt-1 text-sm text-gray-600">
                Your PMS subscription is currently
                cancelled. Renew your subscription
                to resume property management.
              </p>

              <button
                type="button"
                className="light-button mt-4"
              >
                Renew Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* MANAGED PROPERTIES */}
      {/* -------------------------------------------------- */}

      {canManageProperties && (
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="border-b p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">
                  Managed properties
                </h2>

                <p className="mt-1 text-sm text-gray-600">
                  {listings.length}{" "}
                  {listings.length === 1
                    ? "property"
                    : "properties"}{" "}
                  currently managed by PMS.
                </p>
              </div>

              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
            </div>
          </div>

          {listings.length === 0 ? (
            <div className="p-8 text-center">
              <Building2 className="mx-auto h-10 w-10 text-gray-400" />

              <h3 className="mt-4 font-semibold">
                No PMS properties yet
              </h3>

              <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                Add one of your existing listings
                to PMS to start managing it.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {listings.map((listing) => {
                const processing =
                  processingListingId ===
                  listing.id;

                return (
                  <div
                    key={listing.id}
                    className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">
                        {listing.title}
                      </h3>

                      <p className="mt-1 text-sm text-gray-500">
                        {listing.city},{" "}
                        {listing.county}
                      </p>

                      <p className="mt-1 text-sm font-medium">
                        KES{" "}
                        {Number(
                          listing.price_kes
                        ).toLocaleString(
                          "en-KE"
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex w-fit items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                        PMS Managed
                      </span>

                      <button
                        type="button"
                        className="light-button inline-flex items-center"
                        disabled={processing}
                        onClick={() =>
                          handleRemoveFromPMS(
                            listing.id
                          )
                        }
                      >
                        {processing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Removing...
                          </>
                        ) : (
                          "Remove"
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* AVAILABLE LISTINGS */}
      {/* -------------------------------------------------- */}

      {canManageProperties && (
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="border-b p-6">
            <h2 className="text-lg font-bold">
              Add properties to PMS
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              {availableListings.length}{" "}
              eligible{" "}
              {availableListings.length === 1
                ? "listing is"
                : "listings are"}{" "}
              available to add.
            </p>
          </div>

          {availableListings.length === 0 ? (
            <div className="p-8 text-center">
              <Building2 className="mx-auto h-10 w-10 text-gray-400" />

              <h3 className="mt-4 font-semibold">
                No eligible properties
              </h3>

              <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                All eligible listings are already
                managed by PMS, or you don't have
                any eligible listings yet.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {availableListings.map(
                (listing) => {
                  const processing =
                    processingListingId ===
                    listing.id;

                  return (
                    <div
                      key={listing.id}
                      className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">
                          {listing.title}
                        </h3>

                        <p className="mt-1 text-sm text-gray-500">
                          {listing.city},{" "}
                          {listing.county}
                        </p>

                        <p className="mt-1 text-sm font-medium">
                          KES{" "}
                          {Number(
                            listing.price_kes
                          ).toLocaleString(
                            "en-KE"
                          )}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="light-button inline-flex items-center justify-center"
                        disabled={
                          processing ||
                          limitReached
                        }
                        onClick={() =>
                          handleAddToPMS(
                            listing.id
                          )
                        }
                      >
                        {processing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          "Add to PMS"
                        )}
                      </button>
                    </div>
                  );
                }
              )}
            </div>
          )}

          {limitReached && (
            <div className="border-t bg-amber-50 p-4 text-sm text-amber-700">
              Your{" "}
              {subscription.plan_name} plan has
              reached its property limit. Upgrade
              your subscription to add more
              properties.
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* FOOTER ACTIONS */}
      {/* -------------------------------------------------- */}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="light-button inline-flex items-center"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}

          Refresh
        </button>

        <button
          type="button"
          className="light-button inline-flex items-center"
        >
          <CreditCard className="mr-2 h-4 w-4" />
          Change Plan
        </button>
      </div>
    </section>
  );
}

/*
 * ----------------------------------------------------------
 * SUBSCRIPTION STATUS
 * ----------------------------------------------------------
 */

function SubscriptionStatus({
  status,
}: {
  status: PMSSubscription["status"];
}) {
  const labels: Record<
    PMSSubscription["status"],
    string
  > = {
    PENDING_PAYMENT:
      "Payment Pending",

    ACTIVE:
      "Active",

    GRACE_PERIOD:
      "Grace Period",

    EXPIRED:
      "Expired",

    CANCELLED:
      "Cancelled",
  };

  const classes: Record<
    PMSSubscription["status"],
    string
  > = {
    PENDING_PAYMENT:
      "border-amber-200 bg-amber-50 text-amber-700",

    ACTIVE:
      "border-green-200 bg-green-50 text-green-700",

    GRACE_PERIOD:
      "border-orange-200 bg-orange-50 text-orange-700",

    EXPIRED:
      "border-red-200 bg-red-50 text-red-700",

    CANCELLED:
      "border-gray-200 bg-gray-50 text-gray-600",
  };

  return (
    <span
      className={`inline-flex w-fit rounded-full border px-3 py-1 text-sm font-semibold ${classes[status]}`}
    >
      {labels[status]}
    </span>
  );
}

/*
 * ----------------------------------------------------------
 * INFO ITEM
 * ----------------------------------------------------------
 */

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </p>

      <p className="mt-1 font-medium">
        {value}
      </p>
    </div>
  );
}

/*
 * ----------------------------------------------------------
 * DATE FORMATTER
 * ----------------------------------------------------------
 */

function formatDate(value: string) {
  return new Intl.DateTimeFormat(
    "en-KE",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(new Date(value));
}