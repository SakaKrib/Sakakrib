import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export interface PMSSubscription {
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

export interface PMSUnitCount {
  unit_count: number;
  max_units: number | null;
  remaining_units: number | null;
}

export interface PMSListing {
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
      const [
        subscriptionResult,
        countResult,
        listingsResult,
        availableResult,
      ] = await Promise.all([
        supabase.rpc("get_my_pms_subscription"),

        supabase.rpc("get_my_pms_unit_count"),

        supabase.rpc("get_my_pms_listings"),

        supabase.rpc("get_my_available_pms_listings"),
      ]);

      if (subscriptionResult.error) {
        throw subscriptionResult.error;
      }

      if (countResult.error) {
        throw countResult.error;
      }

      if (listingsResult.error) {
        throw listingsResult.error;
      }

      if (availableResult.error) {
        throw availableResult.error;
      }

      const subscriptionData =
        subscriptionResult.data?.[0] ?? null;

      const rawCount =
        countResult.data?.[0] ?? null;

        const countData: PMSUnitCount | null =
        rawCount
            ? {
                unit_count: Number(
                rawCount.unit_count ?? 0
                ),

                max_units:
                rawCount.max_units == null
                    ? null
                    : Number(rawCount.max_units),

                remaining_units:
                rawCount.remaining_units == null
                    ? null
                    : Number(rawCount.remaining_units),
            }
            : null;

      setSubscription(subscriptionData);
      setUnitCount(countData);
      setListings(
        listingsResult.data ?? []
      );
      setAvailableListings(
        availableResult.data ?? []
      );
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
      if (!subscription?.id) {
        throw new Error(
          "No active PMS subscription found."
        );
      }

      const { error } =
        await supabase.rpc(
          "add_listing_to_pms",
          {
            p_subscription_id:
              subscription.id,
            p_listing_id:
              listingId,
          }
        );

      if (error) {
        throw error;
      }

      await loadSubscription();
    },
    [
      subscription?.id,
      loadSubscription,
    ]
  );

  const removeUnit = useCallback(
    async (
      listingId: string
    ) => {
      if (!subscription?.id) {
        throw new Error(
          "No PMS subscription found."
        );
      }

      const { error } =
        await supabase.rpc(
          "remove_listing_from_pms",
          {
            p_subscription_id:
              subscription.id,
            p_listing_id:
              listingId,
          }
        );

      if (error) {
        throw error;
      }

      await loadSubscription();
    },
    [
      subscription?.id,
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