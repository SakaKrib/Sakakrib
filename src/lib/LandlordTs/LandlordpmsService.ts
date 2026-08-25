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

export type PMSPlanName =
  | "STARTER"
  | "GROWTH"
  | "PRO"
  | "ENTERPRISE";

/* ============================================================
 * SUBSCRIPTION
 *
 * Matches the live get_my_pms_subscription() RPC.
 * ============================================================ */

export interface PMSSubscription {
  id: string;
  subscription_id: string;

  landlord_id: string;

  plan_id: string;
  plan_name: PMSPlanName | string;

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

/* ============================================================
 * PLAN
 *
 * Live subscription_plans fields:
 *   max_listings
 *   max_units_per_listing
 * ============================================================ */

export interface PMSPlan {
  id: string;
  name: PMSPlanName | string;

  audience: "LANDLORD" | "REAL_ESTATE" | string;

  max_listings: number | null;
  max_units_per_listing: number | null;

  monthly_price_kes: number;
  annual_price_kes: number;
}

/* ============================================================
 * CAPACITY
 * ============================================================ */

export interface PMSCapacity {
  listings_used: number;
  max_listings: number | null;
  listings_remaining: number | null;

  max_units_per_listing: number | null;
}

/* ============================================================
 * PMS LISTING
 *
 * Matches get_my_pms_listings().
 * ============================================================ */

export interface PMSListing {
  subscription_listing_id: string;
  subscription_id: string;

  listing_id: string;

  listing_title: string;
  listing_city: string;

  listing_price_kes: number;

  status: "ACTIVE" | "INACTIVE" | string;

  activated_at: string;
}

/* ============================================================
 * AVAILABLE PMS LISTING
 *
 * Matches get_my_available_pms_listings().
 * ============================================================ */

export interface PMSAvailableListing {
  listing_id: string;

  title: string;
  city: string;

  price_kes: number;

  created_at: string;
}

/* ============================================================
 * PMS UNIT
 *
 * Matches get_my_pms_units().
 * ============================================================ */

export interface PMSUnit {
  unit_id: string;
  listing_id: string;

  listing_title: string;

  unit_number: string;
  unit_type: string | null;

  rent: number | null;

  beds: number | null;
  baths: number | null;

  availability: string | null;

  renter_name: string | null;
  renter_assoc_id: string | null;

  renter_phone: string | null;
  renter_email: string | null;

  lease_start: string | null;
  lease_end: string | null;

  assoc_status: string | null;
}

/* ============================================================
 * LANDLORD LISTING
 *
 * Based on the live listings table.
 * ============================================================ */

export interface LandlordListing {
  id: string;
  user_id: string;

  title: string;
  description: string;

  city: string;
  county: string;

  location_search: string | null;

  latitude: number | null;
  longitude: number | null;

  property_name: string | null;
  property_type: string | null;

  price_kes: number | null;

  listing_type: string | null;

  deposit_required: boolean | null;
  deposit_structure: string | null;
  deposit_amount: number | null;

  size: string | null;

  beds: number | null;
  baths: number | null;

  contact_phone: string | null;
  contact_email: string | null;

  social_links: Record<string, unknown> | null;

  booking_enabled: boolean;
  payment_enabled: boolean;
  is_property_management: boolean;

  is_paid: boolean;
  is_published: boolean;

  approval_status: string | null;
  is_approved: boolean;

  admin_reviewed_at: string | null;
  admin_review_note: string | null;

  status: string | null;

  created_at: string;
  updated_at: string;

  cover_photo_url?: string | null;
}

/* ============================================================
 * LISTING PAYMENT
 * ============================================================ */

export interface ListingPayment {
  id: string;
  listing_id: string;
  user_id: string;

  amount_kes: number;

  mpesa_receipt: string | null;

  checkout_request_id: string | null;
  merchant_request_id: string | null;

  phone_number: string | null;

  status: string;

  result_code: number | null;
  result_description: string | null;

  payment_provider: string | null;
  payment_method: string | null;

  provider_reference: string | null;

  provider_amount: number | null;
  provider_currency: string | null;

  paypal_order_id: string | null;
  paypal_fx_rate: number | null;

  created_at: string;
  paid_at: string | null;
}

/* ============================================================
 * PAYMENT METHOD
 *
 * Matches get_my_landlord_payment_methods().
 * ============================================================ */

export interface LandlordPaymentMethod {
  id: string;

  provider: string;

  mpesa_method: string | null;

  display_name: string | null;

  paybill_number: string | null;
  paybill_account: string | null;

  till_number: string | null;

  paypal_email: string | null;

  is_default: boolean;
  is_active: boolean;

  created_at: string;
  updated_at: string;
}

/* ============================================================
 * LANDLORD ENTITLEMENT
 *
 * Matches get_landlord_listing_entitlement().
 * ============================================================ */

export interface LandlordListingEntitlement {
  landlord_id: string;

