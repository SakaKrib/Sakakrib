import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface MpesaCallback {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: { Item?: Array<{ Name?: string; Value?: string | number }> };
    };
  };
}

function getMetadataValue(items: Array<{ Name?: string; Value?: string | number }> | undefined, name: string) {
  return items?.find((item) => item.Name === name)?.Value ?? null;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  try {
    const payload: MpesaCallback = await req.json();
    const callback = payload?.Body?.stkCallback;
    if (!callback) return jsonResponse({ success: false, error: "Invalid callback payload" }, 400);

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;
    if (!CheckoutRequestID) return jsonResponse({ success: false, error: "CheckoutRequestID missing" }, 400);

    const { data: intent, error: intentError } = await supabase
      .from("listing_payment_intents")
      .select("id, user_id, amount_kes, status, listing_data, provider_reference")
      .eq("provider_reference", CheckoutRequestID)
      .maybeSingle();

    if (intentError) throw new Error("Unable to find payment intent");
    if (!intent) return jsonResponse({ success: false, error: "Intent not found" });

    if (intent.status === "paid") return jsonResponse({ success: true, message: "Already processed" });

    if (ResultCode !== 0) {
      await supabase
        .from("listing_payment_intents")
        .update({ status: "failed" })
        .eq("id", intent.id);
      return jsonResponse({ success: true, status: "FAILED", result_code: ResultCode, result_description: ResultDesc ?? null });
    }

    const items = CallbackMetadata?.Item;
    const mpesaReceipt = getMetadataValue(items, "MpesaReceiptNumber");
    const paidAmount = getMetadataValue(items, "Amount");
    const phoneNumber = getMetadataValue(items, "PhoneNumber");

    if (!mpesaReceipt) return jsonResponse({ success: false, error: "Receipt missing" }, 400);
    if (paidAmount === null) return jsonResponse({ success: false, error: "Amount missing" }, 400);
    if (Number(paidAmount) !== Number(intent.amount_kes)) {
      await supabase.from("listing_payment_intents").update({ status: "failed" }).eq("id", intent.id);
      return jsonResponse({ success: false, error: "Amount mismatch" });
    }

    const listingId = (intent.listing_data as { listing_id?: string })?.listing_id;

    const { data: payment, error: paymentError } = await supabase
      .from("listing_payments")
      .insert({
        listing_id: listingId ?? null,
        user_id: intent.user_id,
        amount_kes: intent.amount_kes,
        mpesa_receipt: String(mpesaReceipt),
        checkout_request_id: CheckoutRequestID,
        phone_number: phoneNumber?.toString() ?? null,
        status: "paid",
        payment_provider: "mpesa",
        payment_method: "mpesa",
        paid_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (paymentError) throw new Error("Unable to record payment");

    await supabase.from("listing_payment_intents").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", intent.id);

    if (listingId) {
      await supabase.from("listings").update({ is_paid: true }).eq("id", listingId);
    }

    await supabase
      .from("profiles")
      .update({ free_listings_used: (await supabase.from("profiles").select("free_listings_used").eq("id", intent.user_id).maybeSingle()).data?.free_listings_used ?? 0 + 1 })
      .eq("id", intent.user_id);

    return jsonResponse({
      success: true,
      status: "PAID",
      intent_id: intent.id,
      payment_id: payment.id,
      mpesa_receipt: mpesaReceipt,
    });
  } catch (error) {
    console.error("listing-payment-callback error:", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      500
    );
  }
});
