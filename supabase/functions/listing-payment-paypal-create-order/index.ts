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
async function getToken() {
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
    const userClient = createClient(URL, ANON);
    const { data: { user }, error: userError } = await userClient.auth.getUser(auth.slice(7));
    if (userError || !user) return response({
      success: false,
      error: "Invalid authentication"
    }, 401);
    const { payment_intent_id } = await req.json();
    if (!payment_intent_id) return response({
      success: false,
      error: "payment_intent_id is required"
    }, 400);
    const { data: intent, error: intentError } = await admin.from("listing_payment_intents").select("id,user_id,amount_kes,status,expires_at,paypal_order_id,provider_amount,provider_currency,paypal_fx_rate").eq("id", payment_intent_id).maybeSingle();
    if (intentError) throw intentError;
    if (!intent || intent.user_id !== user.id) return response({
      success: false,
      error: "Payment intent not found"
    }, 404);
    if (intent.status !== "PENDING") return response({
      success: false,
      error: "Payment intent is not pending"
    }, 409);
    if (intent.expires_at && new Date(intent.expires_at) <= new Date()) return response({
      success: false,
      error: "Payment intent has expired"
    }, 409);
    if (Number(intent.amount_kes) !== 1000) return response({
      success: false,
      error: "Invalid individual listing amount"
    }, 409);
    if (intent.paypal_order_id && intent.provider_amount && intent.provider_currency) return response({
      success: true,
      order_id: intent.paypal_order_id,
      amount_kes: Number(intent.amount_kes),
      amount_usd: Number(intent.provider_amount),
      currency: intent.provider_currency,
      approval_url: null,
      reused: true
    });
    if (!intent.provider_amount || intent.provider_currency !== "USD" || !intent.paypal_fx_rate) return response({
      success: false,
      error: "Run individual listing PayPal FX conversion before creating the order"
    }, 409);
    const access = await getToken();
    const r = await fetch(BASE + "/v2/checkout/orders", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + access,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: Number(intent.provider_amount).toFixed(2)
            },
            description: "Saka Krib individual listing publication fee",
            custom_id: "listing:" + intent.id
          }
        ],
        application_context: {
          brand_name: "Saka Krib",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW"
        }
      })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("PayPal create listing order failed", data);
      return response({
        success: false,
        error: data.message ?? "PayPal rejected request"
      }, 400);
    }
    const orderId = data.id;
    if (!orderId) throw new Error("PayPal order ID missing");
    const { error: updateError } = await admin.from("listing_payment_intents").update({
      provider: "PAYPAL",
      paypal_order_id: orderId,
      provider_reference: orderId,
      updated_at: new Date().toISOString()
    }).eq("id", intent.id).eq("status", "PENDING");
    if (updateError) throw updateError;
    const approval = (data.links ?? []).find((x)=>x.rel === "approve")?.href ?? null;
    return response({
      success: true,
      order_id: orderId,
      amount_kes: Number(intent.amount_kes),
      amount_usd: Number(intent.provider_amount),
      currency: "USD",
      approval_url: approval
    });
  } catch (e) {
    console.error("listing-payment-paypal-create-order", e);
    return response({
      success: false,
      error: e instanceof Error ? e.message : "Internal server error"
    }, 500);
  }
});
