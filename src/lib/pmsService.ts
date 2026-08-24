import { supabase } from "./supabase";

/* ============================================================
 * TYPES
 *
 * These match the live RPC/table shapes exactly — see the
 * comments on each field for the source. Do not rename fields
 * back to older names without re-checking the live schema.
 * ============================================================ */

export type PMSBillingCycle = "MONTHLY" | "ANNUAL";

export type PMSSubscriptionStatus =
  | "PENDING_PAYMENT"
  | "ACTIVE"
  | "GRACE_PERIOD"
  | "EXPIRED"
  | "CANCELLED";

// Matches get_my_pms_subscription()'s row shape exactly.
export interface PMSSubscription {
  subscription_id: string;
  landlord_id: string;
  plan_id: string;
  plan_name: "STARTER" | "GROWTH" | "PRO" | "ENTERPRISE";
  // subscription_plans.max_listings for this subscription's plan.
  max_listings: number | null;
  billing_cycle: PMSBillingCycle;
  status: PMSSubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  grace_period_end: string | null;
  auto_renew: boolean;
  created_at?: string;
  updated_at?: string;
}

// Matches subscription_plans columns exactly.
export interface PMSPlan {
  id: string;
  name: "STARTER" | "GROWTH" | "PRO" | "ENTERPRISE";
  audience: "LANDLORD" | "REAL_ESTATE";
  // Maximum listings/units allowed by the subscription.
  max_listings: number | null;
  // Maximum units allowed within a single listing/property (PMS).
  max_units_per_listing: number | null;
  monthly_price_kes: number;
  annual_price_kes: number;
}

// get_my_pms_unit_count() returns a plain integer — the number of
// listings currently under PMS management. It does NOT return an
// object with max_units/remaining_units; those must be derived
// client-side from the subscription's max_listings (see
// getPMSCapacity below).
export type PMSUnitCount = number;

// Derived, read-only client-side composition of the two live values
// above — not a stored/authoritative shape of its own, just a
// convenience for components that display usage vs. limit.
export interface PMSCapacity {
  listings_used: number;
  max_listings: number | null;
  listings_remaining: number | null;
}

// Matches get_my_pms_listings()'s row shape exactly — verified live.
export interface PMSListing {
  subscription_listing_id: string;
  subscription_id: string;
  listing_id: string;
  listing_title: string;
  listing_city: string;
  listing_price_kes: number;
  status: "ACTIVE" | "INACTIVE";
  activated_at: string;
}

// Matches get_my_available_pms_listings()'s row shape exactly — verified live.
export interface PMSAvailableListing {
  listing_id: string;
  title: string;
  city: string;
  price_kes: number;
  created_at: string;
}

/* ============================================================
 * RPC HELPER
 * ============================================================ */

async function rpc<T>(
  functionName: string,
  params?: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.rpc(
    functionName,
    params
  );

  if (error) {
    console.error(
      `PMS RPC "${functionName}" failed:`,
      error
    );

    throw new Error(
      error.message ||
        `Unable to execute ${functionName}`
    );
  }

  return data as T;
}

/* ============================================================
 * SUBSCRIPTION
 * ============================================================ */

export async function getMyPMSSubscription(): Promise<
  PMSSubscription | null
> {
  // get_my_pms_subscription is RETURNS TABLE(...), so Supabase
  // returns an array even for a single logical row.
  const rows = await rpc<PMSSubscription[] | PMSSubscription | null>(
    "get_my_pms_subscription"
  );

  const row = Array.isArray(rows) ? rows[0] : rows;

  return row ?? null;
}

/* ============================================================
 * UNIT COUNT
 *
 * get_my_pms_unit_count returns a plain integer — the count of
 * listings currently under PMS management for the caller. It is
 * NOT an object; do not cast it to PMSCapacity or similar.
 * ============================================================ */

export async function getMyPMSUnitCount(
  subscriptionId?: string
): Promise<number> {
  const result = await rpc<number>(
    "get_my_pms_unit_count",
    subscriptionId
      ? {
          p_subscription_id: subscriptionId,
        }
      : undefined
  );

  return Number(result ?? 0);
}

/**
 * Combines the live unit count (integer) with the subscription's
 * max_listings to produce the usage/limit view components need.
 * This is a client-side derivation, not a separate source of truth
 * — both inputs come straight from the DB.
 */
export function computePMSCapacity(
  listingsUsed: number,
  maxListings: number | null
): PMSCapacity {
  return {
    listings_used: listingsUsed,
    max_listings: maxListings,
    listings_remaining:
      maxListings === null
        ? null
        : Math.max(0, maxListings - listingsUsed),
  };
}

/* ============================================================
 * PMS LISTINGS
 * ============================================================ */

export async function getMyPMSListings(): Promise<
  PMSListing[]
> {
  const result = await rpc<PMSListing[]>(
    "get_my_pms_listings"
  );

  return Array.isArray(result)
    ? result
    : [];
}

