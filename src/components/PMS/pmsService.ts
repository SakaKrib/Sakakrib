import { supabase } from "../../lib/supabase";

/* ============================================================
 * TYPES
 * ============================================================ */

export type PMSBillingCycle = "MONTHLY" | "ANNUAL";

export type PMSSubscriptionStatus =
  | "PENDING_PAYMENT"
  | "ACTIVE"
  | "GRACE_PERIOD"
  | "EXPIRED"
  | "CANCELLED";

export interface PMSSubscription {
  id: string;
  landlord_id: string;
  plan_id: string;
  billing_cycle: PMSBillingCycle;
  status: PMSSubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  grace_period_end: string | null;
  auto_renew: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PMSPlan {
  id: string;
  name: "STARTER" | "GROWTH" | "PRO";
  max_units: number | null;
  monthly_price_kes: number;
  annual_price_kes: number;
}

export interface PMSUnitCount {
  unit_count: number;
  max_units: number | null;
  plan_name: string | null;
}

export interface PMSListing {
  id: string;
  subscription_id: string;
  listing_id: string;
  status: "ACTIVE" | "INACTIVE";
  activated_at: string;
  deactivated_at: string | null;
}

export interface PMSAvailableListing {
  id: string;
  title: string;
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
  return rpc<PMSSubscription | null>(
    "get_my_pms_subscription"
  );
}

/* ============================================================
 * UNIT COUNT
 * ============================================================ */

export async function getMyPMSUnitCount(
  subscriptionId?: string
): Promise<PMSUnitCount> {
  return rpc<PMSUnitCount>(
    "get_my_pms_unit_count",
    subscriptionId
      ? {
          p_subscription_id: subscriptionId,
        }
      : undefined
  );
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
 * ============================================================ */

export async function getPMSPlans(): Promise<
  PMSPlan[]
> {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select(`
      id,
      name,
      max_units,
      monthly_price_kes,
      annual_price_kes
    `)
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
    max_units:
      plan.max_units === null
        ? null
        : Number(plan.max_units),

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
    unitCount,
    listings,
    availableListings,
    plans,
  ] = await Promise.all([
    getMyPMSUnitCount(
      subscription?.id
    ),

    getMyPMSListings(),

    getMyAvailablePMSListings(),

    getPMSPlans(),
  ]);

  return {
    subscription,
    unitCount,
    listings,
    availableListings,
    plans,
  };
}