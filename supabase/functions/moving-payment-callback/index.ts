import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(url, key, {
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
const val = (items, name)=>items?.find((x)=>x.Name === name)?.Value ?? null;
Deno.serve(async (req)=>{
  if (req.method !== "POST") return json({
    success: false,
    error: "POST required"
  }, 405);
  try {
    const payload = await req.json();
    const c = payload?.Body?.stkCallback;
    const checkout = c?.CheckoutRequestID;
    if (!checkout || typeof c?.ResultCode !== "number") return json({
      success: false,
      error: "Invalid M-Pesa callback payload"
    }, 400);
    const { data: payments, error: lookupError } = await db.from("moving_payments").select("id,booking_id,status,amount_kes,provider_reference,invoice_id").eq("provider", "MPESA").eq("provider_reference", checkout).limit(1);
    if (lookupError) throw lookupError;
    const existing = payments?.[0];
    if (!existing) return json({
      success: true,
      status: "IGNORED",
      message: "Moving payment not found"
    });
    if ([
      "HELD",
      "RELEASED",
      "PAID"
    ].includes(existing.status)) return json({
      success: true,
      status: existing.status,
      already_processed: true,
      payment_id: existing.id
    });
    if (c.ResultCode !== 0) {
      const { error } = await db.from("moving_payments").update({
        status: "FAILED",
        updated_at: new Date().toISOString()
      }).eq("id", existing.id).in("status", [
        "PENDING",
        "PROCESSING"
      ]);
      if (error) throw error;
      return json({
        success: true,
        status: "FAILED",
        payment_id: existing.id,
        result_code: c.ResultCode,
        result_description: c.ResultDesc ?? null
      });
    }
    const items = c.CallbackMetadata?.Item;
    const receipt = val(items, "MpesaReceiptNumber");
    const amount = val(items, "Amount");
    const phone = val(items, "PhoneNumber");
    if (receipt === null || amount === null) return json({
      success: false,
      error: "Successful callback missing receipt or amount"
    }, 400);
    if (Number(amount) <= 0 || Number(amount) !== Number(existing.amount_kes)) {
      await db.from("moving_payments").update({
        status: "FAILED",
        updated_at: new Date().toISOString()
      }).eq("id", existing.id).in("status", [
        "PENDING",
        "PROCESSING"
      ]);
      return json({
        success: false,
        error: "Payment amount mismatch"
      }, 400);
    }
    const { data: result, error: processError } = await db.rpc("record_moving_payment", {
      p_booking_id: existing.booking_id,
      p_provider: "MPESA",
      p_provider_reference: checkout,
      p_provider_transaction_id: String(receipt),
      p_amount_kes: Number(amount),
      p_mpesa_receipt: String(receipt),
      p_paypal_order_id: null,
      p_provider_currency: "KES"
    });
    if (processError) throw processError;
    return json({
      success: true,
      status: result?.status ?? "HELD",
      payment_id: result?.payment_id ?? existing.id,
      invoice_id: result?.invoice_id ?? existing.invoice_id,
      booking_id: existing.booking_id,
      mpesa_receipt: String(receipt),
      payer_phone: phone === null ? null : String(phone)
    });
  } catch (error) {
    console.error("moving-payment-callback error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    }, 500);
  }
});
