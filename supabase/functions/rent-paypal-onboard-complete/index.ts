import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
// FUTURE FEATURE MUTED:
// PayPal partner merchant onboarding completion is intentionally disabled
// until the required PayPal partner credentials are provisioned securely.
// The original implementation is intentionally not active.
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
  if (req.method !== "POST") return json({
    success: false,
    error: "Method not allowed"
  }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({
      success: false,
      error: "Authentication required"
    }, 401);
    const accessToken = authHeader.slice("Bearer ".length);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false
      }
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !user) return json({
      success: false,
      error: "Invalid authentication"
    }, 401);
    return json({
      success: false,
      disabled: true,
      code: "PAYPAL_RENT_ONBOARDING_DISABLED",
      error: "PayPal rent merchant onboarding is temporarily disabled until partner configuration is available."
    }, 503);
  } catch (error) {
    console.error("rent-paypal-onboard-complete error", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    }, 500);
  }
});
