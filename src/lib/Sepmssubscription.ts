import { useCallback, useEffect, useState } from "react";

import {
  addListingToPMS,
  computePMSCapacity,
  getMyAvailablePMSListings,
  getMyPMSListings,
  getMyPMSSubscription,
  getMyPMSUnitCount,
  removeListingFromPMS,
  type PMSAvailableListing,
  type PMSCapacity,
  type PMSListing as PMSServiceListing,
  type PMSSubscription as PMSServiceSubscription,
} from "@/lib/LandlordTs/LandlordpmsService";

/**
 * Canonical PMS types come from LandlordpmsService.ts.
 *
 * These aliases are preserved for existing consumers.
 */
export type PMSSubscription = PMSServiceSubscription;
export type PMSUnitCount = PMSCapacity;
export type PMSListing = PMSServiceListing;
export type PMSAvailableListingType = PMSAvailableListing;

/**
 * ACTIVE and GRACE_PERIOD subscriptions can manage PMS listings.
 */
function hasUsableSubscription(
  subscription: PMSSubscription | null,
): boolean {
  return (
    subscription?.status === "ACTIVE" ||
    subscription?.status === "GRACE_PERIOD"
  );
}

export function usePMSSubscription() {
  const [subscription, setSubscription] =
    useState<PMSSubscription | null>(null);

  const [unitCount, setUnitCount] =
    useState<PMSUnitCount | null>(null);

  const [listings, setListings] =
    useState<PMSListing[]>([]);

  const [availableListings, setAvailableListings] =
    useState<PMSAvailableListing[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  /**
   * Load the complete landlord PMS state.
   */
  const loadSubscription = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const subscriptionData =
        await getMyPMSSubscription();

      const [
        listingsData,
        availableData,
      ] = await Promise.all([
        getMyPMSListings(),
        getMyAvailablePMSListings(),
      ]);

      let capacity: PMSCapacity;

      if (subscriptionData?.subscription_id) {
        /*
         * IMPORTANT:
         *
         * getMyPMSUnitCount() expects a STRING subscription ID.
         * It does NOT expect the PMSSubscription object.
         */
        const listingsUsed =
          await getMyPMSUnitCount(
            subscriptionData.subscription_id,
          );

        /*
         * computePMSCapacity() expects the number of used
         * listings and the maximum allowed listings.
         */
        capacity = computePMSCapacity(
          listingsUsed,
          subscriptionData,
        );
      } else {
        /*
         * No subscription means no active PMS capacity.
         */
        capacity = computePMSCapacity(
          0,
          null,
        );
      }

      setSubscription(subscriptionData);
      setUnitCount(capacity);
      setListings(listingsData);
      setAvailableListings(availableData);
    } catch (err) {
      console.error(
        "Failed to load PMS subscription:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load PMS subscription.",
      );

      setSubscription(null);
      setUnitCount(null);
      setListings([]);
      setAvailableListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  /**
   * Add a listing/property to the landlord PMS.
   *
   * Kept as addUnit for backwards compatibility.
   */
  const addUnit = useCallback(
    async (listingId: string) => {
      const subscriptionId =
        subscription?.subscription_id;

      if (!subscriptionId) {
        throw new Error(
          "No PMS subscription found.",
        );
      }

      if (!hasUsableSubscription(subscription)) {
        throw new Error(
          "No active PMS subscription found.",
        );
      }

      await addListingToPMS(
        subscriptionId,
        listingId,
      );

      await loadSubscription();
    },
    [
      subscription?.subscription_id,
      subscription?.status,
      loadSubscription,
    ],
  );

  /**
   * Remove a listing/property from the landlord PMS.
   *
   * Kept as removeUnit for backwards compatibility.
   */
  const removeUnit = useCallback(
    async (listingId: string) => {
      const subscriptionId =
        subscription?.subscription_id;

      if (!subscriptionId) {
        throw new Error(
          "No PMS subscription found.",
        );
      }

      if (!hasUsableSubscription(subscription)) {
        throw new Error(
          "No active PMS subscription found.",
        );
      }

      await removeListingFromPMS(
        subscriptionId,
        listingId,
      );

      await loadSubscription();
    },
    [
      subscription?.subscription_id,
      subscription?.status,
      loadSubscription,
    ],
  );

  return {
    subscription,
    unitCount,
    listings,
    availableListings,
    loading,
    error,

    refresh: loadSubscription,

    addUnit,
    removeUnit,

    /*
     * Expose this so consuming components don't need to
     * duplicate subscription-status logic.
     */
    hasUsableSubscription:
      hasUsableSubscription(subscription),
  };
}
