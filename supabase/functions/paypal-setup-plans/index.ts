import { createClient } from "npm:@supabase/supabase-js@2";
// Admin-only, one-time-per-plan setup: creates the actual PayPal
// Product + Billing Plan objects (MONTHLY and ANNUAL) for every
// subscription_plans row that doesn't already have them, and writes
// the resulting IDs + USD pricing + FX rate back to the row.
//
// FX rate comes from the shared, public exchange-rate function - not
// fetched independently here. That function is the single source of
// truth for currency conversion across every function that needs it.
//
// Idempotent: a plan with paypal_monthly_plan_id AND
// paypal_annual_plan_id already set is skipped unless force=true is
// passed, so re-running this is safe.
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
  if (!data.access_token) throw new Error("PayPal access token missing");
  return data.access_token;
}
async function getKesUsdRate() {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/exchange-rate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      base: "KES",
      quote: "USD"
    })
  });
  const data = await response.json();
  if (!response.ok || !data.success || !Number.isFinite(Number(data.rate)) || Number(data.rate) <= 0) {
    console.error("exchange-rate call failed", data);
    throw new Error(data.error ?? "Unable to obtain current KES/USD exchange rate");
  }
  return Number(data.rate);
}
async function createPaypalProduct(token, planName, audience) {
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/catalogs/products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: `Saka Crib PMS - ${audience} ${planName}`,
      description: `Saka Crib property management subscription (${audience.toLowerCase()}, ${planName} tier)`,
      type: "SERVICE",
      category: "SOFTWARE"
    })
  });
  const data = await response.json();
  if (!response.ok || !data.id) {
    console.error("PayPal product creation failed", data);
    throw new Error(data.message ?? "PayPal rejected product creation");
  }
  return data.id;
}
async function createPaypalBillingPlan(token, productId, planName, audience, cycle, priceUsd) {
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/billing/plans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      product_id: productId,
      name: `${audience} ${planName} - ${cycle === "MONTHLY" ? "Monthly" : "Annual"}`,
      billing_cycles: [
        {
          frequency: {
            interval_unit: cycle === "MONTHLY" ? "MONTH" : "YEAR",
            interval_count: 1
          },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: priceUsd.toFixed(2),
              currency_code: "USD"
            }
          }
        }
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3
      }
    })
  });
  const data = await response.json();
  if (!response.ok || !data.id) {
    console.error("PayPal billing plan creation failed", data);
    throw new Error(data.message ?? `PayPal rejected ${cycle} billing plan creation`);
  }
  return data.id;
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
    const body = await req.json().catch(()=>({}));
    const force = body?.force === true;
    const planIdsFilter = Array.isArray(body?.plan_ids) ? body.plan_ids : null;
    let query = supabase.from("subscription_plans").select("id, name, audience, monthly_price_kes, annual_price_kes, paypal_product_id, paypal_monthly_plan_id, paypal_annual_plan_id").order("audience").order("monthly_price_kes");
    if (planIdsFilter) query = query.in("id", planIdsFilter);
    const { data: plans, error: plansError } = await query;
    if (plansError) throw new Error("Unable to load plans");
    if (!plans || plans.length === 0) return jsonResponse({
      success: true,
      processed: 0,
      results: []
    });
    const targets = force ? plans : plans.filter((p)=>!p.paypal_monthly_plan_id || !p.paypal_annual_plan_id);
    if (targets.length === 0) {
      return jsonResponse({
        success: true,
        processed: 0,
        skipped: plans.length,
        message: "All plans already have PayPal plan IDs configured. Pass force:true to recreate."
      });
    }
    const rate = await getKesUsdRate();
    const paypalToken = await getPaypalAccessToken();
    const results = [];
    for (const plan of targets){
      try {
        const monthlyUsd = Math.round(Number(plan.monthly_price_kes) * rate * 100) / 100;
        const annualUsd = Math.round(Number(plan.annual_price_kes) * rate * 100) / 100;
        const productId = !force && plan.paypal_product_id ? plan.paypal_product_id : await createPaypalProduct(paypalToken, plan.name, plan.audience);
        const monthlyPlanId = await createPaypalBillingPlan(paypalToken, productId, plan.name, plan.audience, "MONTHLY", monthlyUsd);
        const annualPlanId = await createPaypalBillingPlan(paypalToken, productId, plan.name, plan.audience, "ANNUAL", annualUsd);
        const { error: updateError } = await supabase.from("subscription_plans").update({
          paypal_product_id: productId,
          paypal_monthly_plan_id: monthlyPlanId,
          paypal_annual_plan_id: annualPlanId,
          paypal_monthly_price_usd: monthlyUsd,
          paypal_annual_price_usd: annualUsd,
          paypal_fx_rate: rate
        }).eq("id", plan.id);
        if (updateError) throw updateError;
        results.push({
          plan_id: plan.id,
          name: plan.name,
          audience: plan.audience,
          paypal_product_id: productId,
          paypal_monthly_plan_id: monthlyPlanId,
          paypal_annual_plan_id: annualPlanId,
          monthly_price_usd: monthlyUsd,
          annual_price_usd: annualUsd,
          fx_rate: rate,
          status: "created"
        });
      } catch (err) {
        results.push({
          plan_id: plan.id,
          name: plan.name,
          audience: plan.audience,
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error"
        });
      }
    }
    return jsonResponse({
      success: true,
      fx_rate_used: rate,
      processed: results.length,
      skipped: plans.length - targets.length,
      results
    });
  } catch (error) {
    console.error("paypal-setup-plans error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    }, 500);
  }
});
