import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const MPESA_CONSUMER_KEY = Deno.env.get("MPESA_CONSUMER_KEY");
const MPESA_CONSUMER_SECRET = Deno.env.get("MPESA_CONSUMER_SECRET");
const MPESA_SHORTCODE = Deno.env.get("MPESA_SHORTCODE");
const MPESA_PASSKEY = Deno.env.get("MPESA_PASSKEY");
const MPESA_ENVIRONMENT = Deno.env.get("MPESA_ENVIRONMENT") ?? "sandbox";
const MPESA_CALLBACK_URL = Deno.env.get("MPESA_CALLBACK_URL");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
async function getMpesaAccessToken() {
  const credentials = btoa(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`);
  const baseUrl = MPESA_ENVIRONMENT === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${credentials}`
    }
  });
  if (!response.ok) throw new Error("Unable to authenticate with M-Pesa");
  const data = await response.json();
  if (!data.access_token) throw new Error("M-Pesa access token missing");
  return data.access_token;
}
function generateTimestamp() {
  const now = new Date();
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0")
  ].join("");
}
function normalizeKenyanPhone(phone) {
  const value = phone.trim().replace(/\s+/g, "");
  if (value.startsWith("+254")) return value.substring(1);
  if (value.startsWith("254")) return value;
  if (value.startsWith("07") || value.startsWith("01")) return `254${value.substring(1)}`;
  throw new Error("Invalid Kenyan phone number");
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
  if (req.method !== "POST") return jsonResponse({
    success: false,
    error: "Method not allowed"
  }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({
      success: false,
      error: "Authentication required"
    }, 401);
    const accessToken = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !user) return jsonResponse({
      success: false,
      error: "Invalid authentication"
    }, 401);
    const body = await req.json();
    const { payment_intent_id } = body;
    if (!payment_intent_id) return jsonResponse({
      success: false,
      error: "payment_intent_id is required"
    }, 400);
    const { data: intent, error: intentError } = await supabase.from("listing_payment_intents").select("id, user_id, role, amount_kes, status, expires_at, provider_reference").eq("id", payment_intent_id).maybeSingle();
    if (intentError) throw new Error("Unable to load payment intent");
    if (!intent) return jsonResponse({
      success: false,
      error: "Payment intent not found"
    }, 404);
    if (intent.user_id !== user.id) return jsonResponse({
      success: false,
      error: "Not your payment intent"
    }, 403);
    if (intent.status !== "PENDING") return jsonResponse({
      success: false,
      error: `Payment intent is ${intent.status.toLowerCase()}`
    }, 409);
    if (intent.expires_at && new Date(intent.expires_at).getTime() <= Date.now()) {
      await supabase.from("listing_payment_intents").update({
        status: "EXPIRED",
        updated_at: new Date().toISOString()
      }).eq("id", intent.id).eq("status", "PENDING");
      return jsonResponse({
        success: false,
        error: "Payment intent has expired"
      }, 409);
    }
    const { data: profile, error: profileError } = await supabase.from("profiles").select("id, role, phone").eq("id", user.id).maybeSingle();
    if (profileError) throw new Error("Unable to load profile");
    if (!profile) return jsonResponse({
      success: false,
      error: "Profile not found"
    }, 404);
    if (!profile.phone) return jsonResponse({
      success: false,
      error: "Profile phone number required"
    }, 400);
    const amount = Number(intent.amount_kes);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid payment intent amount");
    const phoneNumber = normalizeKenyanPhone(profile.phone);
    const token = await getMpesaAccessToken();
    const baseUrl = MPESA_ENVIRONMENT === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
    const timestamp = generateTimestamp();
    const password = btoa(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`);
    const stkResponse = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        BusinessShortCode: Number(MPESA_SHORTCODE),
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(amount),
        PartyA: phoneNumber,
        PartyB: Number(MPESA_SHORTCODE),
        PhoneNumber: phoneNumber,
        CallBackURL: MPESA_CALLBACK_URL,
        AccountReference: `SAKACRIB-${intent.id.substring(0, 8)}`,
        TransactionDesc: "Saka Krib listing fee"
      })
    });
    const stkData = await stkResponse.json();
    if (!stkResponse.ok || stkData.ResponseCode && stkData.ResponseCode !== "0") return jsonResponse({
      success: false,
      error: stkData.ResponseDescription ?? "M-Pesa request failed"
    }, 400);
    const checkoutRequestId = stkData.CheckoutRequestID;
    if (!checkoutRequestId) throw new Error("M-Pesa did not return CheckoutRequestID");
    await supabase.from("listing_payment_intents").update({
      provider: "MPESA",
      provider_reference: checkoutRequestId,
      updated_at: new Date().toISOString()
    }).eq("id", intent.id).eq("status", "PENDING");
    return jsonResponse({
      success: true,
      message: "M-Pesa payment request sent",
      intent_id: intent.id,
      checkout_request_id: checkoutRequestId,
      amount_kes: amount,
      customer_message: stkData.CustomerMessage ?? "Complete the M-Pesa payment on your phone."
    });
  } catch (error) {
    console.error("listing-payment-stk error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    }, 500);
  }
});
