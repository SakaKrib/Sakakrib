import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Crown,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

import PMSPlanSelector, {
  type PMSBillingCycle,
  type PMSPlanName,
  type PMSPlan,
  PMS_PLANS,
} from "./PMSPlanSelector";

import {
  initiatePMSPayment,
} from "./pmsService";

/* ============================================================
 * DEBUG
 * ============================================================ */

const PMS_DEBUG = true;

function debug(label: string, data?: unknown) {
  if (!PMS_DEBUG) return;

  if (data === undefined) {
    console.debug(`[PMS] ${label}`);
    return;
  }

  console.debug(`[PMS] ${label}`, data);
}

function debugError(label: string, error: unknown) {
  console.error(`[PMS] ${label}`, error);
}

/* ============================================================
 * TYPES
 * ============================================================ */

type PMSRole = "landlord" | "real_estate";

type PMSSubscriptionStatus =
  | "PENDING_PAYMENT"
  | "ACTIVE"
  | "GRACE_PERIOD"
  | "EXPIRED"
  | "CANCELLED"
  | "PAST_DUE";

interface PMSSubscription {
  id: string;
  owner_id: string;
  role: PMSRole;

  plan_id: string;
  plan_name: string;

  /**
   * Number of properties/listings managed by PMS.
   *
   * This is NOT the number of units inside one property.
   */
  max_listings: number | null;

  /**
   * Future/property-level unit entitlement.
   */
  max_units_per_listing: number | null;

  billing_cycle: PMSBillingCycle;
  status: PMSSubscriptionStatus;

  current_period_start: string | null;
  current_period_end: string | null;
  grace_period_end: string | null;

  auto_renew: boolean;

  billing_amount_kes?: number | null;
  billing_amount_usd?: number | null;
  billing_exchange_rate?: number | null;

  paypal_subscription_id?: string | null;
  paypal_plan_id?: string | null;
  paypal_status?: string | null;

  next_billing_at?: string | null;

  cancel_at_period_end?: boolean;
  cancelled_at?: string | null;
}

interface PMSUsage {
  used: number;
  limit: number | null;
  remaining: number | null;
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

  approval_status?: string;
  admin_review_note?: string | null;
  is_approved?: boolean;
  is_property_management?: boolean;
}

interface PMSProfile {
  id: string;
  role: PMSRole;
}

type RPCRow = Record<string, unknown>;

/* ============================================================
 * PLAN HELPERS
 * ============================================================ */

const PMS_PLAN_NAMES: readonly PMSPlanName[] = [
  "STARTER",
  "GROWTH",
  "PRO",
];

function normalizePlanName(
  value: unknown,
): PMSPlanName | null {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();

  if (
    PMS_PLAN_NAMES.includes(
      normalized as PMSPlanName,
    )
  ) {
    return normalized as PMSPlanName;
  }

  return null;
}

/* ============================================================
 * RPC HELPERS
 * ============================================================ */

function firstRow(
  data: unknown,
): RPCRow | null {
  if (Array.isArray(data)) {
    const first = data[0];

    if (
      first &&
      typeof first === "object" &&
      !Array.isArray(first)
    ) {
      return first as RPCRow;
    }

    return null;
  }

  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data)
  ) {
    return data as RPCRow;
  }

  return null;
}

function rows(
  data: unknown,
): RPCRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter(
    (row): row is RPCRow =>
      Boolean(
        row &&
          typeof row === "object" &&
          !Array.isArray(row),
      ),
  );
}

function stringValue(
  value: unknown,
  fallback = "",
): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  return String(value);
}

function nullableString(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return String(value);
}

function numberValue(
  value: unknown,
  fallback = 0,
): number {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function nullableNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function booleanValue(
  value: unknown,
  fallback = false,
): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value
      .trim()
      .toLowerCase();

    if (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes"
    ) {
      return true;
    }

    if (
      normalized === "false" ||
      normalized === "0" ||
      normalized === "no"
    ) {
      return false;
    }
  }

  return fallback;
}

function normalizeRole(
  value: unknown,
): PMSRole {
  const role = String(value ?? "")
    .trim()
    .toLowerCase();

  if (
    role === "real_estate" ||
    role === "real-estate" ||
    role === "real estate" ||
    role === "realestate"
  ) {
    return "real_estate";
  }

  return "landlord";
}

function normalizeBillingCycle(
  value: unknown,
): PMSBillingCycle {
  return String(value ?? "")
    .trim()
    .toUpperCase() === "ANNUAL"
    ? "ANNUAL"
    : "MONTHLY";
}

function normalizeStatus(
  value: unknown,
): PMSSubscriptionStatus {
  const status = String(value ?? "")
    .trim()
    .toUpperCase();

  switch (status) {
    case "PENDING_PAYMENT":
      return "PENDING_PAYMENT";

    case "ACTIVE":
      return "ACTIVE";

    case "GRACE_PERIOD":
      return "GRACE_PERIOD";

    case "EXPIRED":
      return "EXPIRED";

    case "CANCELLED":
      return "CANCELLED";

    case "PAST_DUE":
      return "PAST_DUE";

    default:
      return "EXPIRED";
  }
}

/* ============================================================
 * LISTING NORMALIZATION
 * ============================================================ */