  authorized_landlord: boolean;

  role?: string;

  landlord_application_status?: string | null;
  verification_status?: string | null;

  free_limit?: number;
  free_listings_used?: number;
  free_listings_remaining?: number;

  subscription_id?: string | null;
  plan_id?: string | null;

  subscription_plan?: string | null;
  subscription_status?: string | null;

  subscription_limit?: number | null;

  max_units_per_listing?: number | null;

  subscription_listings_used?: number;
  subscription_listings_remaining?: number | null;

  individual_paid_listings?: number;
  individual_listing_price_kes?: number;

  can_start_listing?: boolean;
  can_create?: boolean;

  requires_subscription?: boolean;
  requires_individual_payment?: boolean;

  pms_access?: boolean;

  upgrade_available?: boolean;
  upgrade_target?: string | null;

  reason?: string;
}

/* ============================================================
 * SUBSCRIPTION ACCESS
 *
 * Matches get_my_subscription_access().
 * ============================================================ */

export interface PMSSubscriptionAccess {
  authenticated: boolean;

  is_landlord: boolean;

  role?: string;

  has_subscription: boolean;

  subscription_id?: string;
  plan_id?: string;
  plan_name?: string;

  max_units_per_listing?: number | null;

  billing_cycle?: PMSBillingCycle;

  status: PMSSubscriptionStatus | string;

  current_period_start?: string;
  current_period_end?: string;

  grace_period_end?: string | null;

  days_remaining?: number;
  grace_days_remaining?: number;

  auto_renew?: boolean;

  can_manage: boolean;

  can_view_properties: boolean;
  can_view_payment_history: boolean;

  can_create_units: boolean;

  can_send_sms: boolean;
  can_reconcile_rent: boolean;
}

/* ============================================================
 * PMS NOTIFICATION
 * ============================================================ */

export interface PMSNotification {
  id: string;

  source: "USER" | "PMS";

  notification_type: string;

  title: string;
  message: string;

  action_type?: string | null;

  action_payload?: Record<string, unknown> | null;

  action_required?: boolean;

  read: boolean;

  created_at: string;
  read_at: string | null;
}

/* ============================================================
 * SUBSCRIPTION INVOICE
 * ============================================================ */

export interface PMSSubscriptionInvoice {
  id: string;

  amount_kes: number;

  amount_usd: number | null;
  currency: string | null;

  mpesa_receipt: string | null;

  checkout_request_id: string | null;
  merchant_request_id: string | null;

  phone_number: string | null;

  status: string;

  result_code: number | null;
  result_description: string | null;

  payment_provider: string | null;
  payment_method: string | null;

  provider_reference: string | null;
  provider_transaction_id: string | null;

  billing_period_start: string | null;
  billing_period_end: string | null;

  created_at: string;
  paid_at: string | null;
}

/* ============================================================
 * RENT INVOICE
 * ============================================================ */

export interface LandlordRentInvoice {
  id: string;

  invoice_number: string;

  landlord_id: string;

  renter_user_id: string | null;
  renter_assoc_id: string | null;

  listing_id: string;
  unit_id: string;

  billing_period_start: string;
  billing_period_end: string;

  due_date: string;

  amount_kes: number;

  currency: string;

  status: string;

  payment_method_id: string | null;

  payment_destination_snapshot:
    | Record<string, unknown>
    | null;

  paid_at: string | null;

  confirmed_by: string | null;
  confirmed_at: string | null;

  created_at: string;
  updated_at: string;
}

/* ============================================================
 * RENT PAYMENT
 * ============================================================ */

export interface LandlordRentPayment {
  id: string;

  renter_assoc_id: string;
  unit_id: string;
  landlord_id: string;

  amount_kes: number;

  period_year: number;
  period_month: number;

  status: string;

  mpesa_receipt: string | null;

  checkout_request_id: string | null;

  paid_at: string | null;

  payment_provider: string | null;
  payment_method: string | null;

  provider_reference: string | null;

  provider_amount: number | null;
  provider_currency: string | null;

  paypal_order_id: string | null;
  paypal_fx_rate: number | null;

  merchant_request_id: string | null;
  phone_number: string | null;

  result_code: number | null;
  result_description: string | null;

  payment_method_id: string | null;

  created_at?: string;
  updated_at?: string;
}

/* ============================================================
 * RENT PAYMENT SUBMISSION
 * ============================================================ */

export interface RentPaymentSubmission {
  id: string;

  invoice_id: string;

  renter_user_id: string | null;
  landlord_id: string;

  renter_assoc_id: string;
  unit_id: string;

  transaction_reference: string;

  status: string;

  submitted_at: string;

  confirmed_by: string | null;
  confirmed_at: string | null;

  rejection_reason: string | null;

  created_at: string;
  updated_at: string;
}

/* ============================================================
 * RENT DASHBOARD SUMMARY
 * ============================================================ */

export interface LandlordRentSummary {
  invoice_count: number;

