import { useCallback, useEffect, useState } from "react";
import { protectedDelete, protectedGet, protectedPost } from "../../../lib/djangoApi";

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

interface DjangoSubscriptionResponse {
  subscription_id: string | null;
  plan_id: string | null;
  plan_name: "STARTER" | "GROWTH" | "PRO" | null;
  subscription_status: PMSSubscription["status"] | null;
  billing_cycle: PMSSubscription["billing_cycle"] | null;
  max_units_per_listing: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_period_end: string | null;
  auto_renew: boolean;
}

export function usePMSSubscription() {
  const [subscription, setSubscription] = useState<PMSSubscription | null>(null);
  const [unitCount, setUnitCount] = useState<PMSUnitCount | null>(null);
  const [listings, setListings] = useState<PMSListing[]>([]);
  const [availableListings, setAvailableListings] = useState<PMSListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [subscriptionData, countData, listingsData, availableData] = await Promise.all([
        protectedGet<DjangoSubscriptionResponse>("/api/subscriptions/me/"),
        protectedGet<PMSUnitCount>("/api/subscriptions/me/pms-unit-count/"),
        protectedGet<PMSListing[]>("/api/subscriptions/me/pms-listings/"),
        protectedGet<PMSListing[]>("/api/subscriptions/me/pms-listings/available/"),
      ]);

      setSubscription(
        subscriptionData.subscription_id && subscriptionData.plan_id && subscriptionData.subscription_status
          ? {
              id: subscriptionData.subscription_id,
              landlord_id: "",
              plan_id: subscriptionData.plan_id,
              plan_name: subscriptionData.plan_name ?? "STARTER",
              max_units: subscriptionData.max_units_per_listing,
              billing_cycle: subscriptionData.billing_cycle ?? "MONTHLY",
              status: subscriptionData.subscription_status,
              current_period_start: subscriptionData.current_period_start ?? "",
              current_period_end: subscriptionData.current_period_end ?? "",
              grace_period_end: subscriptionData.grace_period_end,
              auto_renew: subscriptionData.auto_renew,
            }
          : null,
      );
      setUnitCount(countData);
      setListings(Array.isArray(listingsData) ? listingsData : []);
      setAvailableListings(Array.isArray(availableData) ? availableData : []);
    } catch (err) {
      console.error("Failed to load PMS subscription:", err);
      setError(err instanceof Error ? err.message : "Unable to load PMS subscription.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  const addUnit = useCallback(
    async (listingId: string) => {
      await protectedPost("/api/subscriptions/me/pms-listings/membership/", {
        listing_id: listingId,
      });
      await loadSubscription();
    },
    [loadSubscription],
  );

  const removeUnit = useCallback(
    async (listingId: string) => {
      await protectedDelete(
        `/api/subscriptions/me/pms-listings/membership/?listing_id=${encodeURIComponent(listingId)}`,
      );
      await loadSubscription();
    },
    [loadSubscription],
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
