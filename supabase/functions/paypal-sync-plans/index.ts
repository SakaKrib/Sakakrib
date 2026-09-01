import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY"));
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !user) return jsonResponse({
      success: false,
      error: "Invalid authentication"
    }, 401);
    const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle();
    if (!profile || profile.role !== "admin") {
      return jsonResponse({
        success: false,
        error: "Admin access required"
      }, 403);
    }
    const { data: plans, error: plansError } = await supabase.from("subscription_plans").select("id, name, audience, paypal_product_id, paypal_monthly_plan_id, paypal_annual_plan_id, monthly_price_kes, annual_price_kes, paypal_monthly_price_usd, paypal_annual_price_usd").order("audience").order("monthly_price_kes");
    if (plansError) throw new Error("Unable to load plans");
    const paypalToken = await getPaypalAccessToken();
    const results = [];
    for (const plan of plans ?? []){
      try {
        if (plan.paypal_monthly_plan_id) {
          const detailResponse = await fetch(`${PAYPAL_BASE_URL}/v1/billing/plans/${plan.paypal_monthly_plan_id}`, {
            headers: {
              Authorization: `Bearer ${paypalToken}`
            }
          });
          if (detailResponse.ok) {
            const detail = await detailResponse.json();
            results.push({
              plan_id: plan.id,
              cycle: "MONTHLY",
              paypal_status: detail.status,
              paypal_plan_id: plan.paypal_monthly_plan_id
            });
          }
        }
        if (plan.paypal_annual_plan_id) {
          const detailResponse = await fetch(`${PAYPAL_BASE_URL}/v1/billing/plans/${plan.paypal_annual_plan_id}`, {
            headers: {
              Authorization: `Bearer ${paypalToken}`
            }
          });
          if (detailResponse.ok) {
            const detail = await detailResponse.json();
            results.push({
              plan_id: plan.id,
              cycle: "ANNUAL",
              paypal_status: detail.status,
              paypal_plan_id: plan.paypal_annual_plan_id
            });
          }
        }
      } catch (err) {
        results.push({
          plan_id: plan.id,
          error: err instanceof Error ? err.message : "lookup failed"
        });
      }
    }
    return jsonResponse({
      success: true,
      plans_synced: results.length,
      results
    });
  } catch (error) {
    console.error("paypal-sync-plans error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    }, 500);
  }
});
