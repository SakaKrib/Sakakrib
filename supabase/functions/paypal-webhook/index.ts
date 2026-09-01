import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, Paypal-Transmission-Id, Paypal-Transmission-Time, Paypal-Cert-Url, Paypal-Auth-Algo, Paypal-Transmission-Sig"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID");
const PAYPAL_CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET");
const PAYPAL_BASE_URL = Deno.env.get("PAYPAL_BASE_URL") ?? "https://api-m.sandbox.paypal.com";
const PAYPAL_WEBHOOK_ID = Deno.env.get("PAYPAL_WEBHOOK_ID");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
async function getPaypalAccessToken() {
  const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!response.ok) throw new Error("Unable to authenticate with PayPal");
  const data = await response.json();
  return data.access_token;
}
async function verifyWebhookSignature(headers, rawBody) {
  try {
    const transmissionId = headers.get("paypal-transmission-id");
    const transmissionTime = headers.get("paypal-transmission-time");
    const certUrl = headers.get("paypal-cert-url");
    const authAlgo = headers.get("paypal-auth-algo");
    const transmissionSig = headers.get("paypal-transmission-sig");
    if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
      return false;
    }
    const token = await getPaypalAccessToken();
    const verifyResponse = await fetch(`${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
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
        webhook_id: PAYPAL_WEBHOOK_ID,
        webhook_event: JSON.parse(rawBody)
      })
    });
    if (!verifyResponse.ok) return false;
    const data = await verifyResponse.json();
    return data.verification_status === "SUCCESS";
  } catch (err) {
    console.error("Webhook signature verification error:", err);
    return false;
  }
}
function addInterval(base, cycle) {
  const d = new Date(base.getTime());
  if (cycle === "ANNUAL") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
  if (req.method !== "POST") return jsonResponse({
    success: false,
    error: "Method not allowed"
  }, 405);
  try {
    const rawBody = await req.text();
    const isValid = await verifyWebhookSignature(req.headers, rawBody);
    if (!isValid) return jsonResponse({
      success: false,
      error: "Invalid webhook signature"
    }, 401);
    const event = JSON.parse(rawBody);
    const eventType = event.event_type;
    const resource = event.resource ?? {};
    // Idempotency: payment_webhook_events now has a real unique
    // constraint on (provider, event_id) (added in this fix). Upsert so
    // a retried webhook delivery doesn't get processed twice, and check
    // status first so an already-PROCESSED event short-circuits.
    const { data: existingEvent } = await supabase.from("payment_webhook_events").select("id, status").eq("provider", "PAYPAL").eq("event_id", event.id).maybeSingle();
    if (existingEvent?.status === "PROCESSED") {
      return jsonResponse({
        success: true,
        status: "ALREADY_PROCESSED"
      });
    }
    // FIX: table has "metadata" (jsonb) not "payload", and "status" (not
    // a boolean "processed") — the old insert used both wrong column
    // names, so this bookkeeping insert was silently failing every time
    // (the error was never checked).
    const { data: webhookRow, error: webhookRowError } = await supabase.from("payment_webhook_events").upsert({
      provider: "PAYPAL",
      event_id: event.id,
      event_type: eventType,
      status: "PROCESSING",
      metadata: event
    }, {
      onConflict: "provider,event_id"
    }).select("id").maybeSingle();
    if (webhookRowError) console.error("Unable to record webhook event:", webhookRowError);
    const paypalSubscriptionId = resource.id ?? resource.billing_agreement_id ?? null;
    // custom_id is OUR internal subscription id (landlord_subscriptions.id
    // or real_estate_subscriptions.id), set at checkout time by
    // create_paypal_subscription_pending / paypal-create-subscription —
    // not PayPal's own id, and not auth.uid(). Matching on this instead
    // of owner id is what makes activation land on the exact row created
    // for THIS checkout, not a stale prior one.
    const customId = resource.custom_id ?? null;
    let createdInvoiceId = null;
    if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED" || eventType === "BILLING.SUBSCRIPTION.UPDATED") {
      if (customId && paypalSubscriptionId) {
        const { data: landlordRow } = await supabase.from("landlord_subscriptions").select("id, billing_cycle").eq("id", customId).maybeSingle();
        let table = "landlord_subscriptions";
        let billingCycle = landlordRow?.billing_cycle ?? null;
        if (!landlordRow) {
          const { data: reRow } = await supabase.from("real_estate_subscriptions").select("id, billing_cycle").eq("id", customId).maybeSingle();
          if (reRow) {
            table = "real_estate_subscriptions";
            billingCycle = reRow.billing_cycle;
          }
        }
        if (billingCycle) {
          const now = new Date();
          const periodEnd = resource.billing_info?.next_billing_time ? new Date(resource.billing_info.next_billing_time) : addInterval(now, billingCycle);
          const { error: activateError } = await supabase.from(table).update({
            paypal_subscription_id: paypalSubscriptionId,
            paypal_plan_id: resource.plan_id ?? null,
            paypal_status: resource.status ?? "ACTIVE",
            status: "ACTIVE",
            auto_renew: true,
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
            grace_period_end: null,
            updated_at: now.toISOString()
          }).eq("id", customId);
          if (activateError) console.error("Failed to activate subscription from PayPal webhook:", activateError);
        } else {
          console.error("paypal-webhook: no pending subscription found for custom_id", customId);
        }
      }
    }
    if (eventType === "BILLING.SUBSCRIPTION.CANCELLED" || eventType === "BILLING.SUBSCRIPTION.EXPIRED") {
      if (paypalSubscriptionId) {
        const now = new Date().toISOString();
        await supabase.from("landlord_subscriptions").update({
          paypal_status: resource.status ?? "CANCELLED",
          status: "CANCELLED",
          auto_renew: false,
          updated_at: now
        }).eq("paypal_subscription_id", paypalSubscriptionId);
        await supabase.from("real_estate_subscriptions").update({
          paypal_status: resource.status ?? "CANCELLED",
          status: "CANCELLED",
          auto_renew: false,
          updated_at: now
        }).eq("paypal_subscription_id", paypalSubscriptionId);
      }
    }
    if (eventType === "PAYMENT.SALE.COMPLETED") {
      const billingAgreementId = resource.billing_agreement_id ?? null;
      const amountUsd = Number(resource.amount?.total ?? 0);
      if (billingAgreementId && amountUsd > 0) {
        const { data: landlordSub } = await supabase.from("landlord_subscriptions").select("id, plan_id").eq("paypal_subscription_id", billingAgreementId).maybeSingle();
        let subId = landlordSub?.id ?? null;
        let planId = landlordSub?.plan_id ?? null;
        let subCol = "landlord_subscription_id";
        if (!subId) {
          const { data: reSub } = await supabase.from("real_estate_subscriptions").select("id, plan_id").eq("paypal_subscription_id", billingAgreementId).maybeSingle();
          if (reSub) {
            subId = reSub.id;
            planId = reSub.plan_id;
            subCol = "real_estate_subscription_id";
          }
        }
        if (subId && planId) {
          const { data: plan } = await supabase.from("subscription_plans").select("paypal_fx_rate").eq("id", planId).maybeSingle();
          let fxRate = plan?.paypal_fx_rate ? Number(plan.paypal_fx_rate) : null;
          if (!fxRate) {
            const { data: cached } = await supabase.from("exchange_rate_cache").select("rate").eq("base_currency", "USD").eq("quote_currency", "KES").order("fetched_at", {
              ascending: false
            }).limit(1).maybeSingle();
            fxRate = cached?.rate ? Number(cached.rate) : null;
          }
          if (fxRate && fxRate > 0) {
            const amountKes = Math.round(amountUsd * fxRate * 100) / 100;
            // FIX: amount_kes was hardcoded to 0, which violates the
            // amount_kes > 0 CHECK constraint (every insert was erroring).
            // FIX: payment_provider was lowercase "paypal"; the constraint
            // only allows 'MPESA' / 'PAYPAL' (uppercase) — also erroring.
            const { data: inv, error: invError } = await supabase.from("subscription_invoices").insert({
              [subCol]: subId,
              amount_kes: amountKes,
              amount_usd: amountUsd,
              currency: "USD",
              exchange_rate: fxRate,
              status: "PAID",
              payment_provider: "PAYPAL",
              provider_reference: resource.id ?? null,
              provider_transaction_id: resource.id ?? null,
              paypal_subscription_id: billingAgreementId,
              paid_at: new Date().toISOString()
            }).select("id").single();
            if (invError) console.error("Failed to record PayPal invoice:", invError);
            else createdInvoiceId = inv.id;
          } else {
            console.error("paypal-webhook: no FX rate available for plan", planId, "- invoice not recorded for event", event.id);
          }
        }
      }
    }
    if (webhookRow?.id) {
      await supabase.from("payment_webhook_events").update({
        status: "PROCESSED",
        processed_at: new Date().toISOString(),
        invoice_id: createdInvoiceId
      }).eq("id", webhookRow.id);
    }
    return jsonResponse({
      success: true,
      event_type: eventType
    });
  } catch (error) {
    console.error("paypal-webhook error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    }, 500);
  }
});
