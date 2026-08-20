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
const PAYPAL_WEBHOOK_ID = Deno.env.get("PAYPAL_WEBHOOK_ID")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getPaypalAccessToken(): Promise<string> {
  const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("Unable to authenticate with PayPal");
  const data = await response.json();
  return data.access_token;
}

async function verifyWebhookSignature(headers: Headers, body: string): Promise<boolean> {
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
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: PAYPAL_WEBHOOK_ID,
        webhook_event: JSON.parse(body),
      }),
    });

    if (!verifyResponse.ok) return false;
    const data = await verifyResponse.json();
    return data.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  try {
    const rawBody = await req.text();

    const isValid = await verifyWebhookSignature(req.headers, rawBody);
    if (!isValid) {
      return jsonResponse({ success: false, error: "Invalid webhook signature" }, 401);
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event_type;
    const resource = event.resource ?? {};

    await supabase.from("payment_webhook_events").insert({
      provider: "paypal",
      event_type: eventType,
      event_id: event.id,
      payload: event,
      processed: false,
    });

    const paypalSubscriptionId = resource.id ?? resource.billing_agreement_id ?? null;
    const customId = resource.custom_id ?? event.resource?.custom_id ?? null;

    if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED" || eventType === "BILLING.SUBSCRIPTION.UPDATED") {
      if (customId && paypalSubscriptionId) {
        const { data: plan } = await supabase
          .from("subscription_plans")
          .select("id, audience")
          .eq("paypal_monthly_plan_id", resource.plan_id)
          .or(`paypal_annual_plan_id.eq.${resource.plan_id}`)
          .maybeSingle();

        if (plan) {
          const table = plan.audience === "REAL_ESTATE" ? "real_estate_subscriptions" : "landlord_subscriptions";
          const ownerCol = plan.audience === "REAL_ESTATE" ? "real_estate_id" : "landlord_id";

          await supabase
            .from(table)
            .update({
              paypal_subscription_id: paypalSubscriptionId,
              paypal_plan_id: resource.plan_id ?? null,
              paypal_status: resource.status ?? "ACTIVE",
              status: "ACTIVE",
              auto_renew: true,
            })
            .eq(ownerCol, customId);
        }
      }
    }

    if (eventType === "BILLING.SUBSCRIPTION.CANCELLED" || eventType === "BILLING.SUBSCRIPTION.EXPIRED") {
      if (paypalSubscriptionId) {
        await supabase
          .from("landlord_subscriptions")
          .update({ paypal_status: resource.status ?? "CANCELLED", cancel_at_period_end: true, cancelled_at: new Date().toISOString() })
          .eq("paypal_subscription_id", paypalSubscriptionId);
        await supabase
          .from("real_estate_subscriptions")
          .update({ paypal_status: resource.status ?? "CANCELLED", cancel_at_period_end: true, cancelled_at: new Date().toISOString() })
          .eq("paypal_subscription_id", paypalSubscriptionId);
      }
    }

    if (eventType === "PAYMENT.SALE.COMPLETED") {
      const billingAgreementId = resource.billing_agreement_id ?? paypalSubscriptionId;
      if (billingAgreementId) {
        const { data: sub } = await supabase
          .from("landlord_subscriptions")
          .select("id, landlord_id, plan_id, billing_cycle")
          .eq("paypal_subscription_id", billingAgreementId)
          .maybeSingle();

        if (sub) {
          await supabase.from("subscription_invoices").insert({
            landlord_subscription_id: sub.id,
            amount_kes: 0,
            status: "PAID",
            payment_provider: "paypal",
            provider_reference: resource.id ?? null,
            provider_transaction_id: resource.id ?? null,
            paypal_subscription_id: billingAgreementId,
            amount_usd: Number(resource.amount?.total ?? 0),
            currency: resource.amount?.currency ?? "USD",
            paid_at: new Date().toISOString(),
          });
        }
      }
    }

    return jsonResponse({ success: true, event_type: eventType });
  } catch (error) {
    console.error("paypal-webhook error:", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      500
    );
  }
});
