import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID")!;
const PAYPAL_CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET")!;
const PAYPAL_BASE_URL = Deno.env.get("PAYPAL_BASE_URL") ?? "https://api-m.sandbox.paypal.com";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ success: false, error: "Authentication required" }, 401);
    const accessToken = authHeader.replace("Bearer ", "");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !user) return jsonResponse({ success: false, error: "Invalid authentication" }, 401);

    const body = await req.json();
    const { plan_id, billing_cycle, audience } = body as {
      plan_id?: string;
      billing_cycle?: "MONTHLY" | "ANNUAL";
      audience?: "LANDLORD" | "REAL_ESTATE";
    };

    if (!plan_id || !billing_cycle) {
      return jsonResponse({ success: false, error: "plan_id and billing_cycle are required" }, 400);
    }

    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("id, name, audience, paypal_monthly_price_usd, paypal_annual_price_usd, paypal_product_id")
      .eq("id", plan_id)
      .maybeSingle();

    if (planError) throw new Error("Unable to load plan");
    if (!plan) return jsonResponse({ success: false, error: "Plan not found" }, 404);

    const amountUsd = billing_cycle === "MONTHLY" ? Number(plan.paypal_monthly_price_usd) : Number(plan.paypal_annual_price_usd);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return jsonResponse({ success: false, error: "Plan pricing not configured for PayPal" }, 400);
    }

    const paypalToken = await getPaypalAccessToken();

    const createResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${paypalToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: amountUsd.toFixed(2),
            },
            description: `Saka Krib ${plan.name} (${billing_cycle})`,
            custom_id: `${user.id}:${plan.id}:${billing_cycle}`,
          },
        ],
        application_context: {
          brand_name: "Saka Krib",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
        },
      }),
    });

    const createData = await createResponse.json();

    if (!createResponse.ok) {
      console.error("PayPal create order failed:", createData);
      return jsonResponse({ success: false, error: createData.message ?? "PayPal rejected request" }, 400);
    }

    const approvalUrl = createData.links?.find((l: { rel: string }) => l.rel === "approve")?.href ?? null;

    return jsonResponse({
      success: true,
      order_id: createData.id,
      approval_url: approvalUrl,
      amount_usd: amountUsd,
      plan_name: plan.name,
      billing_cycle,
    });
  } catch (error) {
    console.error("paypal-create-order error:", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      500
    );
  }
});