/* ============================================================
 * AVAILABLE LISTINGS
 * ============================================================ */

export async function getMyAvailablePMSListings(): Promise<
  PMSAvailableListing[]
> {
  const result = await rpc<PMSAvailableListing[]>(
    "get_my_available_pms_listings"
  );

  return Array.isArray(result)
    ? result
    : [];
}

/* ============================================================
 * CHECK PMS STATUS FOR LISTING
 * ============================================================ */

export async function isListingPMSManaged(
  listingId: string
): Promise<boolean> {
  return rpc<boolean>(
    "is_listing_pms_managed",
    {
      p_listing_id: listingId,
    }
  );
}

/* ============================================================
 * ADD LISTING TO PMS
 * ============================================================ */

export async function addListingToPMS(
  subscriptionId: string,
  listingId: string
): Promise<unknown> {
  return rpc(
    "add_listing_to_pms",
    {
      p_subscription_id:
        subscriptionId,

      p_listing_id:
        listingId,
    }
  );
}

/* ============================================================
 * REMOVE LISTING FROM PMS
 * ============================================================ */

export async function removeListingFromPMS(
  subscriptionId: string,
  listingId: string
): Promise<unknown> {
  return rpc(
    "remove_listing_from_pms",
    {
      p_subscription_id:
        subscriptionId,

      p_listing_id:
        listingId,
    }
  );
}

/* ============================================================
 * SUBSCRIPTION PLANS
 *
 * PMS is landlord-only today (subscription-stk Edge Function
 * rejects any non-landlord role), so this filters to the
 * LANDLORD audience. Never hardcode prices/limits — always read
 * them from subscription_plans.
 * ============================================================ */

export async function getPMSPlans(): Promise<
  PMSPlan[]
> {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select(`
      id,
      name,
      audience,
      max_listings,
      max_units_per_listing,
      monthly_price_kes,
      annual_price_kes
    `)
    .eq("audience", "LANDLORD")
    .order("monthly_price_kes", {
      ascending: true,
    });

  if (error) {
    console.error(
      "PMS plan lookup failed:",
      error
    );

    throw new Error(
      error.message ||
        "Unable to load PMS plans"
    );
  }

  return (data ?? []).map((plan) => ({
    id: plan.id,
    name: plan.name,
    audience: plan.audience,

    max_listings:
      plan.max_listings === null
        ? null
        : Number(plan.max_listings),

    max_units_per_listing:
      plan.max_units_per_listing === null
        ? null
        : Number(plan.max_units_per_listing),

    monthly_price_kes:
      Number(plan.monthly_price_kes),

    annual_price_kes:
      Number(plan.annual_price_kes),
  })) as PMSPlan[];
}

/* ============================================================
 * M-PESA PAYMENT
 * ============================================================ */

export interface PMSPaymentRequest {
  plan_id: string;
  billing_cycle: PMSBillingCycle;
}

export interface PMSPaymentResponse {
  success: boolean;
  message?: string;
  error?: string;

  invoice_id?: string;
  subscription_id?: string;

  plan?: string;
  billing_cycle?: PMSBillingCycle;
  amount_kes?: number;

  checkout_request_id?: string;
  merchant_request_id?: string | null;

  customer_message?: string;
}

export async function initiatePMSPayment(
  request: PMSPaymentRequest
): Promise<PMSPaymentResponse> {
  const {
    data: {
      session,
    },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL;

  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Supabase configuration is missing."
    );
  }

  // Live Edge Function is "subscription-stk" — this is the only
  // deployed function for PMS subscription payments (M-Pesa).
  // There is no PesaPal Edge Function; do not reintroduce one.
  const response = await fetch(
    `${supabaseUrl}/functions/v1/subscription-stk`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${session.access_token}`,

        apikey:
          anonKey,
      },

      body: JSON.stringify({
        plan_id:
          request.plan_id,

        billing_cycle:
          request.billing_cycle,
      }),
    }
  );

  let data: PMSPaymentResponse;

  try {
    data =
      (await response.json()) as PMSPaymentResponse;
  } catch {
    throw new Error(
      "Invalid response from payment service."
    );
  }

  if (!response.ok || !data.success) {
    throw new Error(
      data.error ||
        "Unable to initiate M-Pesa payment."
    );
  }

  return data;
}

/* ============================================================
 * LOAD PMS DASHBOARD
 * ============================================================ */

export async function loadPMSDashboardData() {
  const subscription =
    await getMyPMSSubscription();

  const [
    listingsUsed,
    listings,
    availableListings,
    plans,
  ] = await Promise.all([
    getMyPMSUnitCount(
      subscription?.subscription_id
    ),

    getMyPMSListings(),

    getMyAvailablePMSListings(),

    getPMSPlans(),
  ]);

  const capacity = computePMSCapacity(
    listingsUsed,
    subscription?.max_listings ?? null
  );

  return {
    subscription,
    capacity,
    listings,
    availableListings,
    plans,
  };
}