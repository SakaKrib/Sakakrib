import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};
const URL = Deno.env.get("SUPABASE_URL");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON = Deno.env.get("SUPABASE_ANON_KEY");
const CLIENT = Deno.env.get("PAYPAL_CLIENT_ID");
const SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET");
const BASE = Deno.env.get("PAYPAL_BASE_URL") ?? "https://api-m.sandbox.paypal.com";
const admin = createClient(URL, SERVICE, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
const response = (body, status = 200)=>new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
async function token() {
  const r = await fetch(BASE + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(CLIENT + ":" + SECRET),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!r.ok) throw new Error("Unable to authenticate with PayPal");
  return (await r.json()).access_token;
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
  if (req.method !== "POST") return response({
    success: false,
    error: "Method not allowed"
  }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return response({
      success: false,
      error: "Authentication required"
    }, 401);
    const client = createClient(URL, ANON);
    const { data: { user }, error: userError } = await client.auth.getUser(auth.slice(7));
    if (userError || !user) return response({
      success: false,
      error: "Invalid authentication"
    }, 401);
    const { order_id, payment_intent_id } = await req.json();
    if (!order_id || !payment_intent_id) return response({
      success: false,
      error: "order_id and payment_intent_id are required"
    }, 400);
    const { data: intent, error: intentError } = await admin.from("listing_payment_intents").select("id,user_id,amount_kes,status,expires_at,paypal_order_id,provider_amount,provider_currency,paypal_fx_rate").eq("id", payment_intent_id).maybeSingle();
    if (intentError) throw intentError;
    if (!intent || intent.user_id !== user.id) return response({
      success: false,
      error: "Payment intent not found"
    }, 404);
    if (intent.status === "PAID") return response({
      success: true,
      status: "PAID",
      payment_intent_id: intent.id,
      listing_id: null,
      already_processed: true
    });
    if (intent.status !== "PENDING") return response({
      success: false,
      error: "Payment intent is not pending"
    }, 409);
    if (intent.paypal_order_id !== order_id) return response({
      success: false,
      error: "PayPal order does not match payment intent"
    }, 409);
    if (intent.expires_at && new Date(intent.expires_at) <= new Date()) return response({
      success: false,
      error: "Payment intent has expired"
    }, 409);
    if (!intent.provider_amount || intent.provider_currency !== "USD" || !intent.paypal_fx_rate) return response({
      success: false,
      error: "PayPal FX amount is missing"
    }, 409);
    const access = await token();
    const capture = await fetch(BASE + "/v2/checkout/orders/" + encodeURIComponent(order_id) + "/capture", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + access,
        "Content-Type": "application/json"
      }
    });
    const data = await capture.json();
    if (!capture.ok) {
      console.error("PayPal capture failed", data);
      return response({
        success: false,
        error: data.message ?? "PayPal capture failed"
      }, 400);
    }
    if (data.status !== "COMPLETED") return response({
      success: false,
      error: "PayPal payment is not completed",
      paypal_status: data.status
    }, 409);
    const unit = data.purchase_units?.[0];
    const captured = unit?.payments?.captures?.[0];
    const capturedAmount = Number(captured?.amount?.value);
    const currency = String(captured?.amount?.currency_code ?? "");
    const captureId = captured?.id;
    if (!captureId || currency !== "USD" || !Number.isFinite(capturedAmount) || Math.round(capturedAmount * 100) !== Math.round(Number(intent.provider_amount) * 100)) return response({
      success: false,
      error: "PayPal captured amount does not match payment intent"
    }, 409);
    const { data: result, error: processError } = await admin.rpc("process_listing_payment", {
      p_payment_id: crypto.randomUUID(),
      p_checkout_request_id: null,
      p_paid_amount: Number(intent.amount_kes),
      p_mpesa_receipt: null,
      p_merchant_request_id: null,
      p_phone_number: null,
      p_result_code: 0,
      p_result_description: "PayPal capture completed",
      p_provider: "PAYPAL",
      p_payment_method: "PAYPAL",
      p_provider_reference: captureId,
      p_payment_intent_id: intent.id,
      p_provider_amount: capturedAmount,
      p_provider_currency: "USD",
      p_paypal_order_id: order_id,
      p_paypal_fx_rate: Number(intent.paypal_fx_rate)
    });
    if (processError) {
      console.error("process_listing_payment failed", processError);
      return response({
        success: false,
        error: "Payment was captured but listing finalization failed; manual reconciliation is required"
      }, 500);
    }
    return response({
      success: true,
      status: result?.status ?? "PAID",
      payment_intent_id: intent.id,
      payment_id: result?.payment_id ?? null,
      listing_id: result?.listing_id ?? null,
      paypal_order_id: order_id,
      paypal_capture_id: captureId
    });
  } catch (e) {
    console.error("listing-payment-paypal-capture", e);
    return response({
      success: false,
      error: e instanceof Error ? e.message : "Internal server error"
    }, 500);
  }
});
