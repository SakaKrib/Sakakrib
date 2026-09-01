import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM");
const CRON_SECRET = Deno.env.get("CRON_SECRET");
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
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  if (req.method !== "POST") {
    return jsonResponse({
      success: false,
      error: "Method not allowed"
    }, 405);
  }
  try {
    const suppliedSecret = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
    if (!suppliedSecret || suppliedSecret !== CRON_SECRET) {
      return jsonResponse({
        success: false,
        error: "Unauthorized"
      }, 401);
    }
    if (!RESEND_API_KEY || !EMAIL_FROM) {
      return jsonResponse({
        success: false,
        error: "Email service not configured"
      }, 500);
    }
    const { data: pending, error: fetchError } = await supabase.from("notification_emails").select("id, recipient, subject, html_body").eq("status", "pending").order("created_at", {
      ascending: true
    }).limit(25);
    if (fetchError) {
      console.error("Queue fetch failed:", fetchError.message);
      return jsonResponse({
        success: false,
        error: "Unable to load queue"
      }, 500);
    }
    let sent = 0;
    let failed = 0;
    for (const email of pending ?? []){
      try {
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: EMAIL_FROM,
            to: [
              email.recipient
            ],
            subject: email.subject,
            html: email.html_body
          })
        });
        if (!resendResponse.ok) {
          const errBody = await resendResponse.json().catch(()=>({}));
          console.error("Resend failed for email:", email.id, errBody);
          await supabase.from("notification_emails").update({
            status: "failed"
          }).eq("id", email.id);
          failed++;
          continue;
        }
        await supabase.from("notification_emails").update({
          status: "sent",
          sent_at: new Date().toISOString()
        }).eq("id", email.id);
        sent++;
      } catch (err) {
        console.error("Send error for email:", email.id, err);
        await supabase.from("notification_emails").update({
          status: "failed"
        }).eq("id", email.id);
        failed++;
      }
    }
    return jsonResponse({
      success: true,
      sent,
      failed,
      total: (pending ?? []).length
    });
  } catch (error) {
    console.error("email queue error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    }, 500);
  }
});