function normalizeListing(
  row: RPCRow,
): PMSListing | null {
  const id = stringValue(
    row.id ??
      row.listing_id ??
      row.property_id,
  );

  if (!id) {
    debug(
      "Ignoring listing row without ID",
      row,
    );

    return null;
  }

  return {
    id,

    title:
      stringValue(
        row.title ??
          row.listing_title ??
          row.property_title,
      ) || "Untitled property",

    city:
      stringValue(
        row.city ??
          row.listing_city ??
          row.property_city,
      ) || "Unknown city",

    county:
      stringValue(
        row.county ??
          row.listing_county ??
          row.property_county,
      ),

    price_kes: numberValue(
      row.price_kes ??
        row.listing_price_kes ??
        row.price ??
        row.monthly_rent,
    ),

    is_published: booleanValue(
      row.is_published ??
        row.published ??
        row.listing_is_published,
    ),

    status:
      nullableString(row.status) ??
      undefined,

    activated_at:
      nullableString(
        row.activated_at,
      ) ?? undefined,

    deactivated_at:
      nullableString(
        row.deactivated_at,
      ),

    approval_status:
      nullableString(
        row.approval_status ??
          row.listing_approval_status,
      ) ?? undefined,

    admin_review_note:
      nullableString(
        row.admin_review_note ??
          row.admin_notes ??
          row.review_note ??
          row.review_notes,
      ),

    is_approved:
      row.is_approved === undefined
        ? undefined
        : booleanValue(
            row.is_approved,
          ),

    is_property_management:
      row.is_property_management === undefined
        ? undefined
        : booleanValue(
            row.is_property_management,
          ),
  };
}

/* ============================================================
 * SUBSCRIPTION NORMALIZATION
 * ============================================================ */

function normalizeSubscription(
  row: RPCRow,
  role: PMSRole,
): PMSSubscription | null {
  const id = stringValue(
    row.id ??
      row.subscription_id,
  );

  if (!id) {
    debugError(
      "Subscription row has no ID",
      row,
    );

    return null;
  }

  const ownerId = stringValue(
    row.landlord_id ??
      row.real_estate_id ??
      row.user_id ??
      row.owner_id,
  );

  const planName =
    stringValue(
      row.plan_name ??
        row.name,
    ) || "STARTER";

  return {
    id,

    owner_id: ownerId,

    role,

    plan_id: stringValue(
      row.plan_id,
    ),

    plan_name: planName,

    max_listings:
      nullableNumber(
        row.max_listings ??
          row.max_properties ??
          row.listing_limit ??
          row.subscription_limit ??
          row.max_allowed,
      ),

    max_units_per_listing:
      nullableNumber(
        row.max_units_per_listing ??
          row.units_per_listing ??
          row.max_units,
      ),

    billing_cycle:
      normalizeBillingCycle(
        row.billing_cycle,
      ),

    status:
      normalizeStatus(
        row.status ??
          row.subscription_status,
      ),

    current_period_start:
      nullableString(
        row.current_period_start,
      ),

    current_period_end:
      nullableString(
        row.current_period_end,
      ),

    grace_period_end:
      nullableString(
        row.grace_period_end,
      ),

    auto_renew:
      booleanValue(
        row.auto_renew,
      ),

    billing_amount_kes:
      nullableNumber(
        row.billing_amount_kes,
      ),

    billing_amount_usd:
      nullableNumber(
        row.billing_amount_usd,
      ),

    billing_exchange_rate:
      nullableNumber(
        row.billing_exchange_rate,
      ),

    paypal_subscription_id:
      nullableString(
        row.paypal_subscription_id,
      ),

    paypal_plan_id:
      nullableString(
        row.paypal_plan_id,
      ),

    paypal_status:
      nullableString(
        row.paypal_status,
      ),

    next_billing_at:
      nullableString(
        row.next_billing_at,
      ),

    cancel_at_period_end:
      booleanValue(
        row.cancel_at_period_end,
        false,
      ),

    cancelled_at:
      nullableString(
        row.cancelled_at,
      ),
  };
}

/* ============================================================
 * PAGE
 * ============================================================ */

