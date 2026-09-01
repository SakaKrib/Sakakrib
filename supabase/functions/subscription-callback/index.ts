import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
const h = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*"
};
const out = (b, s = 200)=>new Response(JSON.stringify(b), {
    status: s,
    headers: h
  });
const val = (a, n)=>a?.find((x)=>x.Name === n)?.Value ?? null;
Deno.serve(async (req)=>{
  if (req.method !== "POST") return out({
    success: false,
    error: "POST required"
  }, 405);
  try {
    const p = await req.json();
    const c = p?.Body?.stkCallback;
    if (!c?.CheckoutRequestID) return out({
      success: false,
      error: "Invalid M-Pesa callback payload"
    }, 400);
    const id = c.CheckoutRequestID;
    const { data: i, error: e } = await db.from("subscription_invoices").select("id,amount_kes,status,checkout_request_id,landlord_subscription_id,real_estate_subscription_id").eq("checkout_request_id", id).maybeSingle();
    if (e) throw e;
    if (!i) return out({
      success: true,
      status: "IGNORED",
      error: "Invoice not found"
    });
    if (i.status === "PAID") return out({
      success: true,
      status: "PAID",
      already_processed: true,
      invoice_id: i.id
    });
    if (c.ResultCode !== 0) {
      const { error: x } = await db.from("subscription_invoices").update({
        status: "FAILED",
        result_code: c.ResultCode ?? null,
        result_description: c.ResultDesc ?? null
      }).eq("id", i.id).eq("status", "PENDING");
      if (x) throw x;
      return out({
        success: true,
        status: "FAILED",
        invoice_id: i.id
      });
    }
    const items = c.CallbackMetadata?.Item;
    const receipt = val(items, "MpesaReceiptNumber"), amount = val(items, "Amount"), phone = val(items, "PhoneNumber");
    if (!receipt || amount === null) return out({
      success: false,
      error: "Successful callback missing receipt or amount"
    }, 400);
    if (Number(amount) !== Number(i.amount_kes)) {
      await db.from("subscription_invoices").update({
        status: "FAILED",
        result_description: "Payment amount does not match invoice amount"
      }).eq("id", i.id).eq("status", "PENDING");
      return out({
        success: false,
        error: "Payment amount mismatch"
      }, 400);
    }
    const fn = i.real_estate_subscription_id ? "process_real_estate_subscription_payment" : "process_subscription_payment";
    const { data: r, error: rx } = await db.rpc(fn, {
      p_invoice_id: i.id,
      p_checkout_request_id: id,
      p_mpesa_receipt: String(receipt),
      p_merchant_request_id: c.MerchantRequestID ?? null,
      p_phone_number: phone ? String(phone) : null,
      p_result_code: c.ResultCode ?? 0,
      p_result_description: c.ResultDesc ?? null,
      p_paid_amount: Number(amount)
    });
    if (rx) throw rx;
    return out({
      success: true,
      status: r?.status ?? "PAID",
      invoice_id: i.id,
      subscription_id: i.real_estate_subscription_id ?? i.landlord_subscription_id,
      reconciliation: r
    });
  } catch (e) {
    console.error(e);
    return out({
      success: false,
      error: e instanceof Error ? e.message : "Internal server error"
    }, 500);
  }
});
