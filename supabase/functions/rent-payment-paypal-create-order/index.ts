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
const FX_API_KEY = Deno.env.get("EXCHANGE_RATE_API_KEY") ?? Deno.env.get("EXCHANGE_RATES_API_KEY");
const FX_API_URL = Deno.env.get("EXCHANGE_RATE_API_URL") ??
  (FX_API_KEY ? `https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/KES` : "");

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

async function getKesToUsdRate(): Promise<number> {
  if (!FX_API_URL) throw new Error("Exchange-rate API is not configured");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (FX_API_KEY && !FX_API_URL.includes(FX_API_KEY)) headers["X-Api-Key"] = FX_API_KEY;
  const response = await fetch(FX_API_URL, { headers });
  if (!response.ok) throw new Error("Unable to retrieve KES/USD exchange rate");
  const data = await response.json();
  const rate = Number(data?.conversion_rates?.USD ?? data?.rates?.USD ?? data?.USD ?? data?.result?.USD);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Exchange-rate API returned an invalid KES/USD rate");
  return rate;
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
    const paymentIntentId = String(body?.payment_intent_id ?? "");
    const paymentMethodId = String(body?.payment_method_id ?? "");
    if (!paymentIntentId || !paymentMethodId) return json({ success: false, error: "payment_intent_id and payment_method_id are required" }, 400);

    const { data: intent, error: intentError } = await admin
      .from("rent_payment_intents")
      .select("id,renter_user_id,renter_assoc_id,unit_id,landlord_id,amount_kes,status,payment_periods,expires_at,payment_method_id,paypal_order_id")
      .eq("id", paymentIntentId)
      .maybeSingle();
    if (intentError) throw intentError;
    if (!intent) return json({ success: false, error: "Rent payment intent not found" }, 404);
    if (intent.renter_user_id !== user.id) return json({ success: false, error: "Payment intent does not belong to caller" }, 403);
    if (intent.status !== "PENDING") return json({ success: false, error: `Payment intent is ${intent.status}` }, 409);
    if (intent.expires_at && new Date(intent.expires_at).getTime() <= Date.now()) {
      await admin.from("rent_payment_intents").update({ status: "EXPIRED", updated_at: new Date().toISOString() }).eq("id", paymentIntentId);
      return json({ success: false, error: "Payment intent has expired" }, 409);
    }

    const { data: destination, error: destinationError } = await admin.rpc("get_rent_payment_destination", {
      p_payment_method_id: paymentMethodId,
      p_unit_id: intent.unit_id,
    });
    if (destinationError) throw destinationError;
    if (!destination || String(destination.provider).toUpperCase() !== "PAYPAL") return json({ success: false, error: "Selected payment method is not an authorized PayPal method" }, 400);

    const { data: connection, error: connectionError } = await admin
      .from("landlord_paypal_connections")
      .select("merchant_id,status,payments_receivable,primary_email_confirmed,permissions_granted,primary_email,legal_name")
      .eq("landlord_user_id", intent.landlord_id)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection || connection.status !== "CONNECTED" || !connection.merchant_id || !connection.payments_receivable || !connection.primary_email_confirmed || !connection.permissions_granted) {
      return json({ success: false, error: "Landlord PayPal account is not fully connected and eligible for rent payments" }, 409);
    }

    const fxRate = await getKesToUsdRate();
    const amountKes = Number(intent.amount_kes);
    const amountUsd = Number((amountKes * fxRate).toFixed(2));
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return json({ success: false, error: "Invalid converted PayPal amount" }, 400);

    const token = await paypalToken();
    const authAssertion = paypalAuthAssertion(connection.merchant_id);
    const requestId = crypto.randomUUID();
    const orderResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Auth-Assertion": authAssertion,
        "PayPal-Request-Id": requestId,
        ...(PAYPAL_PARTNER_ATTRIBUTION_ID ? { "PayPal-Partner-Attribution-Id": PAYPAL_PARTNER_ATTRIBUTION_ID } : {}),
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          amount: { currency_code: "USD", value: amountUsd.toFixed(2) },
          description: `SakaCrib rent - ${intent.payment_periods?.length ?? 1} payment period(s)`,
          custom_id: `RENT:${paymentIntentId}`,
          invoice_id: `SAKACRIB-RENT-${paymentIntentId}`,
          payee: { merchant_id: connection.merchant_id },
        }],
        application_context: {
          brand_name: "SakaCrib",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
        },
      }),
    });

    const order = await orderResponse.json();
    if (!orderResponse.ok || !order.id) {
      console.error("PayPal rent order creation failed", order);
      return json({ success: false, error: order?.message ?? "PayPal rejected the rent payment order" }, 400);
    }

    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from("rent_payment_intents")
      .update({
        payment_method_id: paymentMethodId,
        payment_method: "PAYPAL",
        provider: "PAYPAL",
        paypal_order_id: order.id,
        provider_amount: amountUsd,
        provider_currency: "USD",
        paypal_fx_rate: fxRate,
        payment_destination_snapshot: {
          provider: "PAYPAL",
          display_name: destination.display_name ?? connection.legal_name ?? null,
          merchant_id: connection.merchant_id,
          paypal_email_masked: connection.primary_email
            ? String(connection.primary_email).replace(/^(.{2}).*(@.*)$/, "$1••••$2")
            : null,
        },
        updated_at: now,
      })
      .eq("id", paymentIntentId)
      .eq("status", "PENDING");
    if (updateError) throw updateError;

    const approvalUrl = order.links?.find((link: { rel?: string }) => link.rel === "approve")?.href ?? null;
    return json({
      success: true,
      payment_intent_id: paymentIntentId,
      order_id: order.id,
      approval_url: approvalUrl,
      amount_kes: amountKes,
      amount_usd: amountUsd,
      fx_rate: fxRate,
      currency: "USD",
      status: order.status,
    });
  } catch (error) {
    console.error("rent-payment-paypal-create-order error", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
