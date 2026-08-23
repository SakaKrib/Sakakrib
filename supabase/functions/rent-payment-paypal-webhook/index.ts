import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID")!;
const PAYPAL_CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET")!;
const PAYPAL_BASE_URL = Deno.env.get("PAYPAL_BASE_URL") ?? "https://api-m.sandbox.paypal.com";
const PAYPAL_WEBHOOK_ID = Deno.env.get("PAYPAL_RENT_WEBHOOK_ID") ?? Deno.env.get("PAYPAL_WEBHOOK_ID");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function paypalToken(): Promise<string> {
  const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("Unable to authenticate with PayPal");
  const data = await response.json();
  if (!data.access_token) throw new Error("PayPal access token missing");
  return data.access_token;
}

async function verifySignature(headers: Headers, rawBody: string): Promise<boolean> {
  if (!PAYPAL_WEBHOOK_ID) return false;

  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionTime = headers.get("paypal-transmission-time");
  const certUrl = headers.get("paypal-cert-url");
  const authAlgo = headers.get("paypal-auth-algo");
  const transmissionSig = headers.get("paypal-transmission-sig");
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) return false;

  try {
    const token = await paypalToken();
    const response = await fetch(`${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: PAYPAL_WEBHOOK_ID,
        webhook_event: JSON.parse(rawBody),
      }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.verification_status === "SUCCESS";
  } catch (error) {
    console.error("PayPal webhook signature verification failed", error);
    return false;
  }
}

function extractOrderId(event: Record<string, any>): string | null {
  const resource = event.resource ?? {};
  return resource?.supplementary_data?.related_ids?.order_id ??
    resource?.order_id ??
    resource?.purchase_units?.[0]?.payments?.captures?.[0]?.supplementary_data?.related_ids?.order_id ??
    null;
}

function extractPaymentIntentId(event: Record<string, any>): string | null {
  const resource = event.resource ?? {};
  const purchaseUnit = resource?.purchase_units?.[0];
  const customId = purchaseUnit?.custom_id ?? resource?.custom_id ?? null;
  if (typeof customId !== "string" || !customId.startsWith("RENT:")) return null;
  return customId.slice("RENT:".length);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  if (!(await verifySignature(req.headers, rawBody))) {
    console.warn("Rejected unsigned/invalid PayPal rent webhook");
    return json({ success: false, error: "Invalid webhook signature" }, 400);
  }

  try {
    const event = JSON.parse(rawBody) as Record<string, any>;
    const eventId = String(event.id ?? "");
    const eventType = String(event.event_type ?? "").toUpperCase();
    const resource = event.resource ?? {};

    // PayPal may retry the same event. Record the event once and treat a duplicate as success.
    if (eventId) {
      const { data: existing } = await admin
        .from("payment_webhook_events")
        .select("id,processed_at")
        .eq("provider", "paypal")
        .eq("event_id", eventId)
        .maybeSingle();
      if (existing?.processed_at) return json({ success: true, duplicate: true, event_id: eventId });
      if (!existing) {
        await admin.from("payment_webhook_events").insert({
          provider: "paypal",
          event_id: eventId,
          event_type: eventType,
          status: "RECEIVED",
          received_at: new Date().toISOString(),
          metadata: { domain: "RENT", payload: event },
        });
      }
    }

    const relevantEvents = new Set([
      "PAYMENT.CAPTURE.COMPLETED",
      "PAYMENT.CAPTURE.DENIED",
      "PAYMENT.CAPTURE.PENDING",
      "PAYMENT.CAPTURE.REFUNDED",
      "PAYMENT.CAPTURE.REVERSED",
      "PAYMENT.CAPTURE.DECLINED",
      "CHECKOUT.ORDER.COMPLETED",
      "CHECKOUT.PAYMENT-APPROVAL.REVERSED",
    ]);

    if (!relevantEvents.has(eventType)) {
      if (eventId) {
        await admin.from("payment_webhook_events").update({
          status: "IGNORED",
          processed_at: new Date().toISOString(),
        }).eq("provider", "paypal").eq("event_id", eventId);
      }
      return json({ success: true, ignored: true, event_type: eventType });
    }

    const orderId = extractOrderId(event);
    const paymentIntentId = extractPaymentIntentId(event);

    let intentQuery = admin
      .from("rent_payment_intents")
      .select("id,renter_assoc_id,unit_id,landlord_id,amount_kes,status,payment_periods,paypal_order_id,provider_amount,provider_currency,paypal_fx_rate")
      .limit(1);

    if (paymentIntentId) intentQuery = intentQuery.eq("id", paymentIntentId);
    else if (orderId) intentQuery = intentQuery.eq("paypal_order_id", orderId);
    else intentQuery = intentQuery.eq("id", "00000000-0000-0000-0000-000000000000");

    const { data: intent, error: intentError } = await intentQuery.maybeSingle();
    if (intentError) throw intentError;

    if (!intent) {
      if (eventId) await admin.from("payment_webhook_events").update({
        status: "IGNORED",
        error: "Rent payment intent not found",
        processed_at: new Date().toISOString(),
      }).eq("provider", "paypal").eq("event_id", eventId);
      // Return 200 so PayPal does not endlessly retry an event that does not belong to this rent domain.
      return json({ success: true, ignored: true, reason: "Rent payment intent not found" });
    }

    const capture = resource?.payments?.captures?.[0] ?? resource;
    const captureId = capture?.id ?? null;
    const providerAmount = Number(capture?.amount?.value ?? resource?.amount?.value ?? intent.provider_amount ?? 0);
    const providerCurrency = String(capture?.amount?.currency_code ?? resource?.amount?.currency_code ?? intent.provider_currency ?? "USD").toUpperCase();
    const providerStatus = String(capture?.status ?? resource?.status ?? "").toUpperCase();
    const reference = captureId ?? orderId ?? intent.paypal_order_id;

    if (providerCurrency !== "USD") throw new Error("Rent PayPal webhook currency must be USD");

    if (["PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.DECLINED", "CHECKOUT.PAYMENT-APPROVAL.REVERSED"].includes(eventType)) {
      if (intent.status !== "PAID") {
        await admin.from("rent_payment_intents").update({
          status: "FAILED",
          provider: "PAYPAL",
          payment_method: "PAYPAL",
          provider_reference: reference,
          provider_amount: providerAmount || null,
          provider_currency: providerCurrency,
          paypal_order_id: orderId ?? intent.paypal_order_id,
          result_description: event.summary ?? providerStatus ?? eventType,
          updated_at: new Date().toISOString(),
        }).eq("id", intent.id).neq("status", "PAID");
      }
    } else if (eventType === "PAYMENT.CAPTURE.COMPLETED" || eventType === "CHECKOUT.ORDER.COMPLETED") {
      // process_rent_payment is the only path allowed to mark rent periods PAID.
      const { data: result, error: processError } = await admin.rpc("process_rent_payment", {
        p_payment_intent_id: intent.id,
        p_provider: "PAYPAL",
        p_payment_method: "PAYPAL",
        p_paid_amount: Number(intent.amount_kes),
        p_provider_reference: reference,
        p_provider_amount: providerAmount,
        p_provider_currency: providerCurrency,
        p_paypal_order_id: orderId ?? intent.paypal_order_id,
        p_paypal_fx_rate: intent.paypal_fx_rate,
      });
      if (processError) throw processError;

      console.info("Rent payment finalized via PayPal", {
        payment_intent_id: intent.id,
        order_id: orderId,
        capture_id: captureId,
        result,
      });
    }

    if (eventId) {
      await admin.from("payment_webhook_events").update({
        status: "PROCESSED",
        processed_at: new Date().toISOString(),
        invoice_id: intent.id,
      }).eq("provider", "paypal").eq("event_id", eventId);
    }

    return json({ success: true, event_id: eventId, event_type: eventType, payment_intent_id: intent.id });
  } catch (error) {
    console.error("rent-payment-paypal-webhook error", error);
    const event = (() => { try { return JSON.parse(rawBody); } catch { return null; } })();
    const eventId = event?.id;
    if (eventId) {
      await admin.from("payment_webhook_events").update({
        status: "FAILED",
        error: error instanceof Error ? error.message : "Internal server error",
      }).eq("provider", "paypal").eq("event_id", eventId);
    }
    // A non-2xx response tells PayPal to retry the event.
    return json({ success: false, error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
