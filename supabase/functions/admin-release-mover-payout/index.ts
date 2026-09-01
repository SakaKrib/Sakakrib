import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const URL = Deno.env.get("SUPABASE_URL");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON = Deno.env.get("SUPABASE_ANON_KEY");
const db = createClient(URL, SERVICE, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
const response = (body, status = 200)=>new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
Deno.serve(async (req)=>{
  if (req.method !== "POST") return response({
    success: false,
    error: "POST required"
  }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return response({
      success: false,
      error: "Authentication required"
    }, 401);
    const client = createClient(URL, ANON, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    const { data: { user }, error: authError } = await client.auth.getUser(auth.slice(7));
    if (authError || !user) return response({
      success: false,
      error: "Invalid authentication"
    }, 401);
    const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "admin") return response({
      success: false,
      error: "Admin access required"
    }, 403);
    const body = await req.json();
    const payoutId = body?.payout_id;
    if (!payoutId) return response({
      success: false,
      error: "payout_id is required"
    }, 400);
    const { data: payout, error: payoutError } = await db.from("mover_payouts").select("id,booking_id,net_mover_payable,final_payment_status,payout_provider,payout_provider_reference").eq("id", payoutId).maybeSingle();
    if (payoutError) throw payoutError;
    if (!payout) return response({
      success: false,
      error: "Payout not found"
    }, 404);
    if (payout.final_payment_status !== "held") return response({
      success: false,
      error: `Payout is not releasable from ${payout.final_payment_status}`
    }, 409);
    const { data: payment, error: paymentError } = await db.from("moving_payments").select("id,status,amount_kes").eq("booking_id", payout.booking_id).eq("status", "HELD").maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) return response({
      success: false,
      error: "Escrow payment is not held"
    }, 409);
    const { data: booking, error: bookingError } = await db.from("bookings").select("id,status,renter_confirmed_delivery,mover_confirmed_delivery").eq("id", payout.booking_id).maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return response({
      success: false,
      error: "Booking not found"
    }, 404);
    if (!booking.renter_confirmed_delivery || !booking.mover_confirmed_delivery) return response({
      success: false,
      error: "Both renter and mover delivery confirmations are required"
    }, 409);
    const { data: updated, error: updateError } = await db.from("mover_payouts").update({
      final_payment_status: "processing",
      payout_requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", payoutId).eq("final_payment_status", "held").select("id,booking_id,net_mover_payable,final_payment_status").maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return response({
      success: false,
      error: "Payout state changed; retry safely"
    }, 409);
    // The provider-specific payout request is deliberately separate from this admin authorization step.
    return response({
      success: true,
      status: "PROCESSING",
      payout_id: payoutId,
      booking_id: payout.booking_id,
      amount_kes: Number(payout.net_mover_payable),
      message: "Escrow release authorized; provider payout execution must complete via the dedicated payout processor/callback."
    });
  } catch (error) {
    console.error("admin-release-mover-payout", error);
    return response({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    }, 500);
  }
});
