import { createClient } from "npm:@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const LISTING_AMOUNT_KES = 1000;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body, status = 200)=>new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json"
    }
  });
// FIX: rate now comes from the shared, public exchange-rate function
// (cache-first, writes to exchange_rate_cache) instead of this
// function independently calling ExchangeRate-API with its own copy
// of the same logic. Any other function needing KES/USD (or any
// other pair) should call exchange-rate the same way, rather than
// duplicating this fetch again.
async function getKesUsdRate() {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/exchange-rate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      base: "KES",
      quote: "USD"
    })
  });
  const data = await response.json();
  if (!response.ok || !data.success || !Number.isFinite(Number(data.rate)) || Number(data.rate) <= 0) {
    console.error("exchange-rate call failed", data);
    throw new Error(data.error ?? "Unable to obtain current KES/USD exchange rate");
  }
  return {
    rate: Number(data.rate),
    source: data.source ?? "ExchangeRate-API"
  };
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: cors
  });
  if (req.method !== "POST") return json({
    success: false,
    error: "Method not allowed"
  }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({
      success: false,
      error: "Authentication required"
    }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: { user }, error: authError } = await userClient.auth.getUser(auth.slice(7));
    if (authError || !user) return json({
      success: false,
      error: "Invalid authentication"
    }, 401);
    const { payment_intent_id } = await req.json();
    if (!payment_intent_id) return json({
      success: false,
      error: "payment_intent_id is required"
    }, 400);
    const { data: intent, error } = await admin.from("listing_payment_intents").select("id,user_id,status,amount_kes,provider_amount,provider_currency,paypal_fx_rate,provider_reference,paypal_order_id,expires_at").eq("id", payment_intent_id).maybeSingle();
    if (error) throw error;
    if (!intent) return json({
      success: false,
      error: "Payment intent not found"
    }, 404);
    if (intent.user_id !== user.id) return json({
      success: false,
      error: "Payment intent does not belong to this user"
    }, 403);
    if (intent.status !== "PENDING") return json({
      success: false,
      error: `Payment intent is ${intent.status}`
    }, 409);
    if (Number(intent.amount_kes) !== LISTING_AMOUNT_KES) return json({
      success: false,
      error: "Invalid individual listing amount"
    }, 409);
    if (intent.expires_at && new Date(intent.expires_at) <= new Date()) return json({
      success: false,
      error: "Payment intent has expired"
    }, 409);
    if (intent.provider_amount && intent.provider_currency === "USD" && intent.paypal_fx_rate) {
      return json({
        success: true,
        payment_intent_id,
        amount_kes: Number(intent.amount_kes),
        amount_usd: Number(intent.provider_amount),
        currency: "USD",
        fx_rate: Number(intent.paypal_fx_rate),
        reused: true
      });
    }
    const { rate, source } = await getKesUsdRate();
    const usd = Math.round(LISTING_AMOUNT_KES * rate * 100) / 100;
    const { error: updateError } = await admin.from("listing_payment_intents").update({
      provider_amount: usd,
      provider_currency: "USD",
      paypal_fx_rate: rate,
      provider: "PAYPAL",
      updated_at: new Date().toISOString()
    }).eq("id", payment_intent_id).eq("status", "PENDING");
    if (updateError) throw updateError;
    return json({
      success: true,
      payment_intent_id,
      amount_kes: LISTING_AMOUNT_KES,
      amount_usd: usd,
      currency: "USD",
      fx_rate: rate,
      source,
      reused: false
    });
  } catch (e) {
    console.error("listing-payment-paypal-fx error", e);
    return json({
      success: false,
      error: e instanceof Error ? e.message : "Internal server error"
    }, 500);
  }
});
