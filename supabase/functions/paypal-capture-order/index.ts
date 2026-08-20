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
    const { order_id } = body as { order_id?: string };

    if (!order_id) return jsonResponse({ success: false, error: "order_id is required" }, 400);

    const paypalToken = await getPaypalAccessToken();

    const captureResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${order_id}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${paypalToken}`, "Content-Type": "application/json" },
    });

    const captureData = await captureResponse.json();

    if (!captureResponse.ok) {
      console.error("PayPal capture failed:", captureData);
      return jsonResponse({ success: false, error: captureData.message ?? "PayPal capture rejected" }, 400);
    }

    const purchaseUnit = captureData.purchase_units?.[0];
    const customId = purchaseUnit?.payments?.captures?.[0]?.custom_id ?? purchaseUnit?.custom_id ?? "";
    const [userId, planId, billingCycle] = String(customId).split(":");

    if (userId !== user.id) {
      return jsonResponse({ success: false, error: "Order does not belong to caller" }, 403);
    }

    const captureId = purchaseUnit?.payments?.captures?.[0]?.id ?? null;
    const amountUsd = Number(purchaseUnit?.payments?.captures?.[0]?.amount?.value ?? 0);

    return jsonResponse({
      success: true,
      order_id,
      capture_id: captureId,
      amount_usd: amountUsd,
      plan_id: planId ?? null,
      billing_cycle: billingCycle ?? null,
      status: captureData.status,
    });
  } catch (error) {
    console.error("paypal-capture-order error:", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      500
    );
  }
});