  total_invoiced_kes: number;

  paid_invoice_count: number;
  paid_amount_kes: number;

  pending_invoice_count: number;
  pending_amount_kes: number;

  overdue_invoice_count: number;
  overdue_amount_kes: number;

  pending_submission_count: number;

  payment_count: number;
  total_payments_kes: number;
}

/* ============================================================
 * LANDLORD LISTING SUMMARY
 * ============================================================ */

export interface LandlordListingSummary {
  total: number;

  published: number;
  unpublished: number;

  approved: number;
  pending_approval: number;
  rejected: number;

  paid: number;
  unpaid: number;

  pms_managed: number;
}

/* ============================================================
 * FULL DASHBOARD DATA
 * ============================================================ */

export interface PMSDashboardData {
  subscription: PMSSubscription | null;

  subscriptionAccess: PMSSubscriptionAccess;
  entitlement: LandlordListingEntitlement;

  capacity: PMSCapacity;

  listings: LandlordListing[];

  listingSummary: LandlordListingSummary;

  pmsListings: PMSListing[];

  availableListings: PMSAvailableListing[];

  units: PMSUnit[];

  plans: PMSPlan[];

  paymentMethods: LandlordPaymentMethod[];

  listingPayments: ListingPayment[];

  subscriptionInvoices: PMSSubscriptionInvoice[];

  notifications: PMSNotification[];

  rentInvoices: LandlordRentInvoice[];

  rentPayments: LandlordRentPayment[];

  pendingRentSubmissions: RentPaymentSubmission[];

