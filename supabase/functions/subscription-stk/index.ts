import "https://esm.sh/@supabase/functions-js@2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MPESA_CONSUMER_KEY = Deno.env.get("MPESA_CONSUMER_KEY");
const MPESA_CONSUMER_SECRET = Deno.env.get("MPESA_CONSUMER_SECRET");
const MPESA_SHORTCODE = Deno.env.get("MPESA_SHORTCODE");
const MPESA_PASSKEY = Deno.env.get("MPESA_PASSKEY");
const MPESA_ENVIRONMENT = Deno.env.get("MPESA_ENVIRONMENT") ?? "sandbox";
const MPESA_CALLBACK_URL = Deno.env.get("MPESA_CALLBACK_URL");
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const json = (body, status = 200)=>new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
function normalizePhone(phone) {
  const v = phone.trim().replace(/\s+/g, "");
  if (v.startsWith("+254")) return v.slice(1);
  if (v.startsWith("254")) return v;
  if (v.startsWith("07") || v.startsWith("01")) return `254${v.slice(1)}`;
  throw new Error("Invalid Kenyan phone number");
}
function timestamp() {
  const d = new Date();
  const p = (n)=>String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}
async function mpesaToken() {
  const credentials = btoa(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`);
  const base = MPESA_ENVIRONMENT === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const r = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: {
      Authorization: `Basic ${credentials}`
    }
  });
  if (!r.ok) throw new Error("Unable to authenticate with M-Pesa");
  const d = await r.json();
  if (!d.access_token) throw new Error("M-Pesa access token missing");
  return {
    token: d.access_token,
    base
  };
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: corsHeaders
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
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY"));
    const { data: { user }, error: userError } = await userClient.auth.getUser(auth.slice(7));
    if (userError || !user) return json({
      success: false,
      error: "Invalid authentication"
    }, 401);
    const body = await req.json();
    const planId = String(body.plan_id ?? "").trim();
    const billingCycle = body.billing_cycle;
    if (!planId) return json({
      success: false,
      error: "plan_id is required"
    }, 400);
    if (billingCycle !== "MONTHLY" && billingCycle !== "ANNUAL") return json({
      success: false,
      error: "billing_cycle must be MONTHLY or ANNUAL"
    }, 400);
    const { data: profile, error: profileError } = await supabase.from("profiles").select("id,role,phone").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return json({
      success: false,
      error: "Profile not found"
    }, 404);
    if (profile.role !== "landlord") return json({
      success: false,
      error: "Only landlords can purchase PMS subscriptions"
    }, 403);
    const rawPhoneInput = typeof body.phone_number === "string" && body.phone_number.trim() ? body.phone_number.trim() : null;
    const rawPhone = rawPhoneInput ?? profile.phone;
    if (!rawPhone) return json({
      success: false,
      error: "Enter a phone number to receive the M-Pesa prompt."
    }, 400);
    let phone;
    try {
      phone = normalizePhone(rawPhone);
    } catch  {
      return json({
        success: false,
        error: "That doesn't look like a valid Kenyan phone number (e.g. 07XXXXXXXX)."
      }, 400);
    }
    const { data: plan, error: planError } = await supabase.from("subscription_plans").select("id,name,max_listings,max_units_per_listing,monthly_price_kes,annual_price_kes").eq("id", planId).maybeSingle();
    if (planError) throw planError;
    if (!plan) return json({
      success: false,
      error: "Subscription plan not found"
    }, 404);
    const amount = billingCycle === "MONTHLY" ? Number(plan.monthly_price_kes) : Number(plan.annual_price_kes);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid subscription price");
    const { data: existing, error: existingError } = await supabase.from("landlord_subscriptions").select("id,status").eq("landlord_id", user.id).in("status", [
      "PENDING_PAYMENT",
      "ACTIVE",
      "GRACE_PERIOD"
    ]).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "ACTIVE") return json({
      success: false,
      error: "Your PMS subscription is already active"
    }, 409);
    let subscriptionId = existing?.id;
    if (!subscriptionId) {
      const now = new Date();
      const end = new Date(now.getTime() + 60_000);
      const { data: created, error } = await supabase.from("landlord_subscriptions").insert({
        landlord_id: user.id,
        plan_id: plan.id,
        billing_cycle: billingCycle,
        status: "PENDING_PAYMENT",
        current_period_start: now.toISOString(),
        current_period_end: end.toISOString(),
        grace_period_end: null,
        auto_renew: false
      }).select("id").single();
      if (error) throw error;
      subscriptionId = created.id;
    } else {
      const { error } = await supabase.from("landlord_subscriptions").update({
        plan_id: plan.id,
        billing_cycle: billingCycle,
        status: "PENDING_PAYMENT",
        grace_period_end: null,
        updated_at: new Date().toISOString()
      }).eq("id", subscriptionId);
      if (error) throw error;
    }
    const { data: invoice, error: invoiceError } = await supabase.from("subscription_invoices").insert({
      landlord_subscription_id: subscriptionId,
      amount_kes: amount,
      status: "PENDING",
      payment_provider: "MPESA"
    }).select("id,amount_kes").single();
    if (invoiceError) throw invoiceError;
    const { token, base } = await mpesaToken();
    const ts = timestamp();
    const password = btoa(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${ts}`);
    const response = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        BusinessShortCode: Number(MPESA_SHORTCODE),
        Password: password,
        Timestamp: ts,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(amount),
        PartyA: phone,
        PartyB: Number(MPESA_SHORTCODE),
        PhoneNumber: phone,
        CallBackURL: MPESA_CALLBACK_URL,
        AccountReference: `SAKACRIB-${invoice.id.slice(0, 8)}`,
        TransactionDesc: `Saka Crib PMS ${plan.name} ${billingCycle}`
      })
    });
    const data = await response.json();
    if (!response.ok || data.ResponseCode && data.ResponseCode !== "0") {
      console.error("M-Pesa STK request rejected", {
        status: response.status,
        data
      });
      await supabase.from("subscription_invoices").update({
        status: "FAILED",
        result_code: data.ResponseCode ? Number(data.ResponseCode) : null,
        result_description: data.ResponseDescription ?? "M-Pesa STK request failed"
      }).eq("id", invoice.id);
      return json({
        success: false,
        error: data.ResponseDescription ?? data.errorMessage ?? "Unable to initiate M-Pesa payment"
      }, 400);
    }
    if (!data.CheckoutRequestID) throw new Error("M-Pesa did not return CheckoutRequestID");
    const { error: updateError } = await supabase.from("subscription_invoices").update({
      checkout_request_id: data.CheckoutRequestID,
      merchant_request_id: data.MerchantRequestID ?? null,
      phone_number: phone
    }).eq("id", invoice.id);
    if (updateError) throw updateError;
    return json({
      success: true,
      invoice_id: invoice.id,
      subscription_id: subscriptionId,
      plan: plan.name,
      billing_cycle: billingCycle,
      amount_kes: amount,
      checkout_request_id: data.CheckoutRequestID,
      merchant_request_id: data.MerchantRequestID ?? null,
      customer_message: data.CustomerMessage ?? "Please complete the M-Pesa payment on your phone."
    });
  } catch (e) {
    console.error("Subscription STK error", e);
    return json({
      success: false,
      error: e instanceof Error ? e.message : "Internal server error"
    }, 500);
  }
});
