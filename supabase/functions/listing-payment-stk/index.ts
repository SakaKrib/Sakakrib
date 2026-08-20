import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MPESA_CONSUMER_KEY = Deno.env.get("MPESA_CONSUMER_KEY")!;
const MPESA_CONSUMER_SECRET = Deno.env.get("MPESA_CONSUMER_SECRET")!;
const MPESA_SHORTCODE = Deno.env.get("MPESA_SHORTCODE")!;
const MPESA_PASSKEY = Deno.env.get("MPESA_PASSKEY")!;
const MPESA_ENVIRONMENT = Deno.env.get("MPESA_ENVIRONMENT") ?? "sandbox";
const MPESA_CALLBACK_URL = Deno.env.get("MPESA_CALLBACK_URL")!;

const LISTING_FEE_KES = 1000;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getMpesaAccessToken(): Promise<string> {
  const credentials = btoa(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`);
  const baseUrl = MPESA_ENVIRONMENT === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: "GET",
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!response.ok) throw new Error("Unable to authenticate with M-Pesa");
  const data = await response.json();
  if (!data.access_token) throw new Error("M-Pesa access token missing");
  return data.access_token;
}

function generateTimestamp(): string {
  const now = new Date();
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ].join("");
}

function normalizeKenyanPhone(phone: string): string {
  let value = phone.trim().replace(/\s+/g, "");
  if (value.startsWith("+254")) return value.substring(1);
  if (value.startsWith("254")) return value;
  if (value.startsWith("07") || value.startsWith("01")) return `254${value.substring(1)}`;
  throw new Error("Invalid Kenyan phone number");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "Authentication required" }, 401);
    }
    const accessToken = authHeader.replace("Bearer ", "");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !user) return jsonResponse({ success: false, error: "Invalid authentication" }, 401);

    const body = await req.json();
    const { listing_id } = body as { listing_id?: string };

    if (!listing_id) return jsonResponse({ success: false, error: "listing_id is required" }, 400);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, phone, free_listings_used, is_agency")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw new Error("Unable to load profile");
    if (!profile) return jsonResponse({ success: false, error: "Profile not found" }, 404);
    if (!profile.phone) return jsonResponse({ success: false, error: "Profile phone number required" }, 400);

    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("id, user_id, title, price_kes, is_paid, approval_status")
      .eq("id", listing_id)
      .maybeSingle();

    if (listingError) throw new Error("Unable to load listing");
    if (!listing) return jsonResponse({ success: false, error: "Listing not found" }, 404);
    if (listing.user_id !== user.id) return jsonResponse({ success: false, error: "Not your listing" }, 403);
    if (listing.is_paid) return jsonResponse({ success: false, error: "Listing already paid" }, 409);

    const isAgency = profile.is_agency === true;
    const freeLimit = 3;
    const needsPayment = !isAgency && (profile.free_listings_used ?? 0) >= freeLimit;

    if (!needsPayment) {
      await supabase
        .from("profiles")
        .update({ free_listings_used: (profile.free_listings_used ?? 0) + 1 })
        .eq("id", user.id);
      return jsonResponse({
        success: true,
        free_listing: true,
        message: "Free listing activated",
      });
    }

    const amount = LISTING_FEE_KES;

    const { data: intent, error: intentError } = await supabase
      .from("listing_payment_intents")
      .insert({
        user_id: user.id,
        role: profile.role ?? "landlord",
        amount_kes: amount,
        status: "pending",
        provider: "mpesa",
        listing_data: { listing_id },
      })
      .select("id")
      .single();

    if (intentError) throw new Error("Unable to create payment intent");

    const phoneNumber = normalizeKenyanPhone(profile.phone);
    const token = await getMpesaAccessToken();
    const baseUrl = MPESA_ENVIRONMENT === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
    const timestamp = generateTimestamp();
    const password = btoa(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`);

    const stkResponse = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
        TransactionDesc: `Saka Krib listing fee`,
      }),
    });

    const stkData = await stkResponse.json();

    if (!stkResponse.ok || (stkData.ResponseCode && stkData.ResponseCode !== "0")) {
      await supabase.from("listing_payment_intents").update({ status: "failed" }).eq("id", intent.id);
      return jsonResponse(
        { success: false, error: stkData.ResponseDescription ?? "M-Pesa request failed" },
        400
      );
    }

    const checkoutRequestId = stkData.CheckoutRequestID;
    if (!checkoutRequestId) {
      await supabase.from("listing_payment_intents").update({ status: "failed" }).eq("id", intent.id);
      throw new Error("M-Pesa did not return CheckoutRequestID");
    }

    await supabase
      .from("listing_payment_intents")
      .update({ provider_reference: checkoutRequestId })
      .eq("id", intent.id);

    return jsonResponse({
      success: true,
      message: "M-Pesa payment request sent",
      intent_id: intent.id,
      checkout_request_id: checkoutRequestId,
      amount_kes: amount,
      customer_message: stkData.CustomerMessage ?? "Complete the M-Pesa payment on your phone.",
    });
  } catch (error) {
    console.error("listing-payment-stk error:", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      500
    );
  }
});
