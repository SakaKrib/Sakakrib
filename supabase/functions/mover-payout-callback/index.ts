import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const URL = Deno.env.get("SUPABASE_URL");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CALLBACK_SECRET = Deno.env.get("MPESA_PAYOUT_CALLBACK_SECRET");
const db = createClient(URL, SERVICE, {
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
function timingSafeEqual(a, b) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let x = 0;
  for(let i = 0; i < ea.length; i++)x |= ea[i] ^ eb[i];
  return x === 0;
}
Deno.serve(async (req)=>{
  if (req.method !== "POST") return json({
    success: false,
    error: "POST required"
  }, 405);
  try {
    if (!CALLBACK_SECRET) return json({
      success: false,
      error: "Payout callback authentication is not configured"
    }, 503);
    const supplied = req.headers.get("x-saka-payout-signature");
    if (!supplied || !timingSafeEqual(supplied.trim(), CALLBACK_SECRET.trim())) return json({
      success: false,
      error: "Invalid callback signature"
    }, 401);
    const raw = await req.text();
    let p;
    try {
      p = JSON.parse(raw);
    } catch  {
      return json({
        success: false,
        error: "Invalid JSON"
      }, 400);
    }
    const resultCode = Number(p?.ResultCode);
    const reference = p?.OriginatorConversationID ?? p?.ConversationID ?? p?.reference;
    const transactionId = p?.TransactionID ?? p?.MpesaReceiptNumber ?? p?.Result?.TransactionID ?? null;
    if (!reference) return json({
      success: false,
      error: "Missing payout provider reference"
    }, 400);
    const { data: payout, error: payoutError } = await db.from("mover_payouts").select("id,booking_id,net_mover_payable,final_payment_status,payout_provider_reference,payout_provider_transaction_id").eq("payout_provider", "MPESA").eq("payout_provider_reference", reference).maybeSingle();
    if (payoutError) throw payoutError;
    if (!payout) return json({
      success: true,
      status: "IGNORED"
    });
    if (payout.final_payment_status === "released") return json({
      success: true,
      status: "RELEASED",
      already_processed: true,
      payout_id: payout.id
    });
    if (payout.final_payment_status !== "processing") return json({
      success: false,
      error: `Payout is not processing (${payout.final_payment_status})`
    }, 409);
    const { data, error } = await db.rpc("finalize_mover_payout", {
      p_payout_id: payout.id,
      p_provider: "MPESA",
      p_provider_reference: String(reference),
      p_provider_transaction_id: transactionId ? String(transactionId) : null,
      p_success: resultCode === 0,
      p_failure_reason: resultCode === 0 ? null : String(p?.ResultDesc ?? p?.Result?.ResultDesc ?? "M-Pesa payout failed")
    });
    if (error) throw error;
    return json({
      success: true,
      status: data?.status ?? (resultCode === 0 ? "released" : "failed"),
      payout_id: payout.id,
      booking_id: payout.booking_id,
      transaction_id: transactionId
    });
  } catch (e) {
    console.error("mover-payout-callback", e);
    return json({
      success: false,
      error: e instanceof Error ? e.message : "Internal server error"
    }, 500);
  }
});