export default function PMSSubscriptionPage() {
  const [role, setRole] =
    useState<PMSRole | null>(null);

  const [
    subscription,
    setSubscription,
  ] =
    useState<PMSSubscription | null>(
      null,
    );

  const [
    selectedPlan,
    setSelectedPlan,
  ] =
    useState<PMSPlanName>(
      "STARTER",
    );

  const [
    selectedBillingCycle,
    setSelectedBillingCycle,
  ] =
    useState<PMSBillingCycle>(
      "MONTHLY",
    );

  const [
    usage,
    setUsage,
  ] =
    useState<PMSUsage>({
      used: 0,
      limit: null,
      remaining: null,
    });

  const [
    listings,
    setListings,
  ] =
    useState<PMSListing[]>([]);

  const [
    availableListings,
    setAvailableListings,
  ] =
    useState<PMSListing[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    processingListingId,
    setProcessingListingId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    paymentLoading,
    setPaymentLoading,
  ] =
    useState(false);

  const [
    paymentMessage,
    setPaymentMessage,
  ] =
    useState<string | null>(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    actionError,
    setActionError,
  ] =
    useState<string | null>(
      null,
    );

  /* ==========================================================
   * LOAD PROFILE
   * ========================================================== */

  const loadProfile =
    useCallback(
      async (): Promise<PMSProfile> => {
        const {
          data: {
            user,
          },
          error: userError,
        } =
          await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          throw new Error(
            "You must be signed in to access PMS.",
          );
        }

        const {
          data: profile,
          error: profileError,
        } =
          await supabase
            .from("profiles")
            .select("id, role")
            .eq("id", user.id)
            .single();

        if (profileError) {
          throw profileError;
        }

        const normalizedRole =
          normalizeRole(
            profile?.role,
          );

        if (
          normalizedRole !==
            "landlord" &&
          normalizedRole !==
            "real_estate"
        ) {
          throw new Error(
            "PMS subscriptions are available only to landlord and real estate accounts.",
          );
        }

        return {
          id: user.id,
          role: normalizedRole,
        };
      },
      [],
    );

  /* ==========================================================
   * ENRICH LISTINGS WITH ADMIN REVIEW DATA
   * ========================================================== */

  const enrichListings =
    useCallback(
      async (
        source: PMSListing[],
      ): Promise<PMSListing[]> => {
        if (source.length === 0) {
          return [];
        }

        const ids =
          source.map(
            (listing) =>
              listing.id,
          );

        const {
          data,
          error: listingError,
        } =
          await supabase
            .from("listings")
            .select(
              [
                "id",
                "county",
                "approval_status",
                "admin_review_note",
                "is_approved",
                "is_property_management",
                "is_published",
              ].join(", "),
            )
            .in("id", ids);

        if (listingError) {
          debugError(
            "Listing enrichment failed",
            listingError,
          );

          return source;
        }

        const metadata =
          new Map<
            string,
            RPCRow
          >(
            (data ?? []).map(
              (row) => [
                String(row.id),
                row as RPCRow,
              ],
            ),
          );

        return source.map(
          (listing) => {
            const extra =
              metadata.get(
                listing.id,
              );

            if (!extra) {
              return listing;
            }

            return {
              ...listing,

              county:
                stringValue(
                  extra.county,
                ) ||
                listing.county,

              approval_status:
                nullableString(
                  extra.approval_status,
                ) ??
                listing.approval_status,

              admin_review_note:
                nullableString(
                  extra.admin_review_note,
                ) ??
                listing.admin_review_note,

              is_approved:
                extra.is_approved ===
                undefined
                  ? listing.is_approved
                  : booleanValue(
                      extra.is_approved,
                    ),

              is_property_management:
                extra.is_property_management ===
                undefined
                  ? listing.is_property_management
                  : booleanValue(
                      extra.is_property_management,
                    ),

              is_published:
                extra.is_published ===
                undefined
                  ? listing.is_published
                  : booleanValue(
                      extra.is_published,
                    ),
            };
          },
        );
      },
      [],
    );

  /* ==========================================================
   * LOAD LANDLORD PMS
   * ========================================================== */

  const loadLandlordPMS =
    useCallback(
      async () => {
        const [
          subscriptionResult,
          unitCountResult,
          listingsResult,
          availableListingsResult,
        ] =
          await Promise.all([
            supabase.rpc(
              "get_my_pms_subscription",
            ),

            supabase.rpc(
              "get_my_pms_unit_count",
            ),

            supabase.rpc(
              "get_my_pms_listings",
            ),

            supabase.rpc(
              "get_my_available_pms_listings",
            ),
          ]);

        if (
          subscriptionResult.error
        ) {
          throw subscriptionResult.error;
        }

        if (
          unitCountResult.error
        ) {
          throw unitCountResult.error;
        }

        if (
          listingsResult.error
        ) {
          throw listingsResult.error;
        }

        if (
          availableListingsResult.error
        ) {
          throw availableListingsResult.error;
        }

        const normalizedSubscription =
          normalizeSubscription(
            firstRow(
              subscriptionResult.data,
            ) ?? {},
            "landlord",
          );

        /*
         * get_my_pms_subscription() returns no row
         * when the landlord has no current PMS subscription.
         */
        const actualSubscription =
          firstRow(
            subscriptionResult.data,
          )
            ? normalizedSubscription
            : null;

        setSubscription(
          actualSubscription,
        );

        if (actualSubscription) {
          setSelectedPlan(
            normalizePlanName(
              actualSubscription.plan_name,
            ) ?? "STARTER",
          );

          setSelectedBillingCycle(
            actualSubscription.billing_cycle,
          );
        } else {
          setSelectedPlan(
            "STARTER",
          );

          setSelectedBillingCycle(
            "MONTHLY",
          );
        }

        /*
         * IMPORTANT:
         *
         * get_my_pms_unit_count() returns INTEGER.
         * It does NOT return { unit_count, max_units }.
         */
        const used =
          numberValue(
            unitCountResult.data,
          );

        const max =
          actualSubscription
            ?.max_listings ??
          null;

        setUsage({
          used,

          limit: max,

          remaining:
            max === null
              ? null
              : Math.max(
                  0,
                  max - used,
                ),
        });

        const rawListings =
          rows(
            listingsResult.data,
          )
            .map(
              normalizeListing,
            )
            .filter(
              (
                listing,
              ): listing is PMSListing =>
                listing !== null,
            );

        const rawAvailable =
          rows(
            availableListingsResult.data,
          )
            .map(
              normalizeListing,
            )
            .filter(
              (
                listing,
              ): listing is PMSListing =>
                listing !== null,
            );

        const [
          enrichedListings,
          enrichedAvailable,
        ] =
          await Promise.all([
            enrichListings(
              rawListings,
            ),

            enrichListings(
              rawAvailable,
            ),
          ]);

        setListings(
          enrichedListings,
        );

        setAvailableListings(
          enrichedAvailable,
        );
      },
      [enrichListings],
    );

  /* ==========================================================
   * LOAD REAL ESTATE PMS
   * ========================================================== */

  const loadRealEstatePMS =
    useCallback(
      async (
        userId: string,
      ) => {
        const [
          subscriptionResult,
          entitlementResult,
        ] =
          await Promise.all([
            supabase.rpc(
              "get_current_real_estate_subscription",
              {
                p_real_estate_id:
                  userId,
              },
            ),

            supabase.rpc(
              "get_real_estate_listing_entitlement",
              {
                p_real_estate_id:
                  userId,
              },
            ),
          ]);

        if (
          subscriptionResult.error
        ) {
          throw subscriptionResult.error;
        }

        if (
          entitlementResult.error
        ) {
          throw entitlementResult.error;
        }

        const rawSubscription =
          firstRow(
            subscriptionResult.data,
          );

        const actualSubscription =
          rawSubscription
            ? normalizeSubscription(
                rawSubscription,
                "real_estate",
              )
            : null;

        setSubscription(
          actualSubscription,
        );

        if (actualSubscription) {
          setSelectedBillingCycle(
            actualSubscription.billing_cycle,
          );
        }

        const entitlement =
          firstRow(
            entitlementResult.data,
          );

        if (!entitlement) {
          setUsage({
            used: 0,
            limit: null,
            remaining: null,
          });
        } else {
          const used =
            numberValue(
              entitlement.subscription_listings_used ??
                entitlement.listing_count ??
                entitlement.current_listings ??
                entitlement.used ??
                entitlement.free_listings_used,
            );

          const max =
            nullableNumber(
              entitlement.max_listings ??
                entitlement.subscription_limit ??
                entitlement.listing_limit ??
                entitlement.max_allowed,
            );

          setUsage({
            used,

            limit: max,

            remaining:
              max === null
                ? null
                : Math.max(
                    0,
                    max - used,
                  ),
          });
        }

        setListings([]);
        setAvailableListings([]);
      },
      [],
    );

  /* ==========================================================
   * LOAD EVERYTHING
   * ========================================================== */

  const loadSubscription =
    useCallback(
      async () => {
        try {
          setError(null);

          const profile =
            await loadProfile();

          setRole(
            profile.role,
          );

          if (
            profile.role ===
            "landlord"
          ) {
            await loadLandlordPMS();
          } else {
            await loadRealEstatePMS(
              profile.id,
            );
          }
        } catch (err) {
          debugError(
            "Failed to load PMS",
            err,
          );

          setSubscription(null);

          setUsage({
            used: 0,
            limit: null,
            remaining: null,
          });

          setListings([]);
          setAvailableListings([]);

          setError(
            err instanceof Error
              ? err.message
              : "Unable to load your PMS subscription.",
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [
        loadProfile,
        loadLandlordPMS,
        loadRealEstatePMS,
      ],
    );

  /* ==========================================================
   * INITIAL LOAD
   * ========================================================== */

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  /* ==========================================================
   * REFRESH
   * ========================================================== */

  const handleRefresh =
    useCallback(
      async () => {
        if (refreshing) {
          return;
        }

        setRefreshing(true);

        await loadSubscription();
      },
      [
        refreshing,
        loadSubscription,
      ],
    );

  /* ==========================================================
   * PAYMENT
   * ========================================================== */

  const handleProceedToPayment =
    useCallback(
      async () => {
        if (role !== "landlord") {
          setActionError(
            "PMS subscription checkout is available for landlord accounts.",
          );

          return;
        }

        const plan =
          PMS_PLANS.find(
            (item) =>
              item.name ===
              selectedPlan,
          );

        if (!plan) {
          setActionError(
            "The selected PMS plan could not be found.",
          );

          return;
        }

        try {
          setPaymentLoading(true);
          setActionError(null);
          setPaymentMessage(null);

          const result =
            await initiatePMSPayment({
              plan_id:
                plan.id,

              billing_cycle:
                selectedBillingCycle,
            });

          debug(
            "PMS payment initiated",
            result,
          );

          setPaymentMessage(
            result.customer_message ||
              result.message ||
              `M-Pesa payment request sent for ${plan.name}. Check your phone and complete the payment.`,
          );

          /*
           * The subscription should only become ACTIVE
           * after the payment callback/finalizer succeeds.
           *
           * Do not activate it locally.
           */
          await loadSubscription();
        } catch (err) {
          debugError(
            "PMS payment initiation failed",
            err,
          );

          setActionError(
            err instanceof Error
              ? err.message
              : "Unable to initiate PMS payment.",
          );
        } finally {
          setPaymentLoading(false);
        }
      },
      [
        role,
        selectedPlan,
        selectedBillingCycle,
        loadSubscription,
      ],
    );

  /* ==========================================================
   * ADD PROPERTY
   * ========================================================== */

  const handleAddToPMS =
    useCallback(
      async (
        listingId: string,
      ) => {
        if (
          role !== "landlord"
        ) {
          setActionError(
            "Property management actions are only available to landlord PMS accounts.",
          );

          return;
        }

        if (!subscription?.id) {
          setActionError(
            "No PMS subscription found.",
          );

          return;
        }

        if (
          subscription.status !==
            "ACTIVE" &&
          subscription.status !==
            "GRACE_PERIOD"
        ) {
          setActionError(
            "Your PMS subscription is not active. Renew your subscription before adding properties.",
          );

          return;
        }

        if (
          usage.limit !==
            null &&
          usage.used >=
            usage.limit
        ) {
          setActionError(
            "You have reached your PMS property limit. Upgrade your plan to add another property.",
          );

          return;
        }

        try {
          setProcessingListingId(
            listingId,
          );

          setActionError(null);

          const result =
            await supabase.rpc(
              "add_listing_to_pms",
              {
                p_subscription_id:
                  subscription.id,

                p_listing_id:
                  listingId,
              },
            );

          if (result.error) {
            throw result.error;
          }

          await loadSubscription();
        } catch (err) {
          debugError(
            "Failed to add listing to PMS",
            err,
          );

          setActionError(
            err instanceof Error
              ? err.message
              : "Unable to add property to PMS.",
          );
        } finally {
          setProcessingListingId(
            null,
          );
        }
      },
      [
        role,
        subscription,
        usage,
        loadSubscription,
      ],
    );

  /* ==========================================================
   * REMOVE PROPERTY
   * ========================================================== */

  const handleRemoveFromPMS =
    useCallback(
      async (
        listingId: string,
      ) => {
        if (
          role !== "landlord"
        ) {
          setActionError(
            "Property management actions are only available to landlord PMS accounts.",
          );

          return;
        }

        if (!subscription?.id) {
          setActionError(
            "No PMS subscription found.",
          );

          return;
        }

        const confirmed =
          window.confirm(
            "Remove this property from PMS management?",
          );

        if (!confirmed) {
          return;
        }

        try {
          setProcessingListingId(
            listingId,
          );

          setActionError(null);

          const result =
            await supabase.rpc(
              "remove_listing_from_pms",
              {
                p_subscription_id:
                  subscription.id,

                p_listing_id:
                  listingId,
              },
            );

          if (result.error) {
            throw result.error;
          }

          await loadSubscription();
        } catch (err) {
          debugError(
            "Failed to remove listing from PMS",
            err,
          );

          setActionError(
            err instanceof Error
              ? err.message
              : "Unable to remove property from PMS.",
          );
        } finally {
          setProcessingListingId(
            null,
          );
        }
      },
      [
        role,
        subscription,
        loadSubscription,
      ],
    );

  /* ==========================================================
   * DERIVED VALUES
   * ========================================================== */

  const maxListings =
    usage.limit;

  const usedListings =
    usage.used;

  const remainingListings =
    usage.remaining;

  const usagePercentage =
    maxListings === null
      ? null
      : maxListings > 0
        ? Math.min(
            100,
            (usedListings /
              maxListings) *
              100,
          )
        : 100;

  const canManageProperties =
    role === "landlord" &&
    (
      subscription?.status ===
        "ACTIVE" ||
      subscription?.status ===
        "GRACE_PERIOD"
    );

  const limitReached =
    maxListings !== null &&
    usedListings >=
      maxListings;

  const currentPlanName =
    normalizePlanName(
      subscription?.plan_name,
    );

  const selectedPlanObject =
    useMemo(
      () =>
        PMS_PLANS.find(
          (plan) =>
            plan.name ===
            selectedPlan,
        ) ?? null,
      [selectedPlan],
    );

  const planDescription =
    useMemo(() => {
      if (!subscription) {
        return "";
      }

      if (
        role ===
        "real_estate"
      ) {
        switch (
          subscription.plan_name.toUpperCase()
        ) {
          case "STARTER":
            return "For real estate professionals starting with a growing listing portfolio.";

          case "GROWTH":
            return "For established real estate professionals managing a larger listing portfolio.";

          case "PRO":
            return "For professional real estate businesses managing a large listing portfolio.";

          case "ENTERPRISE":
            return "For larger real estate businesses requiring extensive listing capacity.";

          default:
            return "Your current SakaHao real estate subscription.";
        }
      }

      switch (
        subscription.plan_name.toUpperCase()
      ) {
        case "STARTER":
          return "For landlords starting with a small property portfolio.";

        case "GROWTH":
          return "For growing landlords managing more properties.";

        case "PRO":
          return "For professional landlords with larger portfolios.";

        default:
          return "Your current Saka Crib PMS subscription.";
      }
    }, [
      subscription,
      role,
    ]);

  /* ==========================================================
   * LOADING
   * ========================================================== */

  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-7 w-64 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="mt-2 h-4 w-96 max-w-full rounded bg-gray-200 dark:bg-gray-800" />
            </div>

            <div className="h-10 w-24 rounded-lg bg-gray-200 dark:bg-gray-800" />
          </div>

          <div className="card h-56" />
          <div className="card h-40" />
          <div className="card h-56" />
        </div>
      </section>
    );
  }

  /* ==========================================================
   * LOAD ERROR
   * ========================================================== */

  if (error) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="card overflow-hidden border-red-200 dark:border-red-900">
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/30">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              PMS Subscription Error
            </p>
          </div>

          <div className="p-6">
            <p className="font-semibold text-gray-900 dark:text-white">
              Unable to load PMS
            </p>

            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {error}
            </p>

            <button
              type="button"
              onClick={() => {
                void handleRefresh();
              }}
              disabled={refreshing}
              className="btn-secondary mt-5"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}

              Try Again
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!role) {
    return null;
  }

  /* ==========================================================
   * NO SUBSCRIPTION
   * ========================================================== */

  if (!subscription) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          role={role}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />

        {actionError && (
          <ActionError
            message={actionError}
            onDismiss={() =>
              setActionError(null)
            }
          />
        )}

        {paymentMessage && (
          <PaymentMessage
            message={paymentMessage}
            onDismiss={() =>
              setPaymentMessage(null)
            }
          />
        )}

        <div className="card overflow-hidden">
          <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-4 py-3 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
              <Crown className="h-4 w-4" />

              {role === "landlord"
                ? "Landlord PMS Subscription"
                : "Real Estate Subscription"}
            </p>
          </div>

          <div className="p-6">
            <div className="mb-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                <Building2 className="h-7 w-7" />
              </div>

              <h2 className="mt-5 text-xl font-bold text-gray-900 dark:text-white">
                Choose your{" "}
                {role === "landlord"
                  ? "PMS"
                  : "subscription"}{" "}
                plan
              </h2>

              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                Select the plan that best
                matches your{" "}
                {role === "landlord"
                  ? "property portfolio"
                  : "real estate listing portfolio"}
                .
              </p>
            </div>

            {role === "landlord" ? (
              <>
                <PMSPlanSelector
                  selectedPlan={
                    selectedPlan
                  }
                  billingCycle={
                    selectedBillingCycle
                  }
                  onPlanChange={
                    setSelectedPlan
                  }
                  onBillingCycleChange={
                    setSelectedBillingCycle
                  }
                  disabled={
                    paymentLoading
                  }
                />

                <PlanCheckoutBar
                  plan={
                    selectedPlanObject
                  }
                  billingCycle={
                    selectedBillingCycle
                  }
                  loading={
                    paymentLoading
                  }
                  onCheckout={() => {
                    void handleProceedToPayment();
                  }}
                />
              </>
            ) : (
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-5 text-center dark:border-brand-800 dark:bg-brand-950/20">
                <p className="text-sm text-brand-700 dark:text-brand-300">
                  No active real estate
                  subscription was returned
                  by the subscription service.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  /* ==========================================================
   * MAIN DASHBOARD
   * ========================================================== */

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        role={role}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />

      {actionError && (
        <ActionError
          message={actionError}
          onDismiss={() =>
            setActionError(null)
          }
        />
      )}

      {paymentMessage && (
        <PaymentMessage
          message={paymentMessage}
          onDismiss={() =>
            setPaymentMessage(null)
          }
        />
      )}

      {/* ======================================================
       * STATUS
       * ====================================================== */}

      {subscription.status ===
        "PENDING_PAYMENT" && (
        <StatusNotice
          icon={
            <Clock3 className="h-4 w-4" />
          }
          title="Payment Pending"
          heading="Complete your PMS payment"
          description="Complete the payment request sent to your phone. The subscription will only become active after the payment callback succeeds."
          tone="amber"
        />
      )}

      {subscription.status ===
        "PAST_DUE" && (
        <StatusNotice
          icon={
            <ShieldAlert className="h-4 w-4" />
          }
          title="Payment Past Due"
          heading="Your subscription payment is past due"
          description="Complete payment to keep your subscription active."
          tone="amber"
        />
      )}

      {subscription.status ===
        "GRACE_PERIOD" && (
        <StatusNotice
          icon={
            <Clock3 className="h-4 w-4" />
          }
          title="Grace Period"
          heading="Your subscription is in the grace period"
          description={`Renew before ${
            subscription.grace_period_end
              ? formatDate(
                  subscription.grace_period_end,
                )
              : "the grace period ends"
          } to maintain PMS access.`}
          tone="amber"
        />
      )}

      {subscription.status ===
        "EXPIRED" && (
        <StatusNotice
          icon={
            <ShieldAlert className="h-4 w-4" />
          }
          title="Subscription Expired"
          heading="Your subscription has expired"
          description="Select a plan below to start a new PMS subscription."
          tone="red"
        />
      )}

      {subscription.status ===
        "CANCELLED" && (
        <StatusNotice
          icon={
            <ShieldAlert className="h-4 w-4" />
          }
          title="Subscription Cancelled"
          heading="Your subscription has been cancelled"
          description="Select a plan below if you want to start a new PMS subscription."
          tone="gray"
        />
      )}

      {/* ======================================================
       * CURRENT SUBSCRIPTION
       * ====================================================== */}

      <div className="card mb-6 overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-4 py-3 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
            <Crown className="h-4 w-4" />

            Current{" "}
            {role === "landlord"
              ? "PMS"
              : "Real Estate"}{" "}
            Subscription
          </p>
        </div>

        <div className="p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                <Crown className="h-7 w-7" />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {subscription.plan_name}
                  </h2>

                  <SubscriptionStatus
                    status={
                      subscription.status
                    }
                  />
                </div>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {planDescription}
                </p>

                <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Billed{" "}
                  {subscription.billing_cycle ===
                  "MONTHLY"
                    ? "monthly"
                    : "annually"}
                </p>
              </div>
            </div>
          </div>

          {/* ==================================================
           * LANDLORD PLAN SELECTOR
           * ================================================== */}

          {role ===
            "landlord" && (
            <div className="mt-6 border-t border-gray-200 pt-6 dark:border-gray-800">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Available PMS Plans
                </h3>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Select a plan and billing
                  cycle to upgrade, renew,
                  or change your PMS
                  subscription.
                </p>
              </div>

              <PMSPlanSelector
                selectedPlan={
                  selectedPlan
                }
                billingCycle={
                  selectedBillingCycle
                }
                currentPlan={
                  currentPlanName
                }
                currentBillingCycle={
                  subscription.billing_cycle
                }
                onPlanChange={
                  setSelectedPlan
                }
                onBillingCycleChange={
                  setSelectedBillingCycle
                }
                disabled={
                  paymentLoading
                }
              />

              {(
                selectedPlan !==
                  currentPlanName ||
                selectedBillingCycle !==
                  subscription.billing_cycle
              ) && (
                <PlanCheckoutBar
                  plan={
                    selectedPlanObject
                  }
                  billingCycle={
                    selectedBillingCycle
                  }
                  loading={
                    paymentLoading
                  }
                  onCheckout={() => {
                    void handleProceedToPayment();
                  }}
                  label="Continue to Payment"
                />
              )}

              {selectedPlan ===
                currentPlanName &&
                selectedBillingCycle ===
                  subscription.billing_cycle && (
                <div className="mt-5 rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-800 dark:bg-success-950/20">
                  <p className="flex items-center gap-2 text-sm font-semibold text-success-700 dark:text-success-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Current plan selected
                  </p>
                </div>
              )}
            </div>
          )}

          {role ===
            "real_estate" && (
            <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/20">
              <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">
                Real estate subscription
              </p>

              <p className="mt-1 text-sm text-brand-600 dark:text-brand-400">
                Real estate subscriptions
                use the separate REAL_ESTATE
                audience and entitlement
                system.
              </p>
            </div>
          )}

          {/* ==================================================
           * DETAILS
           * ================================================== */}

          <div className="mt-6 grid gap-4 border-t border-gray-200 pt-6 dark:border-gray-800 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem
              icon={
                <CalendarDays className="h-4 w-4" />
              }
              label="Period started"
              value={formatDate(
                subscription.current_period_start,
              )}
            />

            <InfoItem
              icon={
                <CalendarDays className="h-4 w-4" />
              }
              label="Period ends"
              value={formatDate(
                subscription.current_period_end,
              )}
            />

            <InfoItem
              label={
                role === "landlord"
                  ? "Property limit"
                  : "Listing limit"
              }
              value={
                subscription.max_listings ===
                null
                  ? "Unlimited"
                  : `${subscription.max_listings} ${
                      role === "landlord"
                        ? "properties"
                        : "listings"
                    }`
              }
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
      </div>

      {/* ======================================================
       * USAGE
       * ====================================================== */}

      <div className="card mb-6 overflow-hidden">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {role === "landlord"
                  ? "PMS Property Usage"
                  : "Listing Usage"}
              </p>

              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {role === "landlord"
                  ? "Properties currently managed by PMS."
                  : "Listings counted against your real estate entitlement."}
              </p>
            </div>

            <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200">
              {usedListings}
              {maxListings ===
              null
                ? " / Unlimited"
                : ` / ${maxListings}`}
            </span>
          </div>
        </div>

        <div className="p-6">
          {usagePercentage !==
            null && (
            <>
              <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    usagePercentage >=
                    100
                      ? "bg-red-500"
                      : usagePercentage >=
                        80
                      ? "bg-amber-500"
                      : "bg-success-500"
                  }`}
                  style={{
                    width: `${usagePercentage}%`,
                  }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>
                  {remainingListings ??
                    0}{" "}
                  {remainingListings ===
                  1
                    ? role ===
                      "landlord"
                      ? "property"
                      : "listing"
                    : role ===
                      "landlord"
                    ? "properties"
                    : "listings"}{" "}
                  remaining
                </span>

                <span>
                  {Math.round(
                    usagePercentage,
                  )}
                  %
                </span>
              </div>
            </>
          )}

          {maxListings ===
            null && (
            <div className="flex items-center gap-2 rounded-lg bg-success-50 p-3 text-sm text-success-700 dark:bg-success-900/20 dark:text-success-400">
              <CheckCircle2 className="h-4 w-4" />

              <span>
                Unlimited{" "}
                {role === "landlord"
                  ? "PMS properties"
                  : "listings"}{" "}
                available.
              </span>
            </div>
          )}

          {limitReached && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />

              <span>
                You have reached your
                plan's{" "}
                {role === "landlord"
                  ? "property"
                  : "listing"}{" "}
                limit. Select a higher
                plan above to continue.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================
       * LANDLORD PMS PROPERTIES
       * ====================================================== */}

      {role ===
        "landlord" &&
        canManageProperties && (
          <>
            <div className="card mb-6 overflow-hidden">
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                      Managed Properties
                    </h2>

                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {listings.length}{" "}
                      {listings.length ===
                      1
                        ? "property"
                        : "properties"}{" "}
                      currently managed by PMS.
                    </p>
                  </div>

                  <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Active
                  </span>
                </div>
              </div>

              {listings.length ===
              0 ? (
                <EmptyProperties
                  title="No PMS properties yet"
                  description="Add one of your existing eligible listings to PMS to start managing it."
                />
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {listings.map(
                    (listing) => (
                      <PropertyRow
                        key={
                          listing.id
                        }
                        listing={
                          listing
                        }
                        processing={
                          processingListingId ===
                          listing.id
                        }
                        action="remove"
                        onAction={() => {
                          void handleRemoveFromPMS(
                            listing.id,
                          );
                        }}
                      />
                    ),
                  )}
                </div>
              )}
            </div>

            <div className="card mb-6 overflow-hidden">
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Add Properties to PMS
                </h2>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {availableListings.length}{" "}
                  eligible{" "}
                  {availableListings.length ===
                  1
                    ? "listing is"
                    : "listings are"}{" "}
                  available to add.
                </p>
              </div>

              {availableListings.length ===
              0 ? (
                <EmptyProperties
                  title="No eligible properties"
                  description="All eligible listings are already managed by PMS, or you don't have any eligible listings yet."
                />
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {availableListings.map(
                    (listing) => (
                      <PropertyRow
                        key={
                          listing.id
                        }
                        listing={
                          listing
                        }
                        processing={
                          processingListingId ===
                          listing.id
                        }
                        action="add"
                        disabled={
                          limitReached
                        }
                        onAction={() => {
                          void handleAddToPMS(
                            listing.id,
                          );
                        }}
                      />
                    ),
                  )}
                </div>
              )}

              {limitReached && (
                <div className="border-t border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-400">
                  Your{" "}
                  <strong>
                    {
                      subscription.plan_name
                    }
                  </strong>{" "}
                  plan has reached its
                  property limit. Select a
                  higher plan above to
                  continue.
                </div>
              )}
            </div>
          </>
        )}

      {/* ======================================================
       * REAL ESTATE
       * ====================================================== */}

      {role ===
        "real_estate" && (
        <div className="card mb-6 overflow-hidden">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <Building2 className="h-4 w-4 text-brand-600" />
              Real Estate Listing Entitlement
            </p>
          </div>

          <div className="p-5">
            <p className="text-sm leading-6 text-gray-600 dark:text-gray-400">
              Your listing allowance is
              determined by your real estate
              subscription. Real estate
              subscriptions remain completely
              separate from landlord PMS
              subscriptions.
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            void handleRefresh();
          }}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}

          Refresh
        </button>
      </div>
    </section>
  );
}

/* ============================================================
 * PAGE HEADER
 * ============================================================ */

function PageHeader({
  role,
  refreshing,
  onRefresh,
}: {
  role: PMSRole;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Building2 className="h-6 w-6 text-brand-600" />

          Property Management
        </h1>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {role === "landlord"
            ? "Manage your PMS subscription, property usage, and managed properties."
            : "Manage your real estate subscription and listing entitlement."}
        </p>
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="btn-secondary"
      >
        {refreshing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}

        Refresh
      </button>
    </div>
  );
}

/* ============================================================
 * CHECKOUT BAR
 * ============================================================ */

function PlanCheckoutBar({
  plan,
  billingCycle,
  loading,
  onCheckout,
  label = "Pay with M-Pesa",
}: {
  plan: PMSPlan | null;
  billingCycle: PMSBillingCycle;
  loading: boolean;
  onCheckout: () => void;
  label?: string;
}) {
  if (!plan) {
    return null;
  }

  const amount =
    billingCycle ===
    "MONTHLY"
      ? plan.monthlyPrice
      : plan.annualPrice;

  return (
    <div className="mt-6 flex flex-col gap-4 rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/20 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">
          {plan.name} —{" "}
          {billingCycle ===
          "MONTHLY"
            ? "Monthly"
            : "Annual"}{" "}
          billing
        </p>

        <p className="mt-1 text-sm text-brand-600 dark:text-brand-400">
          KES{" "}
          {amount.toLocaleString(
            "en-KE",
          )}{" "}
          per{" "}
          {billingCycle ===
          "MONTHLY"
            ? "month"
            : "year"}
        </p>
      </div>

      <button
        type="button"
        onClick={onCheckout}
        disabled={loading}
        className="btn-primary shrink-0"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending Payment...
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" />
            {label}
          </>
        )}
      </button>
    </div>
  );
}

/* ============================================================
 * ACTION ERROR
 * ============================================================ */

function ActionError({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="card mb-6 overflow-hidden border-red-200 dark:border-red-900">
      <div className="border-b border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/30">
        <p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          PMS Action Failed
        </p>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-red-700 dark:text-red-400">
          {message}
        </p>

        <button
          type="button"
          onClick={onDismiss}
          className="btn-secondary shrink-0"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * PAYMENT MESSAGE
 * ============================================================ */

function PaymentMessage({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="card mb-6 overflow-hidden border-success-200 dark:border-success-800">
      <div className="border-b border-success-200 bg-success-50 px-4 py-3 dark:border-success-800 dark:bg-success-950/20">
        <p className="flex items-center gap-2 text-sm font-semibold text-success-700 dark:text-success-400">
          <CheckCircle2 className="h-4 w-4" />
          Payment Request Sent
        </p>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-success-700 dark:text-success-400">
          {message}
        </p>

        <button
          type="button"
          onClick={onDismiss}
          className="btn-secondary shrink-0"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * STATUS NOTICE
 * ============================================================ */

function StatusNotice({
  icon,
  title,
  heading,
  description,
  tone,
}: {
  icon: ReactNode;
  title: string;
  heading: string;
  description: string;
  tone:
    | "amber"
    | "red"
    | "gray";
}) {
  const styles = {
    amber: {
      wrapper:
        "border-amber-200 dark:border-amber-900",
      header:
        "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
      text:
        "text-amber-700 dark:text-amber-400",
    },

    red: {
      wrapper:
        "border-red-200 dark:border-red-900",
      header:
        "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
      text:
        "text-red-700 dark:text-red-400",
    },

    gray: {
      wrapper:
        "border-gray-200 dark:border-gray-800",
      header:
        "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50",
      text:
        "text-gray-700 dark:text-gray-300",
    },
  }[tone];

  return (
    <div
      className={`card mb-6 overflow-hidden ${styles.wrapper}`}
    >
      <div
        className={`border-b px-4 py-3 ${styles.header}`}
      >
        <p
          className={`flex items-center gap-2 text-sm font-semibold ${styles.text}`}
        >
          {icon}
          {title}
        </p>
      </div>

      <div className="p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white">
          {heading}
        </h2>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>
      </div>
    </div>
  );
}

/* ============================================================
 * SUBSCRIPTION STATUS
 * ============================================================ */

function SubscriptionStatus({
  status,
}: {
  status: PMSSubscriptionStatus;
}) {
  const labels: Record<
    PMSSubscriptionStatus,
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

    PAST_DUE:
      "Payment Past Due",
  };

  const classes: Record<
    PMSSubscriptionStatus,
    string
  > = {
    PENDING_PAYMENT:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400",

    ACTIVE:
      "border-success-200 bg-success-50 text-success-700 dark:border-success-800 dark:bg-success-900/20 dark:text-success-400",

    GRACE_PERIOD:
      "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-400",

    EXPIRED:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400",

    CANCELLED:
      "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400",

    PAST_DUE:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400",
  };

  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${classes[status]}`}
    >
      {labels[status]}
    </span>
  );
}

