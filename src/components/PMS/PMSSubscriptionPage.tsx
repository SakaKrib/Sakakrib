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

import { djangoPmsGateway } from "@/lib/djangoPmsGateway";
import { protectedGet } from '@/lib/djangoLegacyApi';
import { useNav } from "@/context/NavContext";

import PMSPlanSelector, {
  type PMSBillingCycle,
  type PMSPlanName,
  type PMSSubscriptionPlan,
} from "./PMSPlanSelector";
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

  /*
   * IMPORTANT:
   *
   * This is the number of properties/listings allowed by the
   * subscription. It is NOT the number of units inside one
   * property.
   */
  max_listings: number | null;

  /*
   * Optional future/property-level unit entitlement.
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

function firstRow(data: unknown): RPCRow | null {
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

function rows(data: unknown): RPCRow[] {
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
      debug(
        "Unknown subscription status; defaulting to EXPIRED",
        value,
      );

      return "EXPIRED";
  }
}

/* ============================================================
 * LISTING NORMALIZATION
 * ============================================================ */

function normalizeListing(row: RPCRow): PMSListing | null {
  const id = stringValue(
    row.id ??
      row.listing_id ??
      row.property_id,
  );

  if (!id) {
    debug("Ignoring listing row without an ID", row);
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
      ) || "Unknown county",

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
      nullableString(row.status) ?? undefined,

    activated_at:
      nullableString(row.activated_at) ?? undefined,

    deactivated_at:
      nullableString(row.deactivated_at),

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
        : booleanValue(row.is_approved),

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
  debug(
    `Normalizing ${role} subscription`,
    row,
  );

  /*
   * Live RPCs may return subscription_id rather than id.
   *
   * Support both.
   */
  const id = stringValue(
    row.id ??
      row.subscription_id,
  );

  if (!id) {
    debugError(
      "Subscription row has neither id nor subscription_id",
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

  const maxListings =
    nullableNumber(
      row.max_listings ??
        row.max_properties ??
        row.listing_limit ??
        row.subscription_limit ??
        row.max_allowed,
    );

  const maxUnitsPerListing =
    nullableNumber(
      row.max_units_per_listing ??
        row.units_per_listing ??
        row.max_units,
    );

  const normalized: PMSSubscription = {
    id,

    owner_id: ownerId,

    role,

    plan_id: stringValue(
      row.plan_id,
    ),

    plan_name: planName,

    max_listings:
      maxListings,

    max_units_per_listing:
      maxUnitsPerListing,

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
      row.cancel_at_period_end ===
      undefined
        ? false
        : booleanValue(
            row.cancel_at_period_end,
          ),

    cancelled_at:
      nullableString(
        row.cancelled_at,
      ),
  };

  debug(
    `Normalized ${role} subscription`,
    normalized,
  );

  return normalized;
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
    useState<PMSPlanName | null>(
      null,
    );

  const [
    selectedBillingCycle,
    setSelectedBillingCycle,
  ] =
    useState<PMSBillingCycle>(
      "MONTHLY",
    );

  const [
    unitCount,
    setUnitCount,
  ] =
    useState<PMSUnitCount | null>(
      null,
    );

  const {navigate }= useNav()  

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

  const [error, setError] =
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
   * PAYMENT MODAL OPEN
   * ========================================================== */

    // Payment modal state used to live here, but PMSPlanSelector now
    // owns its own PMSCheckoutModal internally (opened by its pay
    // button regardless of what any parent wires up) - keeping a
    // second copy here would open a second, overlapping modal on the
    // same click. handleProceedToPayment below is kept only as an
    // optional informational hook.

  /* ==========================================================
   * LOAD PROFILE
   * ========================================================== */

  const loadProfile =
    useCallback(
      async (): Promise<PMSProfile> => {
        debug(
          "Loading authenticated user",
        );

        const {
          data: { user },
          error: userError,
        } =
          await djangoPmsGateway.auth.getUser();

        if (userError) {
          debugError(
            "djangoPmsGateway.auth.getUser failed",
            userError,
          );

          throw userError;
        }

        if (!user) {
          throw new Error(
            "You must be signed in to access PMS.",
          );
        }

        const profiles = await protectedGet<any[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role`);
        const profile = Array.isArray(profiles) ? profiles[0] ?? null : profiles;
        if (!profile) throw new Error('Profile not found');

        debug(
          "Profile returned",
          profile,
        );

        const profileRole =
          String(
            profile?.role ?? "",
          )
            .trim()
            .toLowerCase();

        if (
          profileRole !==
            "landlord" &&
          profileRole !==
            "real_estate"
        ) {
          throw new Error(
            "PMS subscriptions are available only to landlord and real estate accounts.",
          );
        }

        return {
          id: user.id,
          role:
            normalizeRole(
              profileRole,
            ),
        };
      },
      [],
    );

  /* ==========================================================
   * LOAD LANDLORD PMS DATA
   * ========================================================== */

  const loadLandlordPMS =
    useCallback(
      async () => {
        debug(
          "Loading landlord PMS RPCs",
        );

        const [
          subscriptionResult,
          unitCountResult,
          listingsResult,
          availableListingsResult,
        ] =
          await Promise.all([
            djangoPmsGateway.rpc(
              "get_my_pms_subscription",
            ),

            djangoPmsGateway.rpc(
              "get_my_pms_unit_count",
            ),

            djangoPmsGateway.rpc(
              "get_my_pms_listings",
            ),

            djangoPmsGateway.rpc(
              "get_my_available_pms_listings",
            ),
          ]);

        debug(
          "get_my_pms_subscription response",
          subscriptionResult,
        );

        debug(
          "get_my_pms_unit_count response",
          unitCountResult,
        );

        debug(
          "get_my_pms_listings response",
          listingsResult,
        );

        debug(
          "get_my_available_pms_listings response",
          availableListingsResult,
        );

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

        const rawSubscription =
          firstRow(
            subscriptionResult.data,
          );

        const normalizedSubscription =
          rawSubscription
            ? normalizeSubscription(
                rawSubscription,
                "landlord",
              )
            : null;

        setSubscription(
          normalizedSubscription,
        );

        if (
          normalizedSubscription
        ) {
          setSelectedBillingCycle(
            normalizedSubscription.billing_cycle,
          );

          setSelectedPlan(
            normalizePlanName(
              normalizedSubscription.plan_name,
            ),
          );
        } else {
          setSelectedBillingCycle(
            "MONTHLY",
          );

          setSelectedPlan(
            null,
          );
        }

        /*
         * The landlord unit-count RPC may return an integer.
         */
        const parsedUnitCount =
          numberValue(
            unitCountResult.data,
          );

        /*
         * The PMS property/listing entitlement comes from
         * max_listings.
         */
        const maxListings =
          normalizedSubscription
            ?.max_listings ??
          null;

        const normalizedUnitCount: PMSUnitCount =
          {
            unit_count:
              parsedUnitCount,

            max_units:
              maxListings,

            remaining_units:
              maxListings === null
                ? null
                : Math.max(
                    0,
                    maxListings -
                      parsedUnitCount,
                  ),
          };

        setUnitCount(
          normalizedUnitCount,
        );

        const normalizedListings =
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

        setListings(
          normalizedListings,
        );

        const normalizedAvailableListings =
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

        setAvailableListings(
          normalizedAvailableListings,
        );
      },
      [],
    );

  /* ==========================================================
   * LOAD REAL ESTATE DATA
   * ========================================================== */

  const loadRealEstatePMS =
    useCallback(
      async (
        userId: string,
      ) => {
        debug(
          "Loading real-estate PMS data",
          { userId },
        );

        const [
          subscriptionResult,
          entitlementResult,
        ] =
          await Promise.all([
            djangoPmsGateway.rpc(
              "get_current_real_estate_subscription",
            ),

            djangoPmsGateway.rpc(
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

        const normalizedSubscription =
          rawSubscription
            ? normalizeSubscription(
                rawSubscription,
                "real_estate",
              )
            : null;

        setSubscription(
          normalizedSubscription,
        );

        setSelectedBillingCycle(
          normalizedSubscription
            ?.billing_cycle ??
            "MONTHLY",
        );

        /*
         * The landlord selector must not be used for real-estate
         * subscriptions.
         */
        setSelectedPlan(null);

        /*
         * Real-estate entitlement is JSONB.
         */
        const entitlement =
          firstRow(
            entitlementResult.data,
          );

        debug(
          "Real-estate entitlement",
          entitlement,
        );

        if (!entitlement) {
          setUnitCount(null);
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

          setUnitCount({
            unit_count: used,

            max_units: max,

            remaining_units:
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
   * LOAD ALL PMS DATA
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
            "Failed to load PMS subscription",
            err,
          );

          setSubscription(null);
          setUnitCount(null);
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

        if (
          !subscription?.id
        ) {
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

        const used =
          Number(
            unitCount?.unit_count ??
              listings.length,
          );

        const max =
          unitCount?.max_units ??
          subscription.max_listings ??
          null;

        if (
          max !== null &&
          used >= max
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
            await djangoPmsGateway.rpc(
              "add_listing_to_pms",
              {
                p_subscription_id:
                  subscription.id,

                p_listing_id:
                  listingId,
              },
            );

          debug(
            "add_listing_to_pms response",
            result,
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
          setProcessingListingId(null);
        }
      },
      [
        role,
        subscription,
        unitCount,
        listings.length,
        loadSubscription,
      ],
    );

    const handleGoToDashboard = () => {
      navigate("pms-dashboard");
    };
    

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

        if (
          !subscription?.id
        ) {
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
            await djangoPmsGateway.rpc(
              "remove_listing_from_pms",
              {
                p_subscription_id:
                  subscription.id,

                p_listing_id:
                  listingId,
              },
            );

          debug(
            "remove_listing_from_pms response",
            result,
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
          setProcessingListingId(null);
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

  const usedUnits = Number(
    unitCount?.unit_count ??
      listings.length ??
      0,
  );

  const maxUnits =
    unitCount?.max_units ??
    subscription?.max_listings ??
    null;

  const remainingUnits =
    unitCount?.remaining_units ??
    (maxUnits === null
      ? null
      : Math.max(
          0,
          maxUnits -
            usedUnits,
        ));

  const usagePercentage =
    maxUnits === null
      ? null
      : maxUnits > 0
        ? Math.min(
            100,
            (usedUnits /
              maxUnits) *
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
    maxUnits !== null &&
    usedUnits >= maxUnits;

  const currentPlanName =
    normalizePlanName(
      subscription?.plan_name,
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
          subscription.plan_name
            .toUpperCase()
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
        subscription.plan_name
          .toUpperCase()
      ) {
        case "STARTER":
          return "For landlords starting with a small property portfolio.";

        case "GROWTH":
          return "For growing landlords managing more properties.";

        case "PRO":
          return "For professional landlords with larger portfolios.";

        case "ENTERPRISE":
          return "For larger property-management businesses.";

        default:
          return "Your current Saka Crib PMS subscription.";
      }
    }, [
      subscription,
      role,
    ]);

  const handleProceedToPayment = (
      plan: PMSSubscriptionPlan,
      cycle: PMSBillingCycle
    ) => {
      // Purely informational now - PMSPlanSelector opens its own
      // checkout modal regardless of this callback.
      console.log("Proceeding to payment:", {
        plan,
        cycle,
      });
    };

    

    


  /* ============================================================
 * LANDLORD PLAN SELECTOR
 * ============================================================ */

const handlePlanChange = useCallback(
  (plan: PMSSubscriptionPlan) => {
    setSelectedPlan(
      normalizePlanName(plan.name),
    );
  },
  [],
);

const landlordPlanSelector =
  role === "landlord" ? (
    <PMSPlanSelector
        role="landlord"
        selectedPlanName={
          selectedPlan ??
          currentPlanName ??
          "STARTER"
        }
        billingCycle={selectedBillingCycle}
        currentPlanName={currentPlanName}
        currentBillingCycle={
          subscription?.billing_cycle ?? null
        }
        onPlanChange={handlePlanChange}
        onBillingCycleChange={
          setSelectedBillingCycle
        }
        onProceedToPayment={handleProceedToPayment}
        onPaymentSuccess={handleRefresh}
        onGoToDashboard={handleGoToDashboard}
      />
      ) : null;

// Mirrors landlordPlanSelector exactly, just role="real_estate" -
// this was previously missing entirely, which is why real estate
// accounts had a static "use the checkout flow" message instead of
// an actual selector + pay button wired to onProceedToPayment.
const realEstatePlanSelector =
  role === "real_estate" ? (
    <PMSPlanSelector
        role="real_estate"
        selectedPlanName={
          selectedPlan ??
          currentPlanName ??
          "STARTER"
        }
        billingCycle={selectedBillingCycle}
        currentPlanName={currentPlanName}
        currentBillingCycle={
          subscription?.billing_cycle ?? null
        }
        onPlanChange={handlePlanChange}
        onBillingCycleChange={
          setSelectedBillingCycle
        }
        onProceedToPayment={handleProceedToPayment}
        onPaymentSuccess={handleRefresh}
        onGoToDashboard={handleGoToDashboard}
      />
      ) : null;


  /* ==========================================================
   * LOADING
   * ========================================================== */


  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
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
      <section className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
        <div className="card overflow-hidden border-red-200 dark:border-red-900">
          <div className="border-b border-red-200 bg-red-50 px-2 py-3 dark:border-red-900 dark:bg-red-950/30">
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

  /* ==========================================================
   * ROLE NOT READY
   * ========================================================== */

  if (!role) {
    return null;
  }

  /* ==========================================================
   * NO SUBSCRIPTION
   * ========================================================== */

  if (!subscription) {
    return (
      <section className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
              <Building2 className="h-6 w-6 text-brand-600" />

              Property Management
            </h1>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {role ===
              "landlord"
                ? "Manage your rental properties with Saka Crib PMS."
                : "Manage your real estate listing portfolio with SakaHao."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void handleRefresh();
            }}
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

        <div className="card overflow-hidden">
          <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-2 py-3 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
              <Crown className="h-4 w-4" />

              {role ===
              "landlord"
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
                {role ===
                "landlord"
                  ? "PMS"
                  : "subscription"}{" "}
                plan
              </h2>

              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                Select the plan that best
                matches your{" "}
                {role ===
                "landlord"
                  ? "property portfolio"
                  : "real estate listing portfolio"}
                .
              </p>
            </div>

            {role ===
            "landlord" ? (
              landlordPlanSelector
            ) : (
              realEstatePlanSelector
            )}

            {role ===
              "landlord" && (
              <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4 text-center dark:border-brand-800 dark:bg-brand-950/20">
                <p className="text-sm text-brand-700 dark:text-brand-300">
                  <span className="font-semibold">
                    {selectedPlan ??
                      "No plan selected"}
                  </span>{" "}
                  selected —{" "}
                  {selectedBillingCycle ===
                  "MONTHLY"
                    ? "monthly"
                    : "annual"}{" "}
                  billing.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  /* ============================================================
   * MAIN DASHBOARD
   * ============================================================ */

  return (
    <section className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
      {/* HEADER */}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Building2 className="h-6 w-6 text-brand-600" />

            Property Management
          </h1>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {role ===
            "landlord"
              ? "Manage your PMS subscription, property usage, and managed properties."
              : "Manage your real estate subscription and listing entitlement."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void handleRefresh();
          }}
          disabled={refreshing}
          className="btn-secondary"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              refreshing
                ? "animate-spin"
                : ""
            }`}
          />

          Refresh
        </button>
      </div>

      {/* ACTION ERROR */}

      {actionError && (
        <div className="card mb-6 overflow-hidden border-red-200 dark:border-red-900">
          <div className="border-b border-red-200 bg-red-50 px-2 py-3 dark:border-red-900 dark:bg-red-950/30">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />

              PMS Action Failed
            </p>
          </div>

          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-red-700 dark:text-red-400">
              {actionError}
            </p>

            <button
              type="button"
              onClick={() => {
                setActionError(null);
              }}
              className="btn-secondary shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* PENDING PAYMENT */}

      {subscription.status ===
        "PENDING_PAYMENT" && (
        <StatusNotice
          icon={
            <Clock3 className="h-4 w-4" />
          }
          title="Payment Pending"
          heading={`Complete your ${
            role === "landlord"
              ? "PMS"
              : "subscription"
          } payment`}
          description={`Complete your payment to activate your ${
            role === "landlord"
              ? "PMS management"
              : "real estate subscription"
          }.`}
          tone="amber"
        />
      )}

      {/* PAST DUE */}

      {subscription.status ===
        "PAST_DUE" && (
        <StatusNotice
          icon={
            <ShieldAlert className="h-4 w-4" />
          }
          title="Payment Past Due"
          heading="Your subscription payment is past due"
          description="Please complete payment to keep your subscription active."
          tone="amber"
        />
      )}

      {/* CURRENT SUBSCRIPTION */}

      <div className="card mb-6 overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-2 py-3 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
            <Crown className="h-4 w-4" />

            Current{" "}
            {role ===
            "landlord"
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

          {/* LANDLORD PLAN SELECTOR */}

          {role ===
            "landlord" && (
            <div className="mt-6 border-t border-gray-200 pt-6 dark:border-gray-800">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Available PMS Plans
                </h3>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Select a plan to compare
                  your current PMS subscription
                  with the available landlord
                  plans.
                </p>
              </div>

              {landlordPlanSelector}

              {selectedPlan !==
                  currentPlanName ||
              selectedBillingCycle !==
                  subscription.billing_cycle ? (
                <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/20">
                  <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">
                    New selection
                  </p>

                  <p className="mt-1 text-sm text-brand-600 dark:text-brand-400">
                    {selectedPlan ??
                      "No plan selected"}{" "}
                    —{" "}
                    {selectedBillingCycle ===
                    "MONTHLY"
                      ? "Monthly"
                      : "Annual"}{" "}
                    billing
                  </p>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-800 dark:bg-success-950/20">
                  <p className="flex items-center gap-2 text-sm font-semibold text-success-700 dark:text-success-400">
                    <CheckCircle2 className="h-4 w-4" />

                    Current plan selected
                  </p>
                </div>
              )}
            </div>
          )}

          {/* REAL ESTATE PLAN SELECTOR
              Mirrors the landlord block above exactly - previously
              this was just a static "uses the separate REAL_ESTATE
              audience" notice with no selector and no way to reach
              the pay button. */}

          {role ===
            "real_estate" && (
            <div className="mt-6 border-t border-gray-200 pt-6 dark:border-gray-800">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Available Subscription Plans
                </h3>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Select a plan to compare
                  your current subscription
                  with the available real
                  estate plans.
                </p>
              </div>

              {realEstatePlanSelector}

              {selectedPlan !==
                  currentPlanName ||
              selectedBillingCycle !==
                  subscription.billing_cycle ? (
                <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/20">
                  <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">
                    New selection
                  </p>

                  <p className="mt-1 text-sm text-brand-600 dark:text-brand-400">
                    {selectedPlan ??
                      "No plan selected"}{" "}
                    —{" "}
                    {selectedBillingCycle ===
                    "MONTHLY"
                      ? "Monthly"
                      : "Annual"}{" "}
                    billing
                  </p>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-800 dark:bg-success-950/20">
                  <p className="flex items-center gap-2 text-sm font-semibold text-success-700 dark:text-success-400">
                    <CheckCircle2 className="h-4 w-4" />

                    Current plan selected
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SUBSCRIPTION DETAILS */}

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
                role ===
                "landlord"
                  ? "Property limit"
                  : "Listing limit"
              }
              value={
                subscription.max_listings ===
                null
                  ? "Unlimited"
                  : `${subscription.max_listings} ${
                      role ===
                      "landlord"
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

      {/* GRACE PERIOD */}

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
          } to maintain access.`}
          tone="amber"
        />
      )}

      {/* EXPIRED */}

      {subscription.status ===
        "EXPIRED" && (
        <StatusNotice
          icon={
            <ShieldAlert className="h-4 w-4" />
          }
          title="Subscription Expired"
          heading="Subscription expired"
          description="Select a new plan above to review the subscription options available to your account."
          tone="red"
        />
      )}

      {/* CANCELLED */}

      {subscription.status ===
        "CANCELLED" && (
        <StatusNotice
          icon={
            <ShieldAlert className="h-4 w-4" />
          }
          title="Subscription Cancelled"
          heading="Subscription cancelled"
          description="Select a plan above to review the subscription options available to your account."
          tone="gray"
        />
      )}

      {/* USAGE */}

      <div className="card mb-6 overflow-hidden">
        <div className="border-b border-gray-200 px-2 py-3 dark:border-gray-800">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {role ===
                "landlord"
                  ? "PMS Property Usage"
                  : "Listing Usage"}
              </p>

              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {role ===
                "landlord"
                  ? "Properties currently managed by PMS."
                  : "Listings counted against your real estate subscription entitlement."}
              </p>
            </div>

            <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200">
              {usedUnits}

              {maxUnits ===
              null
                ? " / Unlimited"
                : ` / ${maxUnits}`}
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
                  {remainingUnits ??
                    0}{" "}
                  {remainingUnits ===
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

          {maxUnits ===
            null && (
            <div className="flex items-center gap-2 rounded-lg bg-success-50 p-3 text-sm text-success-700 dark:bg-success-900/20 dark:text-success-400">
              <CheckCircle2 className="h-4 w-4" />

              <span>
                Unlimited{" "}
                {role ===
                "landlord"
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
                {role ===
                "landlord"
                  ? "property"
                  : "listing"}{" "}
                limit. Select a higher
                plan above to review your
                available options.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* LANDLORD PROPERTY MANAGEMENT */}

      {role ===
        "landlord" &&
        canManageProperties && (
          <>
            {/* MANAGED PROPERTIES */}

            <div className="card mb-6 overflow-hidden">
              <div className="border-b border-gray-200 px-2 py-3 dark:border-gray-800">
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
                      currently managed by
                      PMS.
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
                  description="Add one of your existing listings to PMS to start managing it."
                />
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {listings.map(
                    (listing) => {
                      const processing =
                        processingListingId ===
                        listing.id;

                      return (
                        <PropertyRow
                          key={
                            listing.id
                          }
                          listing={
                            listing
                          }
                          processing={
                            processing
                          }
                          action="remove"
                          onAction={() => {
                            void handleRemoveFromPMS(
                              listing.id,
                            );
                          }}
                        />
                      );
                    },
                  )}
                </div>
              )}
            </div>

            {/* AVAILABLE PROPERTIES */}

            <div className="card mb-6 overflow-hidden">
              <div className="border-b border-gray-200 px-2 py-3 dark:border-gray-800">
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
                    (listing) => {
                      const processing =
                        processingListingId ===
                        listing.id;

                      return (
                        <PropertyRow
                          key={
                            listing.id
                          }
                          listing={
                            listing
                          }
                          processing={
                            processing
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
                      );
                    },
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
                  review the available
                  options.
                </div>
              )}
            </div>
          </>
        )}

      {/* REAL ESTATE */}

      {role ===
        "real_estate" && (
        <div className="card mb-6 overflow-hidden">
          <div className="border-b border-gray-200 px-2 py-3 dark:border-gray-800">
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
              subscriptions are completely
              separate from landlord PMS
              subscriptions.
            </p>
          </div>
        </div>
      )}

      {/* FOOTER */}

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
        className={`border-b px-2 py-3 ${styles.header}`}
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
  return (
    <div className="flex flex-col gap-4 p-5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/40 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h3 className="truncate font-semibold text-gray-900 dark:text-white">
          {listing.title}
        </h3>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {listing.city},{" "}
          {listing.county}
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
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
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

  const date = new Date(value);

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