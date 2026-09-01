import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID");
const PAYPAL_CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET");
const PAYPAL_BASE_URL = Deno.env.get("PAYPAL_BASE_URL") ?? "https://api-m.sandbox.paypal.com";
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
  if (!data.access_token) throw new Error("PayPal access token missing");
  return data.access_token;
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({
      success: false,
      error: "Authentication required"
    }, 401);
    const accessToken = authHeader.replace("Bearer ", "");
    // User-scoped client so create_paypal_subscription_pending runs as
    // the caller (auth.uid()), matching the same pattern used by the
    // M-Pesa flow's RPCs.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !user) return jsonResponse({
      success: false,
      error: "Invalid authentication"
    }, 401);
    const body = await req.json();
    const { plan_id, billing_cycle } = body;
    if (!plan_id || !billing_cycle) {
      return jsonResponse({
        success: false,
        error: "plan_id and billing_cycle are required"
      }, 400);
    }
    if (billing_cycle !== "MONTHLY" && billing_cycle !== "ANNUAL") {
      return jsonResponse({
        success: false,
        error: "billing_cycle must be MONTHLY or ANNUAL"
      }, 400);
    }
    const { data: plan, error: planError } = await supabase.from("subscription_plans").select("id, name, audience, paypal_product_id, paypal_monthly_plan_id, paypal_annual_plan_id").eq("id", plan_id).maybeSingle();
    if (planError) throw new Error("Unable to load plan");
    if (!plan) return jsonResponse({
      success: false,
      error: "Plan not found"
    }, 404);
    const paypalPlanId = billing_cycle === "MONTHLY" ? plan.paypal_monthly_plan_id : plan.paypal_annual_plan_id;
    if (!paypalPlanId) {
      return jsonResponse({
        success: false,
        error: "PayPal plan not configured for this billing cycle"
      }, 400);
    }
    // FIX: create the PENDING_PAYMENT row BEFORE sending the user to
    // PayPal, and use ITS id (not user.id) as PayPal's custom_id. The
    // webhook can then update this exact row when it activates, instead
    // of guessing by owner id (which could match a stale old row, or
    // match nothing at all for a first-time subscriber).
    const { data: pendingSubscriptionId, error: pendingError } = await userClient.rpc("create_paypal_subscription_pending", {
      p_plan_id: plan_id,
      p_billing_cycle: billing_cycle
    });
    if (pendingError) {
      return jsonResponse({
        success: false,
        error: pendingError.message || "Unable to start PayPal checkout"
      }, 400);
    }
    const paypalToken = await getPaypalAccessToken();
    const createResponse = await fetch(`${PAYPAL_BASE_URL}/v1/billing/subscriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paypalToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        plan_id: paypalPlanId,
        application_context: {
          brand_name: "Saka Krib",
          shipping_preference: "NO_SHIPPING",
          user_action: "SUBSCRIBE_NOW"
        },
        custom_id: pendingSubscriptionId
      })
    });
    const createData = await createResponse.json();
    if (!createResponse.ok) {
      console.error("PayPal create subscription failed:", createData);
      // Best-effort: mark our pending row CANCELLED since PayPal rejected it,
      // so it doesn't linger and block a future checkout attempt.
      const table = plan.audience === "REAL_ESTATE" ? "real_estate_subscriptions" : "landlord_subscriptions";
      await supabase.from(table).update({
        status: "CANCELLED",
        updated_at: new Date().toISOString()
      }).eq("id", pendingSubscriptionId);
      return jsonResponse({
        success: false,
        error: createData.message ?? "PayPal rejected request"
      }, 400);
    }
    return jsonResponse({
      success: true,
      subscription_id: pendingSubscriptionId,
      paypal_subscription_id: createData.id,
      approval_url: createData.links?.find((l)=>l.rel === "approve")?.href ?? null,
      plan_name: plan.name,
      audience: plan.audience,
      billing_cycle
    });
  } catch (error) {
    console.error("paypal-create-subscription error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    }, 500);
  }
});
