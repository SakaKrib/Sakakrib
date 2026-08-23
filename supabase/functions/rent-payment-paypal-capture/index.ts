import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID")!;
const PAYPAL_CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET")!;
const PAYPAL_BASE_URL = Deno.env.get("PAYPAL_BASE_URL") ?? "https://api-m.sandbox.paypal.com";
const PAYPAL_PARTNER_ATTRIBUTION_ID = Deno.env.get("PAYPAL_PARTNER_ATTRIBUTION_ID") ?? "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function paypalToken(): Promise<string> {
  const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("Unable to authenticate with PayPal");
  const data = await response.json();
  if (!data.access_token) throw new Error("PayPal access token missing");
  return data.access_token;
}

function base64url(value: string): string {
  return btoa(value).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function paypalAuthAssertion(merchantId: string): string {
  const header = base64url(JSON.stringify({ alg: "none" }));
  const payload = base64url(JSON.stringify({ iss: PAYPAL_CLIENT_ID, payer_id: merchantId }));
  return `${header}.${payload}.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ success: false, error: "Authentication required" }, 401);
    const accessToken = authHeader.slice("Bearer ".length);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !user) return json({ success: false, error: "Invalid authentication" }, 401);

    const body = await req.json();
    const orderId = String(body?.order_id ?? "");
    if (!orderId) return json({ success: false, error: "order_id is required" }, 400);

    const { data: intent, error: intentError } = await admin
      .from("rent_payment_intents")
      .select("id,renter_user_id,landlord_id,unit_id,amount_kes,paypal_order_id,provider_amount,provider_currency,status,payment_destination_snapshot")
      .eq("paypal_order_id", orderId)
      .maybeSingle();
    if (intentError) throw intentError;
    if (!intent) return json({ success: false, error: "Rent payment intent not found for PayPal order" }, 404);
    if (intent.renter_user_id !== user.id) return json({ success: false, error: "Order does not belong to caller" }, 403);
    if (intent.status === "PAID") return json({ success: true, idempotent: true, order_id: orderId, status: "PAID" });
    if (intent.status !== "PENDING") return json({ success: false, error: `Payment intent is ${intent.status}` }, 409);

    const merchantId = String(intent.payment_destination_snapshot?.merchant_id ?? "");
    if (!merchantId) return json({ success: false, error: "PayPal merchant connection is missing from the payment intent" }, 409);

    const { data: connection, error: connectionError } = await admin
      .from("landlord_paypal_connections")
      .select("merchant_id,status,payments_receivable,primary_email_confirmed,permissions_granted")
      .eq("landlord_user_id", intent.landlord_id)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection || connection.status !== "CONNECTED" || connection.merchant_id !== merchantId || !connection.payments_receivable || !connection.primary_email_confirmed || !connection.permissions_granted) {
      return json({ success: false, error: "Landlord PayPal merchant is not currently eligible" }, 409);
    }

    const token = await paypalToken();
    const authAssertion = paypalAuthAssertion(merchantId);
    const captureResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Auth-Assertion": authAssertion,
        "PayPal-Request-Id": crypto.randomUUID(),
        ...(PAYPAL_PARTNER_ATTRIBUTION_ID ? { "PayPal-Partner-Attribution-Id": PAYPAL_PARTNER_ATTRIBUTION_ID } : {}),
      },
      body: "{}",
    });
    const capture = await captureResponse.json();

    if (!captureResponse.ok && capture?.name !== "UNPROCESSABLE_ENTITY") {
      console.error("PayPal rent capture failed", capture);
      return json({ success: false, error: capture?.message ?? "PayPal capture failed" }, 400);
    }

    const purchaseUnit = capture?.purchase_units?.[0];
    const captureRecord = purchaseUnit?.payments?.captures?.[0];
    const captureStatus = String(captureRecord?.status ?? "").toUpperCase();
    const amountUsd = Number(captureRecord?.amount?.value ?? intent.provider_amount ?? 0);
    const currency = String(captureRecord?.amount?.currency_code ?? intent.provider_currency ?? "USD").toUpperCase();

    // Never mark rent paid here. The signed PayPal webhook remains authoritative.
    return json({
      success: captureResponse.ok || captureStatus === "COMPLETED",
      order_id: orderId,
      capture_id: captureRecord?.id ?? null,
      status: capture?.status ?? captureStatus ?? "PENDING",
      capture_status: captureStatus || null,
      amount_usd: amountUsd,
      currency,
      payment_intent_id: intent.id,
      rent_amount_kes: Number(intent.amount_kes),
      awaiting_webhook_confirmation: captureStatus === "COMPLETED" || capture?.status === "COMPLETED",
    }, captureResponse.ok || captureStatus === "COMPLETED" ? 200 : 400);
  } catch (error) {
    console.error("rent-payment-paypal-capture error", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
