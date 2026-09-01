import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
const json = (body, status = 200)=>new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
const value = (items, name)=>items?.find((x)=>x.Name === name)?.Value ?? null;
Deno.serve(async (req)=>{
  if (req.method !== "POST") return json({
    success: false,
    error: "Method not allowed"
  }, 405);
  try {
    const payload = await req.json();
    const callback = payload?.Body?.stkCallback;
    const checkoutRequestId = callback?.CheckoutRequestID;
    const merchantRequestId = callback?.MerchantRequestID ?? null;
    const resultCode = callback?.ResultCode;
    const resultDescription = callback?.ResultDesc ?? null;
    if (!checkoutRequestId) return json({
      success: false,
      error: "CheckoutRequestID missing"
    }, 400);
    if (typeof resultCode !== "number") return json({
      success: false,
      error: "ResultCode missing"
    }, 400);
    const { data: intent, error: lookupError } = await db.from("rent_payment_intents").select("id, amount_kes, status, renter_user_id, unit_id, renter_assoc_id").eq("checkout_request_id", checkoutRequestId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!intent) return json({
      success: true,
      status: "IGNORED",
      message: "Rent payment intent not found"
    });
    if (intent.status === "PAID") {
      return json({
        success: true,
        status: "PAID",
        already_processed: true,
        payment_intent_id: intent.id
      });
    }
    if (resultCode !== 0) {
      const { error } = await db.from("rent_payment_intents").update({
        result_code: resultCode,
        result_description: resultDescription,
        merchant_request_id: merchantRequestId,
        status: "FAILED",
        updated_at: new Date().toISOString()
      }).eq("id", intent.id).in("status", [
        "PENDING",
        "PROCESSING"
      ]);
      if (error) throw error;
      return json({
        success: true,
        status: "FAILED",
        payment_intent_id: intent.id,
        result_code: resultCode
      });
    }
    const items = callback?.CallbackMetadata?.Item;
    const receipt = value(items, "MpesaReceiptNumber");
    const amount = value(items, "Amount");
    const phone = value(items, "PhoneNumber");
    if (receipt === null || amount === null) return json({
      success: false,
      error: "Successful callback missing receipt or amount"
    }, 400);
    if (Number(amount) <= 0 || Number(amount) !== Number(intent.amount_kes)) {
      await db.from("rent_payment_intents").update({
        status: "FAILED",
        result_code: resultCode,
        result_description: "M-Pesa payment amount does not match rent payment intent",
        merchant_request_id: merchantRequestId,
        phone_number: phone === null ? null : String(phone),
        updated_at: new Date().toISOString()
      }).eq("id", intent.id).in("status", [
        "PENDING",
        "PROCESSING"
      ]);
      return json({
        success: false,
        error: "Payment amount mismatch"
      }, 400);
    }
    const { data: result, error: processError } = await db.rpc("process_rent_payment", {
      p_payment_intent_id: intent.id,
      p_provider: "MPESA",
      p_payment_method: "MPESA",
      p_paid_amount: Number(amount),
      p_provider_reference: checkoutRequestId,
      p_provider_amount: Number(amount),
      p_provider_currency: "KES",
      p_mpesa_receipt: String(receipt),
      p_checkout_request_id: checkoutRequestId,
      p_merchant_request_id: merchantRequestId,
      p_phone_number: phone === null ? null : String(phone),
      p_result_code: resultCode,
      p_result_description: resultDescription
    });
    if (processError) throw processError;
    return json({
      success: true,
      status: result?.success ? "PAID" : "PROCESSED",
      payment_intent_id: intent.id,
      result
    });
  } catch (error) {
    console.error("rent-payment-callback error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    }, 500);
  }
});
