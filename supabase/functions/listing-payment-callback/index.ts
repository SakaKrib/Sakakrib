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
      CallbackMetadata?: {
        Item?: Array<{ Name?: string; Value?: string | number }>;
      };
    };
  };
}

function getMetadataValue(
  items: Array<{ Name?: string; Value?: string | number }> | undefined,
  name: string
) {
  return items?.find((item) => item.Name === name)?.Value ?? null;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const payload: MpesaCallback = await req.json();
    const callback = payload?.Body?.stkCallback;

    if (!callback) {
      return jsonResponse({ success: false, error: "Invalid callback payload" }, 400);
    }

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = callback;

    if (!CheckoutRequestID) {
      return jsonResponse({ success: false, error: "CheckoutRequestID missing" }, 400);
    }

    const { data: intent, error: intentError } = await supabase
      .from("listing_payment_intents")
      .select("id, user_id, amount_kes, status, provider_reference")
      .eq("provider_reference", CheckoutRequestID)
      .maybeSingle();

    if (intentError) throw new Error("Unable to find payment intent");

    if (!intent) {
      return jsonResponse({ success: false, error: "Intent not found" }, 404);
    }

    if (intent.status === "PAID") {
      return jsonResponse({ success: true, status: "PAID", message: "Already processed" });
    }

    if (ResultCode !== 0) {
      await supabase
        .from("listing_payment_intents")
        .update({
          status: "FAILED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", intent.id)
        .eq("status", "PENDING");

      return jsonResponse({
        success: true,
        status: "FAILED",
        result_code: ResultCode ?? null,
        result_description: ResultDesc ?? null,
      });
    }

    const items = CallbackMetadata?.Item;
    const mpesaReceipt = getMetadataValue(items, "MpesaReceiptNumber");
    const paidAmount = getMetadataValue(items, "Amount");
    const phoneNumber = getMetadataValue(items, "PhoneNumber");

    if (!mpesaReceipt) {
      return jsonResponse({ success: false, error: "M-Pesa receipt missing" }, 400);
    }

    if (paidAmount === null) {
      return jsonResponse({ success: false, error: "Payment amount missing" }, 400);
    }

    if (Number(paidAmount) !== Number(intent.amount_kes)) {
      await supabase
        .from("listing_payment_intents")
        .update({
          status: "FAILED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", intent.id)
        .eq("status", "PENDING");

      return jsonResponse({ success: false, error: "Amount mismatch" }, 400);
    }

    // All authoritative payment processing happens inside the protected
    // SECURITY DEFINER RPC. The callback never inserts a payment or listing
    // directly, and never changes a listing based only on client state.
    const { data: result, error: processError } = await supabase.rpc(
      "process_listing_payment",
      {
        p_payment_id: crypto.randomUUID(),
        p_checkout_request_id: CheckoutRequestID,
        p_paid_amount: Number(paidAmount),
        p_mpesa_receipt: String(mpesaReceipt),
        p_merchant_request_id: MerchantRequestID ?? null,
        p_phone_number: phoneNumber?.toString() ?? null,
        p_result_code: ResultCode ?? 0,
        p_result_description: ResultDesc ?? null,
        p_provider: "MPESA",
        p_payment_method: "MPESA",
        p_provider_reference: CheckoutRequestID,
        p_payment_intent_id: intent.id,
      }
    );

    if (processError) {
      console.error("process_listing_payment failed:", processError);
      throw new Error(processError.message || "Unable to finalize listing payment");
    }

    return jsonResponse({
      success: true,
      status: result?.status ?? "PAID",
      intent_id: intent.id,
      payment_id: result?.payment_id ?? null,
      listing_id: result?.listing_id ?? null,
      mpesa_receipt: mpesaReceipt,
    });
  } catch (error) {
    console.error("listing-payment-callback error:", error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      500
    );
  }
});
