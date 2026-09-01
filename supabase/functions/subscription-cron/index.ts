import "https://esm.sh/@supabase/functions-js@2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
Deno.serve(async (req)=>{
  if (req.method !== "POST") return jsonResponse({
    success: false,
    error: "Method not allowed"
  }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return jsonResponse({
      success: false,
      error: "Unauthorized"
    }, 401);
    if (authorization.substring("Bearer ".length) !== CRON_SECRET) return jsonResponse({
      success: false,
      error: "Unauthorized"
    }, 401);
    const { data: expiryData, error: expiryError } = await supabase.rpc("process_subscription_expiry");
    if (expiryError) {
      console.error("Subscription expiry RPC failed:", expiryError);
      return jsonResponse({
        success: false,
        error: "Subscription expiry processing failed"
      }, 500);
    }
    const emailResponse = await fetch(`${SUPABASE_URL}/functions/v1/process-notification-email-queue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source: "subscription-cron"
      })
    });
    const emailData = await emailResponse.json().catch(()=>({}));
    if (!emailResponse.ok) console.error("Notification email queue failed:", emailData);
    return jsonResponse({
      success: true,
      expiry: expiryData ?? null,
      email_queue: emailData
    });
  } catch (error) {
    console.error("Subscription cron error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    }, 500);
  }
});
