import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const URL = Deno.env.get("SUPABASE_URL");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CLIENT = Deno.env.get("PAYPAL_CLIENT_ID");
const SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET");
const BASE = Deno.env.get("PAYPAL_BASE_URL") ?? "https://api-m.sandbox.paypal.com";
const WEBHOOK_ID = Deno.env.get("MOVING_PAYPAL_WEBHOOK_ID") ?? Deno.env.get("PAYPAL_WEBHOOK_ID");
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
async function accessToken() {
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${CLIENT}:${SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!r.ok) throw new Error("PayPal authentication failed");
  const d = await r.json();
  if (!d.access_token) throw new Error("PayPal access token missing");
  return d.access_token;
}
async function verify(headers, raw) {
  if (!WEBHOOK_ID) return false;
  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionTime = headers.get("paypal-transmission-time");
  const certUrl = headers.get("paypal-cert-url");
  const authAlgo = headers.get("paypal-auth-algo");
  const transmissionSig = headers.get("paypal-transmission-sig");
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) return false;
  const token = await accessToken();
  const r = await fetch(`${BASE}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: WEBHOOK_ID,
      webhook_event: JSON.parse(raw)
    })
  });
  if (!r.ok) return false;
  const d = await r.json();
  return d.verification_status === "SUCCESS";
}
Deno.serve(async (req)=>{
  if (req.method !== "POST") return response({
    success: false,
    error: "POST required"
  }, 405);
  try {
    const raw = await req.text();
    if (!await verify(req.headers, raw)) return response({
      success: false,
      error: "Invalid webhook signature"
    }, 401);
    const event = JSON.parse(raw);
    const eventId = event.id;
    const type = event.event_type;
    const resource = event.resource ?? {};
    if (!eventId) return response({
      success: false,
      error: "Missing PayPal event id"
    }, 400);
    const { data: prior } = await db.from("payment_webhook_events").select("id,status").eq("provider", "PAYPAL_MOVING").eq("event_id", eventId).maybeSingle();
    if (prior?.status === "PROCESSED") return response({
      success: true,
      status: "ALREADY_PROCESSED"
    });
    const { data: row, error: rowError } = await db.from("payment_webhook_events").upsert({
      provider: "PAYPAL_MOVING",
      event_id: eventId,
      event_type: type,
      status: "PROCESSING",
      metadata: event
    }, {
      onConflict: "provider,event_id"
    }).select("id").maybeSingle();
    if (rowError) throw rowError;
    const orderId = resource.id ?? resource.supplementary_data?.related_ids?.order_id ?? null;
    let payment = null;
    if (orderId) {
      const { data } = await db.from("moving_payments").select("id,booking_id,amount_kes,status,provider_amount").eq("provider", "PAYPAL").eq("provider_reference", orderId).maybeSingle();
      payment = data;
    }
    if (!payment) {
      if (row?.id) await db.from("payment_webhook_events").update({
        status: "PROCESSED",
        processed_at: new Date().toISOString()
      }).eq("id", row.id);
      return response({
        success: true,
        status: "IGNORED",
        reason: "Moving payment not found"
      });
    }
    if ([
      "PAYMENT.CAPTURE.COMPLETED",
      "CHECKOUT.ORDER.COMPLETED"
    ].includes(type)) {
      let amount = Number(resource.amount?.value ?? resource.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? resource.purchase_units?.[0]?.amount?.value ?? 0);
      if (type === "CHECKOUT.ORDER.COMPLETED" && (!amount || amount <= 0)) {
        const token = await accessToken();
        const r = await fetch(`${BASE}/v2/checkout/orders/${orderId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const d = await r.json();
        amount = Number(d?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? d?.purchase_units?.[0]?.amount?.value ?? 0);
      }
      if (!amount || amount <= 0 || payment.provider_amount && Number(payment.provider_amount) !== amount) throw new Error("PayPal amount does not match stored payment");
      const receipt = resource.id ?? resource.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? orderId;
      const { data: result, error } = await db.rpc("record_moving_payment", {
        p_booking_id: payment.booking_id,
        p_provider: "PAYPAL",
        p_provider_reference: orderId,
        p_provider_transaction_id: String(receipt),
        p_amount_kes: Number(payment.amount_kes),
        p_mpesa_receipt: null,
        p_paypal_order_id: orderId,
        p_provider_currency: "USD"
      });
      if (error) throw error;
      if (row?.id) await db.from("payment_webhook_events").update({
        status: "PROCESSED",
        processed_at: new Date().toISOString()
      }).eq("id", row.id);
      return response({
        success: true,
        status: result?.status ?? "HELD",
        payment_id: payment.id,
        booking_id: payment.booking_id
      });
    }
    if ([
      "PAYMENT.CAPTURE.DENIED",
      "PAYMENT.CAPTURE.DECLINED",
      "CHECKOUT.ORDER.VOIDED"
    ].includes(type)) {
      await db.from("moving_payments").update({
        status: "FAILED",
        updated_at: new Date().toISOString()
      }).eq("id", payment.id).in("status", [
        "PENDING",
        "PROCESSING"
      ]);
    }
    if (row?.id) await db.from("payment_webhook_events").update({
      status: "PROCESSED",
      processed_at: new Date().toISOString()
    }).eq("id", row.id);
    return response({
      success: true,
      status: "PROCESSED",
      event_type: type,
      payment_id: payment.id
    });
  } catch (e) {
    console.error("moving-payment-paypal-webhook", e);
    return response({
      success: false,
      error: e instanceof Error ? e.message : "Internal server error"
    }, 500);
  }
});