/* ============================================================
 * INFO ITEM
 * ============================================================ */

function InfoItem({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-900/50">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {icon}
        {label}
      </p>

      <p className="mt-1.5 font-semibold text-gray-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

/* ============================================================
 * PROPERTY ROW
 * ============================================================ */

function PropertyRow({
  listing,
  processing,
  action,
  disabled = false,
  onAction,
}: {
  listing: PMSListing;
  processing: boolean;

  action:
    | "add"
    | "remove";

  disabled?: boolean;

  onAction: () => void;
}) {
  const location =
    listing.county
      ? `${listing.city}, ${listing.county}`
      : listing.city;

  return (
    <div className="flex flex-col gap-4 p-5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/40 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h3 className="truncate font-semibold text-gray-900 dark:text-white">
          {listing.title}
        </h3>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {location}
        </p>

        <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          KES{" "}
          {Number(
            listing.price_kes,
          ).toLocaleString(
            "en-KE",
          )}
        </p>

        {listing.admin_review_note && (
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
            <span className="font-semibold">
              Admin note:
            </span>{" "}
            {listing.admin_review_note}
          </div>
        )}

        {listing.approval_status && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Approval status:{" "}
            <span className="font-medium">
              {
                listing.approval_status
              }
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {action ===
          "remove" && (
          <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
            <CheckCircle2 className="h-3 w-3" />
            PMS Managed
          </span>
        )}

        <button
          type="button"
          className={
            action ===
            "remove"
              ? "btn-secondary"
              : "btn-primary"
          }
          disabled={
            processing ||
            disabled
          }
          onClick={
            onAction
          }
        >
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />

              {action ===
              "remove"
                ? "Removing..."
                : "Adding..."}
            </>
          ) : (
            <>
              {action ===
              "remove"
                ? "Remove"
                : "Add to PMS"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * EMPTY PROPERTIES
 * ============================================================ */

function EmptyProperties({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        <Building2 className="h-6 w-6" />
      </div>

      <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
        {title}
      </h3>

      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
        {description}
      </p>
    </div>
  );
}

/* ============================================================
 * DATE FORMATTER
 * ============================================================ */

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-KE",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}