  rentSummary: LandlordRentSummary;
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
 * AUTH
 * ============================================================ */

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  return user.id;
}

/* ============================================================
 * SUBSCRIPTION
 * ============================================================ */

export async function getMyPMSSubscription(): Promise<
  PMSSubscription | null
> {
  const rows =
    await rpc<
      PMSSubscription[] |
        PMSSubscription |
        null
    >("get_my_pms_subscription");

  const row = Array.isArray(rows)
    ? rows[0]
    : rows;

  if (!row) {
    return null;
  }

  return {
    ...row,

    id:
      row.id ??
      row.subscription_id,

    subscription_id:
      row.subscription_id ??
      row.id,

    max_listings:
      row.max_listings === null ||
      row.max_listings === undefined
        ? null
        : Number(row.max_listings),

    auto_renew:
      Boolean(row.auto_renew),
  };
}

/* ============================================================
 * SUBSCRIPTION ACCESS
 * ============================================================ */

export async function getMyPMSSubscriptionAccess(): Promise<
  PMSSubscriptionAccess
> {
  return rpc<PMSSubscriptionAccess>(
    "get_my_subscription_access"
  );
}

/* ============================================================
 * LANDLORD LISTING ENTITLEMENT
 * ============================================================ */

export async function getLandlordListingEntitlement(): Promise<
  LandlordListingEntitlement
> {
  const userId = await requireUserId();

  return rpc<LandlordListingEntitlement>(
    "get_landlord_listing_entitlement",
    {
      p_landlord_id: userId,
    }
  );
}

/* ============================================================
 * PMS CAPACITY
 * ============================================================ */

export function computePMSCapacity(
  listingsUsed: number,
  subscription: PMSSubscription | null,
  subscriptionAccess?: PMSSubscriptionAccess | null
): PMSCapacity {
  const maxListings =
    subscription?.max_listings ??
    null;

  const maxUnitsPerListing =
    subscriptionAccess?.max_units_per_listing ??
    null;

  return {
    listings_used: listingsUsed,

    max_listings: maxListings,

    listings_remaining:
      maxListings === null
        ? null
        : Math.max(
            0,
            maxListings - listingsUsed
          ),

    max_units_per_listing:
      maxUnitsPerListing,
  };
}

/* ============================================================
 * PMS LISTING COUNT
 * ============================================================ */

export async function getMyPMSUnitCount(
  subscriptionId?: string
): Promise<number> {
  if (!subscriptionId) {
    return 0;
  }

  const result = await rpc<number>(
    "get_my_pms_unit_count",
    {
      p_subscription_id:
        subscriptionId,
    }
  );

  return Number(result ?? 0);
}

/* ============================================================
 * PMS LISTINGS
 * ============================================================ */

export async function getMyPMSListings(): Promise<
  PMSListing[]
> {
  const result =
    await rpc<PMSListing[]>(
      "get_my_pms_listings"
    );

  return Array.isArray(result)
    ? result.map((listing) => ({
        ...listing,

        listing_price_kes:
          Number(
            listing.listing_price_kes
          ),
      }))
    : [];
}

/* ============================================================
 * AVAILABLE PMS LISTINGS
 * ============================================================ */

export async function getMyAvailablePMSListings(): Promise<
  PMSAvailableListing[]
> {
  const result =
    await rpc<PMSAvailableListing[]>(
      "get_my_available_pms_listings"
    );

  return Array.isArray(result)
    ? result.map((listing) => ({
        ...listing,

        price_kes:
          Number(listing.price_kes),
      }))
    : [];
}

/* ============================================================
 * PMS UNITS
 * ============================================================ */

export async function getMyPMSUnits(
  listingId: string
): Promise<PMSUnit[]> {
  if (!listingId) {
    return [];
  }

  const result =
    await rpc<PMSUnit[]>(
      "get_my_pms_units",
      {
        p_listing_id: listingId,
      }
    );

  return Array.isArray(result)
    ? result.map((unit) => ({
        ...unit,

        rent:
          unit.rent === null
            ? null
            : Number(unit.rent),

        beds:
          unit.beds === null
            ? null
            : Number(unit.beds),

        baths:
          unit.baths === null
            ? null
            : Number(unit.baths),
      }))
    : [];
}

/* ============================================================
 * ALL PMS UNITS
 * ============================================================ */

export async function getMyAllPMSUnits(
  pmsListings?: PMSListing[]
): Promise<PMSUnit[]> {
  const listings =
    pmsListings ??
    (await getMyPMSListings());

  if (listings.length === 0) {
    return [];
  }

  const results =
    await Promise.all(
      listings.map((listing) =>
        getMyPMSUnits(
          listing.listing_id
        )
      )
    );

  return results.flat();
}

/* ============================================================
 * CHECK PMS MANAGEMENT
 * ============================================================ */

export async function isListingPMSManaged(
  listingId: string
): Promise<boolean> {
  if (!listingId) {
    return false;
  }

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
  if (!subscriptionId) {
    throw new Error(
      "An active PMS subscription is required."
    );
  }

  if (!listingId) {
    throw new Error(
      "A listing is required."
    );
  }

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
  if (!subscriptionId) {
    throw new Error(
      "A PMS subscription is required."
    );
  }

  if (!listingId) {
    throw new Error(
      "A listing is required."
    );
  }

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
 * PMS PLANS
 * ============================================================ */

export async function getPMSPlans(): Promise<
  PMSPlan[]
> {
  const { data, error } =
    await supabase
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
      .order(
        "monthly_price_kes",
        {
          ascending: true,
        }
      );

  if (error) {
    console.error(
      "PMS plan lookup failed:",
      error
    );

    throw new Error(
      error.message ||
        "Unable to load PMS plans."
    );
  }

  return (data ?? []).map(
    (plan) => ({
      id: plan.id,

      name: plan.name,

      audience: plan.audience,

      max_listings:
        plan.max_listings === null
          ? null
          : Number(
              plan.max_listings
            ),

      max_units_per_listing:
        plan.max_units_per_listing ===
        null
          ? null
          : Number(
              plan.max_units_per_listing
            ),

      monthly_price_kes:
        Number(
          plan.monthly_price_kes
        ),

      annual_price_kes:
        Number(
          plan.annual_price_kes
        ),
    })
  ) as PMSPlan[];
}

/* ============================================================
 * LANDLORD LISTINGS
 * ============================================================ */

export async function getMyLandlordListings(): Promise<
  LandlordListing[]
> {
  const userId =
    await requireUserId();

  const { data, error } =
    await supabase
      .from("listings")
      .select(`
        id,
        user_id,
        title,
        description,
        city,
        county,
        location_search,
        latitude,
        longitude,
        property_name,
        property_type,
        price_kes,
        listing_type,
        deposit_required,
        deposit_structure,
        deposit_amount,
        size,
        beds,
        baths,
        contact_phone,
        contact_email,
        social_links,
        booking_enabled,
        payment_enabled,
        is_property_management,
        is_paid,
        is_published,
        approval_status,
        is_approved,
        admin_reviewed_at,
        admin_review_note,
        status,
        created_at,
        updated_at
      `)
      .eq(
        "user_id",
        userId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error) {
    console.error(
      "Landlord listing lookup failed:",
      error
    );

    throw new Error(
      error.message ||
        "Unable to load your listings."
    );
  }

  const listings =
    (data ?? []).map(
      (listing) => ({
        ...listing,

        price_kes:
          listing.price_kes === null
            ? null
            : Number(
                listing.price_kes
              ),

        deposit_amount:
          listing.deposit_amount ===
          null
            ? null
            : Number(
                listing.deposit_amount
              ),

        latitude:
          listing.latitude === null
            ? null
            : Number(
                listing.latitude
              ),

        longitude:
          listing.longitude === null
            ? null
            : Number(
                listing.longitude
              ),
      })
    ) as LandlordListing[];

  /*
   * Cover photos are stored in listing_media.
   * We deliberately fetch them separately instead of assuming
   * a PostgREST relationship name.
   */
  if (listings.length === 0) {
    return listings;
  }

  const listingIds =
    listings.map(
      (listing) => listing.id
    );

  const { data: media } =
    await supabase
      .from("listing_media")
      .select(`
        listing_id,
        url,
        position,
        media_type
      `)
      .in(
        "listing_id",
        listingIds
      )
      .order(
        "position",
        {
          ascending: true,
        }
      );

  const coverByListing =
    new Map<string, string>();

  for (const item of media ?? []) {
    if (
      item.url &&
      !coverByListing.has(
        item.listing_id
      )
    ) {
      coverByListing.set(
        item.listing_id,
        item.url
      );
    }
  }

  return listings.map(
    (listing) => ({
      ...listing,

      cover_photo_url:
        coverByListing.get(
          listing.id
        ) ?? null,
    })
  );
}

/* ============================================================
 * LISTING SUMMARY
 * ============================================================ */

export function summarizeLandlordListings(
  listings: LandlordListing[],
  pmsListings: PMSListing[]
): LandlordListingSummary {
  const pmsIds = new Set(
    pmsListings.map(
      (listing) =>
        listing.listing_id
    )
  );

  return {
    total: listings.length,

    published:
      listings.filter(
        (listing) =>
          listing.is_published
      ).length,

    unpublished:
      listings.filter(
        (listing) =>
          !listing.is_published
      ).length,

    approved:
      listings.filter(
        (listing) =>
          listing.is_approved ||
          listing.approval_status?.toLowerCase() ===
            "approved"
      ).length,

    pending_approval:
      listings.filter(
        (listing) => {
          const status =
            listing.approval_status?.toLowerCase();

          return (
            !listing.is_approved &&
            status !== "rejected" &&
            status !== "declined" &&
            status !== "approved"
          );
        }
      ).length,

    rejected:
      listings.filter(
        (listing) => {
          const status =
            listing.approval_status?.toLowerCase();

          return (
            status === "rejected" ||
            status === "declined"
          );
        }
      ).length,

    paid:
      listings.filter(
        (listing) =>
          listing.is_paid
      ).length,

    unpaid:
      listings.filter(
        (listing) =>
          !listing.is_paid
      ).length,

    pms_managed:
      listings.filter(
        (listing) =>
          pmsIds.has(
            listing.id
          )
      ).length,
  };
}

/* ============================================================
 * LISTING PAYMENTS
 * ============================================================ */

export async function getMyListingPayments(): Promise<
  ListingPayment[]
> {
  const userId =
    await requireUserId();

  const { data, error } =
    await supabase
      .from("listing_payments")
      .select(`
        id,
        listing_id,
        user_id,
        amount_kes,
        mpesa_receipt,
        checkout_request_id,
        merchant_request_id,
        phone_number,
        status,
        result_code,
        result_description,
        payment_provider,
        payment_method,
        provider_reference,
        provider_amount,
        provider_currency,
        paypal_order_id,
        paypal_fx_rate,
        created_at,
        paid_at
      `)
      .eq(
        "user_id",
        userId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw new Error(
      error.message ||
        "Unable to load listing payment history."
    );
  }

  return (data ?? []).map(
    (payment) => ({
      ...payment,

      amount_kes:
        Number(
          payment.amount_kes
        ),

      provider_amount:
        payment.provider_amount ===
        null
          ? null
          : Number(
              payment.provider_amount
            ),

      paypal_fx_rate:
        payment.paypal_fx_rate ===
        null
          ? null
          : Number(
              payment.paypal_fx_rate
            ),
    })
  );
}

/* ============================================================
 * PAYMENT METHODS
 * ============================================================ */

export async function getMyLandlordPaymentMethods(): Promise<
  LandlordPaymentMethod[]
> {
  const result =
    await rpc<
      LandlordPaymentMethod[]
    >(
      "get_my_landlord_payment_methods"
    );

  return Array.isArray(result)
    ? result
    : [];
}

/* ============================================================
 * DEFAULT PAYMENT METHOD
 * ============================================================ */

export async function setLandlordPaymentMethodDefault(
  paymentMethodId: string
): Promise<void> {
  if (!paymentMethodId) {
    throw new Error(
      "A payment method is required."
    );
  }

  await rpc(
    "set_landlord_payment_method_default",
    {
      p_payment_method_id:
        paymentMethodId,
    }
  );
}

/* ============================================================
 * NOTIFICATIONS
 * ============================================================ */

export async function getMyPMSNotifications(): Promise<
  PMSNotification[]
> {
  const userId =
    await requireUserId();

  const [
    userNotifications,
    pmsNotifications,
  ] = await Promise.all([
    supabase
      .from("user_notifications")
      .select(`
        id,
        notification_type,
        title,
        message,
        data,
        read_at,
        created_at
      `)
      .eq(
        "user_id",
        userId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      ),

    supabase
      .from(
        "pms_subscription_notifications"
      )
      .select(`
        id,
        notification_type,
        title,
        message,
        action_type,
        action_required,
        in_app_read,
        created_at,
        read_at
      `)
      .eq(
        "landlord_id",
        userId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      ),
  ]);

  if (userNotifications.error) {
    throw new Error(
      userNotifications.error.message
    );
  }

  if (pmsNotifications.error) {
    throw new Error(
      pmsNotifications.error.message
    );
  }

  const normal =
    (userNotifications.data ?? []).map(
      (notification) => ({
        id: notification.id,

        source: "USER" as const,

        notification_type:
          notification.notification_type,

        title:
          notification.title,

        message:
          notification.message,

        action_payload:
          notification.data,

        read:
          Boolean(
            notification.read_at
          ),

        created_at:
          notification.created_at,

        read_at:
          notification.read_at,
      })
    );

  const pms =
    (pmsNotifications.data ?? []).map(
      (notification) => ({
        id: notification.id,

        source: "PMS" as const,

        notification_type:
          notification.notification_type,

        title:
          notification.title,

        message:
          notification.message,

        action_type:
          notification.action_type,

        action_required:
          Boolean(
            notification.action_required
          ),

        read:
          Boolean(
            notification.in_app_read
          ),

        created_at:
          notification.created_at,

        read_at:
          notification.read_at,
      })
    );

  return [
    ...normal,
    ...pms,
  ].sort(
    (a, b) =>
      new Date(
        b.created_at
      ).getTime() -
      new Date(
        a.created_at
      ).getTime()
  );
}

/* ============================================================
 * MARK USER NOTIFICATION READ
 * ============================================================ */

export async function markUserNotificationRead(
  notificationId: string
): Promise<void> {
  const userId =
    await requireUserId();

  const { error } =
    await supabase
      .from("user_notifications")
      .update({
        read_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        notificationId
      )
      .eq(
        "user_id",
        userId
      );

  if (error) {
    throw new Error(
      error.message ||
        "Unable to mark notification as read."
    );
  }
}

/* ============================================================
 * MARK PMS NOTIFICATION READ
 * ============================================================ */

export async function markPMSNotificationRead(
  notificationId: string
): Promise<void> {
  const userId =
    await requireUserId();

  const { error } =
    await supabase
      .from(
        "pms_subscription_notifications"
      )
      .update({
        in_app_read: true,
        read_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        notificationId
      )
      .eq(
        "landlord_id",
        userId
      );

  if (error) {
    throw new Error(
      error.message ||
        "Unable to mark PMS notification as read."
    );
  }
}

/* ============================================================
 * SUBSCRIPTION INVOICES
 * ============================================================ */

export async function getMySubscriptionInvoices(
  subscriptionId?: string
): Promise<
  PMSSubscriptionInvoice[]
> {
  const id =
    subscriptionId ??
    (
      await getMyPMSSubscription()
    )?.subscription_id;

  if (!id) {
    return [];
  }

  const { data, error } =
    await supabase
      .from("subscription_invoices")
      .select(`
        id,
        amount_kes,
        amount_usd,
        currency,
        mpesa_receipt,
        checkout_request_id,
        merchant_request_id,
        phone_number,
        status,
        result_code,
        result_description,
        payment_provider,
        payment_method,
        provider_reference,
        provider_transaction_id,
        billing_period_start,
        billing_period_end,
        created_at,
        paid_at
      `)
      .eq(
        "landlord_subscription_id",
        id
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw new Error(
      error.message ||
        "Unable to load subscription payment history."
    );
  }

  return (data ?? []).map(
    (invoice) => ({
      ...invoice,

      amount_kes:
        Number(
          invoice.amount_kes
        ),

      amount_usd:
        invoice.amount_usd ===
        null
          ? null
          : Number(
              invoice.amount_usd
            ),
    })
  );
}

/* ============================================================
 * RENT INVOICES
 * ============================================================ */

export async function getMyRentInvoices(): Promise<
  LandlordRentInvoice[]
> {
  const userId =
    await requireUserId();

  const { data, error } =
    await supabase
      .from("rent_invoices")
      .select(`
        id,
        invoice_number,
        landlord_id,
        renter_user_id,
        renter_assoc_id,
        listing_id,
        unit_id,
        billing_period_start,
        billing_period_end,
        due_date,
        amount_kes,
        currency,
        status,
        payment_method_id,
        payment_destination_snapshot,
        paid_at,
        confirmed_by,
        confirmed_at,
        created_at,
        updated_at
      `)
      .eq(
        "landlord_id",
        userId
      )
      .order(
        "due_date",
        {
          ascending: false,
        }
      );

  if (error) {
    throw new Error(
      error.message ||
        "Unable to load rent invoices."
    );
  }

  return (data ?? []).map(
    (invoice) => ({
      ...invoice,

      amount_kes:
        Number(
          invoice.amount_kes
        ),
    })
  );
}

/* ============================================================
 * RENT PAYMENTS
 * ============================================================ */

export async function getMyRentPayments(): Promise<
  LandlordRentPayment[]
> {
  const userId =
    await requireUserId();

  const { data, error } =
    await supabase
      .from("rent_payments")
      .select(`
        id,
        renter_assoc_id,
        unit_id,
        landlord_id,
        amount_kes,
        period_year,
        period_month,
        status,
        mpesa_receipt,
        checkout_request_id,
        paid_at,
        payment_provider,
        payment_method,
        created_at,
        updated_at,
        payment_intent_id,
        provider_reference,
        provider_amount,
        provider_currency,
        paypal_order_id,
        paypal_fx_rate,
        merchant_request_id,
        phone_number,
        result_code,
        result_description,
        payment_method_id
      `)
      .eq(
        "landlord_id",
        userId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw new Error(
      error.message ||
        "Unable to load rent payments."
    );
  }

  return (data ?? []).map(
    (payment) => ({
      ...payment,

      amount_kes:
        Number(
          payment.amount_kes
        ),

      provider_amount:
        payment.provider_amount ===
        null
          ? null
          : Number(
              payment.provider_amount
            ),

      paypal_fx_rate:
        payment.paypal_fx_rate ===
        null
          ? null
          : Number(
              payment.paypal_fx_rate
            ),
    })
  );
}

/* ============================================================
 * PENDING RENT PAYMENT SUBMISSIONS
 * ============================================================ */

export async function getMyPendingRentSubmissions(): Promise<
  RentPaymentSubmission[]
> {
  const userId =
    await requireUserId();

  const { data, error } =
    await supabase
      .from(
        "rent_payment_submissions"
      )
      .select(`
        id,
        invoice_id,
        renter_user_id,
        landlord_id,
        renter_assoc_id,
        unit_id,
        transaction_reference,
        status,
        submitted_at,
        confirmed_by,
        confirmed_at,
        rejection_reason,
        created_at,
        updated_at
      `)
      .eq(
        "landlord_id",
        userId
      )
      .order(
        "submitted_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw new Error(
      error.message ||
        "Unable to load rent payment submissions."
    );
  }

  return data ?? [];
}

/* ============================================================
 * RENT SUMMARY
 * ============================================================ */

export function computeRentSummary(
  invoices: LandlordRentInvoice[],
  payments: LandlordRentPayment[],
  submissions: RentPaymentSubmission[]
): LandlordRentSummary {
  const isPaid = (status: string) =>
    status.toUpperCase() ===
    "PAID";

  const isPending = (status: string) =>
    [
      "PENDING",
      "OPEN",
      "UNPAID",
      "PROCESSING",
    ].includes(
      status.toUpperCase()
    );

  const isOverdue = (invoice: LandlordRentInvoice) =>
    invoice.status.toUpperCase() ===
      "OVERDUE" ||
    (
      !isPaid(invoice.status) &&
      new Date(
        invoice.due_date
      ) <
        new Date()
    );

  const paidInvoices =
    invoices.filter((invoice) =>
      isPaid(invoice.status)
    );

  const pendingInvoices =
    invoices.filter((invoice) =>
      isPending(invoice.status)
    );

  const overdueInvoices =
    invoices.filter((invoice) =>
      isOverdue(invoice)
    );

  return {
    invoice_count:
      invoices.length,

    total_invoiced_kes:
      invoices.reduce(
        (sum, invoice) =>
          sum + Number(
            invoice.amount_kes
          ),
        0
      ),

    paid_invoice_count:
      paidInvoices.length,

    paid_amount_kes:
      paidInvoices.reduce(
        (sum, invoice) =>
          sum + Number(
            invoice.amount_kes
          ),
        0
      ),

    pending_invoice_count:
      pendingInvoices.length,

    pending_amount_kes:
      pendingInvoices.reduce(
        (sum, invoice) =>
          sum + Number(
            invoice.amount_kes
          ),
        0
      ),

    overdue_invoice_count:
      overdueInvoices.length,

    overdue_amount_kes:
      overdueInvoices.reduce(
        (sum, invoice) =>
          sum + Number(
            invoice.amount_kes
          ),
        0
      ),

    pending_submission_count:
      submissions.filter(
        (submission) =>
          submission.status.toUpperCase() ===
          "PENDING"
      ).length,

    payment_count:
      payments.length,

    total_payments_kes:
      payments
        .filter((payment) =>
          payment.status
            .toUpperCase() ===
          "PAID"
        )
        .reduce(
          (sum, payment) =>
            sum + Number(
              payment.amount_kes
            ),
          0
        ),
  };
}

/* ============================================================
 * CREATE LANDLORD LISTING
 *
 * Uses the live create_landlord_listing() RPC.
 * ============================================================ */

export interface CreateLandlordListingInput {
  title: string;
  description: string;

  city: string;
  county: string;

  location_search?: string | null;

  latitude?: number | null;
  longitude?: number | null;

  property_name?: string | null;
  property_type?: string | null;

  price_kes?: number | null;

  listing_type?: string | null;

  deposit_required?: boolean | null;
  deposit_structure?: string | null;
  deposit_amount?: number | null;

  size?: string | null;

  beds?: number | null;
  baths?: number | null;

  contact_phone?: string | null;
  contact_email?: string | null;

  social_links?: Record<
    string,
    unknown
  > | null;

  booking_enabled?: boolean;
  payment_enabled?: boolean;

  is_property_management?: boolean;
}

export async function createLandlordListing(
  input: CreateLandlordListingInput
): Promise<unknown> {
  await requireUserId();

  return rpc(
    "create_landlord_listing",
    {
      p_title:
        input.title,

      p_description:
        input.description,

      p_city:
        input.city,

      p_county:
        input.county,

      p_location_search:
        input.location_search ??
        null,

      p_latitude:
        input.latitude ??
        null,

      p_longitude:
        input.longitude ??
        null,

      p_property_name:
        input.property_name ??
        null,

      p_property_type:
        input.property_type ??
        null,

      p_price_kes:
        input.price_kes ??
        null,

      p_listing_type:
        input.listing_type ??
        null,

      p_deposit_required:
        input.deposit_required ??
        null,

      p_deposit_structure:
        input.deposit_structure ??
        null,

      p_deposit_amount:
        input.deposit_amount ??
        null,

      p_size:
        input.size ??
        null,

      p_beds:
        input.beds ??
        null,

      p_baths:
        input.baths ??
        null,

      p_contact_phone:
        input.contact_phone ??
        null,

      p_contact_email:
        input.contact_email ??
        null,

      p_social_links:
        input.social_links ??
        null,

      p_booking_enabled:
        input.booking_enabled ??
        false,

      p_payment_enabled:
        input.payment_enabled ??
        false,

      p_is_property_management:
        input.is_property_management ??
        false,
    }
  );
}

/* ============================================================
 * LISTING PAYMENT INTENT
 *
 * Uses the live create_listing_payment_intent() RPC.
 * ============================================================ */

export async function createListingPaymentIntent(
  listingData: Record<
    string,
    unknown
  >
): Promise<unknown> {
  await requireUserId();

  return rpc(
    "create_listing_payment_intent",
    {
      p_listing_data:
        listingData,
    }
  );
}

/* ============================================================
 * M-PESA SUBSCRIPTION PAYMENT
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
  } =
    await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  const supabaseUrl =
    import.meta.env
      .VITE_SUPABASE_URL;

  const anonKey =
    import.meta.env
      .VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Supabase configuration is missing."
    );
  }

  const response =
    await fetch(
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

  let data:
    | PMSPaymentResponse;

  try {
    data =
      (await response.json()) as PMSPaymentResponse;
  } catch {
    throw new Error(
      "Invalid response from payment service."
    );
  }

  if (
    !response.ok ||
    !data.success
  ) {
    throw new Error(
      data.error ||
        "Unable to initiate M-Pesa payment."
    );
  }

  return data;
}

/* ============================================================
 * LOAD FULL LANDLORD PMS DASHBOARD
 * ============================================================ */

export async function loadPMSDashboardData(): Promise<
  PMSDashboardData
> {
  await requireUserId();

  /*
   * Load the subscription first because its ID is required
   * for some of the other dashboard operations.
   */
  const [
    subscription,
    subscriptionAccess,
    entitlement,
    plans,
    listings,
    pmsListings,
    availableListings,
    paymentMethods,
    listingPayments,
    notifications,
    rentInvoices,
    rentPayments,
    pendingRentSubmissions,
  ] = await Promise.all([
    getMyPMSSubscription(),

    getMyPMSSubscriptionAccess(),

    getLandlordListingEntitlement(),

    getPMSPlans(),

    getMyLandlordListings(),

    getMyPMSListings(),

    getMyAvailablePMSListings(),

    getMyLandlordPaymentMethods(),

    getMyListingPayments(),

    getMyPMSNotifications(),

    getMyRentInvoices(),

    getMyRentPayments(),

    getMyPendingRentSubmissions(),
  ]);

  const listingsUsed =
    await getMyPMSUnitCount(
      subscription?.subscription_id
    );

  const capacity =
    computePMSCapacity(
      listingsUsed,
      subscription,
      subscriptionAccess
    );

  const units =
    await getMyAllPMSUnits(
      pmsListings
    );

  const listingSummary =
    summarizeLandlordListings(
      listings,
      pmsListings
    );

  const rentSummary =
    computeRentSummary(
      rentInvoices,
      rentPayments,
      pendingRentSubmissions
    );

  return {
    subscription,

    subscriptionAccess,

    entitlement,

    capacity,

    listings,

    listingSummary,

    pmsListings,

    availableListings,

    units,

    plans,

    paymentMethods,

    listingPayments,

    subscriptionInvoices:
      await getMySubscriptionInvoices(
        subscription?.subscription_id
      ),

    notifications,

    rentInvoices,

    rentPayments,

    pendingRentSubmissions,

    rentSummary,
  };
}