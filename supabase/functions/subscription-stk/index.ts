import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY"
)!;

const MPESA_CONSUMER_KEY = Deno.env.get("MPESA_CONSUMER_KEY")!;
const MPESA_CONSUMER_SECRET = Deno.env.get("MPESA_CONSUMER_SECRET")!;
const MPESA_SHORTCODE = Deno.env.get("MPESA_SHORTCODE")!;
const MPESA_PASSKEY = Deno.env.get("MPESA_PASSKEY")!;

const MPESA_ENVIRONMENT =
  Deno.env.get("MPESA_ENVIRONMENT") ?? "sandbox";

const MPESA_CALLBACK_URL =
  Deno.env.get("MPESA_CALLBACK_URL")!;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

interface RequestBody {
  plan_id?: string;
  billing_cycle?: "MONTHLY" | "ANNUAL";
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}

/*
 * ------------------------------------------------------------
 * MPESA ACCESS TOKEN
 * ------------------------------------------------------------
 */

async function getMpesaAccessToken(): Promise<string> {
  const credentials = btoa(
    `${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`
  );

  const baseUrl =
    MPESA_ENVIRONMENT === "live"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";

  const response = await fetch(
    `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();

    console.error(
      "M-Pesa OAuth failed:",
      text
    );

    throw new Error(
      "Unable to authenticate with M-Pesa"
    );
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error(
      "M-Pesa access token missing"
    );
  }

  return data.access_token;
}

/*
 * ------------------------------------------------------------
 * STK PASSWORD
 * ------------------------------------------------------------
 */

function generateTimestamp(): string {
  const now = new Date();

  const year = now.getUTCFullYear();
  const month = String(
    now.getUTCMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getUTCDate()
  ).padStart(2, "0");

  const hours = String(
    now.getUTCHours()
  ).padStart(2, "0");

  const minutes = String(
    now.getUTCMinutes()
  ).padStart(2, "0");

  const seconds = String(
    now.getUTCSeconds()
  ).padStart(2, "0");

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function generatePassword(
  shortcode: string,
  passkey: string,
  timestamp: string
): string {
  return btoa(
    `${shortcode}${passkey}${timestamp}`
  );
}

/*
 * ------------------------------------------------------------
 * NORMALIZE KENYAN PHONE
 * ------------------------------------------------------------
 */

function normalizeKenyanPhone(
  phone: string
): string {
  let value = phone.trim();

  value = value.replace(/\s+/g, "");

  if (value.startsWith("+254")) {
    return value.substring(1);
  }

  if (value.startsWith("254")) {
    return value;
  }

  if (value.startsWith("07")) {
    return `254${value.substring(1)}`;
  }

  if (value.startsWith("01")) {
    return `254${value.substring(1)}`;
  }

  throw new Error(
    "Invalid Kenyan phone number"
  );
}

/*
 * ------------------------------------------------------------
 * MAIN FUNCTION
 * ------------------------------------------------------------
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed",
      },
      405
    );
  }

  try {
    /*
     * --------------------------------------------------------
     * AUTHENTICATION
     * --------------------------------------------------------
     */

    const authHeader =
      req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(
        {
          success: false,
          error: "Authentication required",
        },
        401
      );
    }

    const accessToken =
      authHeader.replace(
        "Bearer ",
        ""
      );

    /*
     * Use the caller's JWT to identify the landlord.
     */

    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const {
      data: {
        user,
      },
      error: userError,
    } = await userClient.auth.getUser(
      accessToken
    );

    if (userError || !user) {
      console.error(
        "Authentication failed:",
        userError
      );

      return jsonResponse(
        {
          success: false,
          error: "Invalid authentication",
        },
        401
      );
    }

    /*
     * --------------------------------------------------------
     * REQUEST BODY
     * --------------------------------------------------------
     */

    const body =
      (await req.json()) as RequestBody;

    const {
      plan_id,
      billing_cycle,
    } = body;

    if (!plan_id) {
      return jsonResponse(
        {
          success: false,
          error: "plan_id is required",
        },
        400
      );
    }

    if (
      billing_cycle !== "MONTHLY" &&
      billing_cycle !== "ANNUAL"
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "billing_cycle must be MONTHLY or ANNUAL",
        },
        400
      );
    }

    /*
     * --------------------------------------------------------
     * VERIFY PROFILE
     * --------------------------------------------------------
     */

    const {
      data: profile,
      error: profileError,
    } =
      await supabase
        .from("profiles")
        .select(`
          id,
          role,
          phone
        `)
        .eq("id", user.id)
        .maybeSingle();

    if (profileError) {
      console.error(
        "Profile lookup failed:",
        profileError
      );

      throw new Error(
        "Unable to load landlord profile"
      );
    }

    if (!profile) {
      return jsonResponse(
        {
          success: false,
          error: "Profile not found",
        },
        404
      );
    }

    if (profile.role !== "landlord") {
      return jsonResponse(
        {
          success: false,
          error:
            "Only landlords can purchase PMS subscriptions",
        },
        403
      );
    }

    if (!profile.phone) {
      return jsonResponse(
        {
          success: false,
          error:
            "Your profile does not have a phone number",
        },
        400
      );
    }

    /*
     * --------------------------------------------------------
     * LOAD PLAN
     * --------------------------------------------------------
     */

    const {
      data: plan,
      error: planError,
    } =
      await supabase
        .from("subscription_plans")
        .select(`
          id,
          name,
          max_units,
          monthly_price_kes,
          annual_price_kes
        `)
        .eq("id", plan_id)
        .maybeSingle();

    if (planError) {
      console.error(
        "Plan lookup failed:",
        planError
      );

      throw new Error(
        "Unable to load subscription plan"
      );
    }

    if (!plan) {
      return jsonResponse(
        {
          success: false,
          error: "Subscription plan not found",
        },
        404
      );
    }

    /*
     * --------------------------------------------------------
     * SERVER-SIDE PRICE CALCULATION
     * --------------------------------------------------------
     */

    const amount =
      billing_cycle === "MONTHLY"
        ? Number(plan.monthly_price_kes)
        : Number(plan.annual_price_kes);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(
        "Invalid subscription price"
      );
    }

    /*
     * --------------------------------------------------------
     * CHECK EXISTING SUBSCRIPTION
     * --------------------------------------------------------
     */

    const {
      data: existingSubscription,
      error:
        existingSubscriptionError,
    } =
      await supabase
        .from("landlord_subscriptions")
        .select(`
          id,
          status,
          plan_id,
          billing_cycle
        `)
        .eq(
          "landlord_id",
          user.id
        )
        .in("status", [
          "PENDING_PAYMENT",
          "ACTIVE",
          "GRACE_PERIOD",
        ])
        .maybeSingle();

    if (
      existingSubscriptionError
    ) {
      console.error(
        "Subscription lookup failed:",
        existingSubscriptionError
      );

      throw new Error(
        "Unable to check existing subscription"
      );
    }

    /*
     * We allow:
     *
     * PENDING_PAYMENT → new payment
     * GRACE_PERIOD    → renewal
     *
     * But ACTIVE subscriptions should not
     * accidentally create duplicate payments.
     */

    if (
      existingSubscription?.status ===
      "ACTIVE"
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Your PMS subscription is already active",
        },
        409
      );
    }

    /*
     * --------------------------------------------------------
     * CREATE OR UPDATE SUBSCRIPTION
     * --------------------------------------------------------
     */

    let subscriptionId =
      existingSubscription?.id;

    if (
      !subscriptionId
    ) {
      const now =
        new Date();

      /*
       * PENDING_PAYMENT deliberately does NOT
       * grant PMS access.
       */

      const initialEnd =
        new Date(now);

      initialEnd.setUTCMinutes(
        initialEnd.getUTCMinutes() + 1
      );

      const {
        data: newSubscription,
        error:
          subscriptionCreateError,
      } =
        await supabase
          .from(
            "landlord_subscriptions"
          )
          .insert({
            landlord_id:
              user.id,
            plan_id:
              plan.id,
            billing_cycle,
            status:
              "PENDING_PAYMENT",
            current_period_start:
              now.toISOString(),
            current_period_end:
              initialEnd.toISOString(),
            grace_period_end:
              null,
            auto_renew:
              false,
          })
          .select("id")
          .single();

      if (
        subscriptionCreateError
      ) {
        console.error(
          "Subscription creation failed:",
          subscriptionCreateError
        );

        throw new Error(
          "Unable to create subscription"
        );
      }

      subscriptionId =
        newSubscription.id;
    } else {
      /*
       * Existing GRACE_PERIOD/PENDING_PAYMENT
       * subscription.
       *
       * Update selected plan/cycle BEFORE
       * payment, but keep it PENDING_PAYMENT.
       */

      const {
        error:
          subscriptionUpdateError,
      } =
        await supabase
          .from(
            "landlord_subscriptions"
          )
          .update({
            plan_id:
              plan.id,
            billing_cycle,
            status:
              "PENDING_PAYMENT",
            grace_period_end:
              null,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            subscriptionId
          );

      if (
        subscriptionUpdateError
      ) {
        console.error(
          "Subscription update failed:",
          subscriptionUpdateError
        );

        throw new Error(
          "Unable to prepare subscription payment"
        );
      }
    }

    /*
     * --------------------------------------------------------
     * CREATE INVOICE
     * --------------------------------------------------------
     */

    const {
      data: invoice,
      error: invoiceError,
    } =
      await supabase
        .from(
          "subscription_invoices"
        )
        .insert({
          subscription_id:
            subscriptionId,
          amount_kes:
            amount,
          status:
            "PENDING",
        })
        .select(`
          id,
          amount_kes
        `)
        .single();

    if (invoiceError) {
      console.error(
        "Invoice creation failed:",
        invoiceError
      );

      throw new Error(
        "Unable to create subscription invoice"
      );
    }

    /*
     * --------------------------------------------------------
     * NORMALIZE PHONE
     * --------------------------------------------------------
     */

    const phoneNumber =
      normalizeKenyanPhone(
        profile.phone
      );

    /*
     * --------------------------------------------------------
     * GET MPESA TOKEN
     * --------------------------------------------------------
     */

    const accessToken =
      await getMpesaAccessToken();

    const baseUrl =
      MPESA_ENVIRONMENT ===
      "live"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

    /*
     * --------------------------------------------------------
     * GENERATE STK PASSWORD
     * --------------------------------------------------------
     */

    const timestamp =
      generateTimestamp();

    const password =
      generatePassword(
        MPESA_SHORTCODE,
        MPESA_PASSKEY,
        timestamp
      );

    /*
     * --------------------------------------------------------
     * STK PUSH
     * --------------------------------------------------------
     */

    const stkResponse =
      await fetch(
        `${baseUrl}/mpesa/stkpush/v1/processrequest`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            BusinessShortCode:
              Number(
                MPESA_SHORTCODE
              ),

            Password:
              password,

            Timestamp:
              timestamp,

            TransactionType:
              "CustomerPayBillOnline",

            Amount:
              Math.round(amount),

            PartyA:
              phoneNumber,

            PartyB:
              Number(
                MPESA_SHORTCODE
              ),

            PhoneNumber:
              phoneNumber,

            CallBackURL:
              MPESA_CALLBACK_URL,

            AccountReference:
              `SAKACRIB-${invoice.id.substring(
                0,
                8
              )}`,

            TransactionDesc:
              `Saka Crib PMS ${plan.name} ${billing_cycle}`,
          }),
        }
      );

    const stkData =
      await stkResponse.json();

    if (!stkResponse.ok) {
      console.error(
        "STK request failed:",
        stkData
      );

      await supabase
        .from(
          "subscription_invoices"
        )
        .update({
          status:
            "FAILED",
          result_description:
            "M-Pesa STK request failed",
        })
        .eq(
          "id",
          invoice.id
        );

      throw new Error(
        "Unable to initiate M-Pesa payment"
      );
    }

    /*
     * --------------------------------------------------------
     * HANDLE DARaja ERROR RESPONSE
     * --------------------------------------------------------
     */

    if (
      stkData.ResponseCode &&
      stkData.ResponseCode !== "0"
    ) {
      console.error(
        "Daraja rejected STK:",
        stkData
      );

      await supabase
        .from(
          "subscription_invoices"
        )
        .update({
          status:
            "FAILED",
          result_code:
            Number(
              stkData.ResponseCode
            ),
          result_description:
            stkData.ResponseDescription ??
            "M-Pesa rejected STK request",
        })
        .eq(
          "id",
          invoice.id
        );

      return jsonResponse(
        {
          success: false,
          error:
            stkData.ResponseDescription ??
            "M-Pesa payment request failed",
        },
        400
      );
    }

    /*
     * --------------------------------------------------------
     * SAVE CHECKOUT REQUEST ID
     * --------------------------------------------------------
     */

    const checkoutRequestId =
      stkData.CheckoutRequestID;

    const merchantRequestId =
      stkData.MerchantRequestID;

    if (
      !checkoutRequestId
    ) {
      console.error(
        "M-Pesa did not return CheckoutRequestID:",
        stkData
      );

      await supabase
        .from(
          "subscription_invoices"
        )
        .update({
          status:
            "FAILED",
          result_description:
            "M-Pesa did not return CheckoutRequestID",
        })
        .eq(
          "id",
          invoice.id
        );

      throw new Error(
        "M-Pesa payment request did not return a checkout ID"
      );
    }

    /*
     * --------------------------------------------------------
     * UPDATE INVOICE
     * --------------------------------------------------------
     */

    const {
      error:
        invoiceUpdateError,
    } =
      await supabase
        .from(
          "subscription_invoices"
        )
        .update({
          checkout_request_id:
            checkoutRequestId,
          merchant_request_id:
            merchantRequestId ??
            null,
          phone_number:
            phoneNumber,
        })
        .eq(
          "id",
          invoice.id
        );

    if (
      invoiceUpdateError
    ) {
      console.error(
        "Invoice update failed:",
        invoiceUpdateError
      );

      throw new Error(
        "Payment initiated but invoice could not be updated"
      );
    }

    /*
     * --------------------------------------------------------
     * SUCCESS
     * --------------------------------------------------------
     */

    return jsonResponse({
      success: true,

      message:
        "M-Pesa payment request sent",

      invoice_id:
        invoice.id,

      subscription_id:
        subscriptionId,

      plan:
        plan.name,

      billing_cycle,

      amount_kes:
        amount,

      checkout_request_id:
        checkoutRequestId,

      merchant_request_id:
        merchantRequestId ??
        null,

      customer_message:
        stkData.CustomerMessage ??
        "Please complete the M-Pesa payment on your phone.",
    });

  } catch (error) {
    console.error(
      "Subscription STK error:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      500
    );
  }
});