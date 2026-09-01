import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const CONSUMER_KEY = Deno.env.get("MPESA_CONSUMER_KEY");
const CONSUMER_SECRET = Deno.env.get("MPESA_CONSUMER_SECRET");
const SHORTCODE = Deno.env.get("MPESA_SHORTCODE");
const PASSKEY = Deno.env.get("MPESA_PASSKEY");
const ENVIRONMENT = Deno.env.get("MPESA_ENVIRONMENT") ?? "sandbox";
const CALLBACK_URL = Deno.env.get("MPESA_MOVING_CALLBACK_URL") ?? Deno.env.get("MPESA_CALLBACK_URL");
const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
const baseUrl = ENVIRONMENT === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
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
function normalizePhone(value) {
  const x = value.trim().replace(/\s+/g, "");
  if (x.startsWith("+254")) return x.slice(1);
  if (x.startsWith("254")) return x;
  if (x.startsWith("07") || x.startsWith("01")) return "254" + x.slice(1);
  throw new Error("Invalid Kenyan phone number");
}
function timestamp() {
  const d = new Date();
  return String(d.getUTCFullYear()) + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0") + String(d.getUTCHours()).padStart(2, "0") + String(d.getUTCMinutes()).padStart(2, "0") + String(d.getUTCSeconds()).padStart(2, "0");
}
async function getToken() {
  const credentials = btoa(CONSUMER_KEY + ":" + CONSUMER_SECRET);
  const response = await fetch(baseUrl + "/oauth/v1/generate?grant_type=client_credentials", {
    method: "GET",
    headers: {
      Authorization: "Basic " + credentials
    }
  });
  if (!response.ok) throw new Error("Unable to authenticate with M-Pesa");
  const data = await response.json();
  if (!data.access_token) throw new Error("M-Pesa access token missing");
  return data.access_token;
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    status: 200,
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
    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { data: { user }, error: authError } = await client.auth.getUser(auth.slice(7));
    if (authError || !user) return json({
      success: false,
      error: "Invalid authentication"
    }, 401);
    const { booking_id } = await req.json();
    if (!booking_id) return json({
      success: false,
      error: "booking_id is required"
    }, 400);
    const { data: booking, error: bookingError } = await db.from("bookings").select("id,renter_id,total_amount,status,payment_status").eq("id", booking_id).maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking || booking.renter_id !== user.id) return json({
      success: false,
      error: "Booking not found"
    }, 404);
    if (booking.status !== "confirmed") return json({
      success: false,
      error: "Booking must be confirmed before payment"
    }, 409);
    if (booking.payment_status === "paid") return json({
      success: false,
      error: "Booking is already paid"
    }, 409);
    const { data: invoice, error: invoiceError } = await db.from("moving_invoices").select("id,invoice_number,amount_kes").eq("booking_id", booking_id).maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice || Number(invoice.amount_kes) !== Number(booking.total_amount)) return json({
      success: false,
      error: "Valid moving invoice is required"
    }, 409);
    const { data: profile, error: profileError } = await db.from("profiles").select("phone").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.phone) return json({
      success: false,
      error: "Profile phone number required"
    }, 400);
    const { data: existing, error: existingError } = await db.from("moving_payments").select("id,status,provider,provider_reference").eq("booking_id", booking_id).in("status", [
      "PENDING",
      "PROCESSING",
      "HELD"
    ]).order("created_at", {
      ascending: false
    }).limit(1).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "HELD") return json({
      success: false,
      error: "Payment is already held"
    }, 409);
    if (existing && existing.provider !== "MPESA") return json({
      success: false,
      error: "An active payment attempt exists for another provider"
    }, 409);
    const amount = Number(booking.total_amount);
    if (!Number.isFinite(amount) || amount <= 0) return json({
      success: false,
      error: "Invalid booking amount"
    }, 409);
    const token = await getToken();
    const time = timestamp();
    const password = btoa(SHORTCODE + PASSKEY + time);
    const response = await fetch(baseUrl + "/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        BusinessShortCode: Number(SHORTCODE),
        Password: password,
        Timestamp: time,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(amount),
        PartyA: normalizePhone(profile.phone),
        PartyB: Number(SHORTCODE),
        PhoneNumber: normalizePhone(profile.phone),
        CallBackURL: CALLBACK_URL,
        AccountReference: "SAKACRIB-MOV-" + booking_id.slice(0, 8),
        TransactionDesc: "Saka Krib moving service " + invoice.invoice_number
      })
    });
    const data = await response.json();
    if (!response.ok || data.ResponseCode && data.ResponseCode !== "0") return json({
      success: false,
      error: data.ResponseDescription ?? "M-Pesa request failed"
    }, 400);
    const checkout = data.CheckoutRequestID;
    if (!checkout) throw new Error("M-Pesa did not return CheckoutRequestID");
    if (existing) {
      const { error } = await db.from("moving_payments").update({
        provider: "MPESA",
        provider_reference: checkout,
        provider_amount: amount,
        provider_currency: "KES",
        status: "PROCESSING",
        updated_at: new Date().toISOString()
      }).eq("id", existing.id).in("status", [
        "PENDING",
        "PROCESSING"
      ]);
      if (error) throw error;
    } else {
      const { error } = await db.from("moving_payments").insert({
        booking_id,
        invoice_id: invoice.id,
        payer_id: user.id,
        amount_kes: amount,
        provider: "MPESA",
        status: "PROCESSING",
        provider_reference: checkout,
        provider_amount: amount,
        provider_currency: "KES"
      });
      if (error) throw error;
    }
    return json({
      success: true,
      booking_id,
      checkout_request_id: checkout,
      amount_kes: amount,
      status: "PROCESSING",
      customer_message: data.CustomerMessage ?? "Complete the M-Pesa payment on your phone."
    });
  } catch (error) {
    console.error("moving-payment-stk error", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    }, 500);
  }
});
