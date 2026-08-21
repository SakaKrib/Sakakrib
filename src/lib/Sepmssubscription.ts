import { useCallback, useEffect, useState } from "react";

// NOTE: adjust this relative path if it doesn't resolve — inferred
// from the original files' differing "../lib/supabase" depths
// (this hook's file appears to sit one folder deeper than
// pmsService.ts). If your project has a "@/" alias configured
// (it's used elsewhere, e.g. "@/lib/utils"), prefer importing via
// "@/lib/pmsService" or wherever pmsService.ts actually lives instead.
import {
  addListingToPMS,
  computePMSCapacity,
  getMyAvailablePMSListings,
  getMyPMSListings,
  getMyPMSSubscription,
  getMyPMSUnitCount,
  removeListingFromPMS,
  type PMSCapacity,
  type PMSListing as PMSServiceListing,
  type PMSSubscription as PMSServiceSubscription,
} from "@/lib/pmsService";

// Re-exported so existing imports of `PMSSubscription` /
// `PMSListing` from this hook file keep working. These are now
// the single source of truth (pmsService.ts) rather than a second,
// separately-maintained copy of the same shapes.
export type PMSSubscription = PMSServiceSubscription;
export type PMSUnitCount = PMSCapacity;
export type PMSListing = PMSServiceListing;

export function usePMSSubscription() {
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

  const [error, setError] =
    useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const subscriptionData =
        await getMyPMSSubscription();

      const [
        listingsUsed,
        listingsData,
        availableData,
      ] = await Promise.all([
        getMyPMSUnitCount(
          subscriptionData?.subscription_id
        ),

        getMyPMSListings(),

        getMyAvailablePMSListings(),
      ]);

      setSubscription(subscriptionData);

      setUnitCount(
        computePMSCapacity(
          listingsUsed,
          subscriptionData?.max_listings ?? null
        )
      );

      setListings(listingsData);
      setAvailableListings(availableData);
    } catch (err) {
      console.error(
        "Failed to load PMS subscription:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load PMS subscription."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  const addUnit = useCallback(
    async (
      listingId: string
    ) => {
      if (!subscription?.subscription_id) {
        throw new Error(
          "No active PMS subscription found."
        );
      }

      await addListingToPMS(
        subscription.subscription_id,
        listingId
      );

      await loadSubscription();
    },
    [
      subscription?.subscription_id,
      loadSubscription,
    ]
  );

  const removeUnit = useCallback(
    async (
      listingId: string
    ) => {
      if (!subscription?.subscription_id) {
        throw new Error(
          "No PMS subscription found."
        );
      }

      await removeListingFromPMS(
        subscription.subscription_id,
        listingId
      );

      await loadSubscription();
    },
    [
      subscription?.subscription_id,
      loadSubscription,
    ]
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
  };
}