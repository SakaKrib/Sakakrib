import "https://esm.sh/@supabase/functions-js@2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Mirrors subscription-stk's structure/M-Pesa mechanics, but for
// real estate. create_real_estate_subscription_checkout already
// correctly creates the PENDING_PAYMENT subscription row + PENDING
// invoice (using real_estate_subscription_id) in one transaction.
// This function drives the M-Pesa side on top of that.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({
      success: false,
      error: "Authentication required"
    }, 401);
    const accessToken = authHeader.slice(7);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
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
    if (billingCycle !== "MONTHLY" && billingCycle !== "ANNUAL") {
      return json({
        success: false,
        error: "billing_cycle must be MONTHLY or ANNUAL"
      }, 400);
    }
    const { data: profile, error: profileError } = await supabase.from("profiles").select("id, role, phone").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return json({
      success: false,
      error: "Profile not found"
    }, 404);
    if (profile.role !== "real_estate") {
      return json({
        success: false,
        error: "Only real estate accounts can purchase this subscription"
      }, 403);
    }
    // FIX: same as subscription-stk - accept an optional client-
    // supplied phone number, preferred over profile.phone when
    // present, falling back to profile.phone when left blank.
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
    const { data: checkoutRows, error: checkoutError } = await userClient.rpc("create_real_estate_subscription_checkout", {
      p_plan_id: planId,
      p_billing_cycle: billingCycle,
      p_phone_number: phone
    });
    if (checkoutError) {
      return json({
        success: false,
        error: checkoutError.message || "Unable to start subscription checkout"
      }, 400);
    }
    const checkout = Array.isArray(checkoutRows) ? checkoutRows[0] : checkoutRows;
    if (!checkout?.invoice_id) throw new Error("Checkout did not return an invoice");
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
        Amount: Math.round(Number(checkout.amount_kes)),
        PartyA: phone,
        PartyB: Number(MPESA_SHORTCODE),
        PhoneNumber: phone,
        CallBackURL: MPESA_CALLBACK_URL,
        AccountReference: `SAKACRIB-${String(checkout.invoice_id).slice(0, 8)}`,
        TransactionDesc: `Saka Crib PMS ${checkout.plan_name} ${checkout.billing_cycle}`
      })
    });
    const data = await response.json();
    if (!response.ok || data.ResponseCode && data.ResponseCode !== "0") {
      // FIX: log the actual Safaricom response before returning the
      // fallback error, same as subscription-stk.
      console.error("M-Pesa STK request rejected (real estate)", {
        status: response.status,
        data
      });
      await supabase.from("subscription_invoices").update({
        status: "FAILED",
        result_code: data.ResponseCode ? Number(data.ResponseCode) : null,
        result_description: data.ResponseDescription ?? "M-Pesa STK request failed"
      }).eq("id", checkout.invoice_id);
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
    }).eq("id", checkout.invoice_id);
    if (updateError) throw updateError;
    return json({
      success: true,
      invoice_id: checkout.invoice_id,
      subscription_id: checkout.subscription_id,
      plan: checkout.plan_name,
      billing_cycle: checkout.billing_cycle,
      amount_kes: Number(checkout.amount_kes),
      checkout_request_id: data.CheckoutRequestID,
      merchant_request_id: data.MerchantRequestID ?? null,
      customer_message: data.CustomerMessage ?? "Please complete the M-Pesa payment on your phone."
    });
  } catch (e) {
    console.error("Real estate subscription STK error", e);
    return json({
      success: false,
      error: e instanceof Error ? e.message : "Internal server error"
    }, 500);
  }
});
