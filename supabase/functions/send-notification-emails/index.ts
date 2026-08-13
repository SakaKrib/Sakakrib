import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { data: emails, error } = await supabase
      .from("notification_emails")
      .select("id, recipient, subject, html_body")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) throw error;
    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;
    for (const email of emails) {
      try {
        const { error: sendError } = await supabase.auth.admin.sendEmailToUser({
          email: email.recipient,
          subject: email.subject,
          html: email.html_body,
        });

        if (sendError) {
          console.error(`Failed to send to ${email.recipient}:`, sendError.message);
        } else {
          await supabase
            .from("notification_emails")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", email.id);
          sentCount++;
        }
      } catch (err) {
        console.error(`Send error for ${email.recipient}:`, err);
      }
    }

    return new Response(JSON.stringify({ sent: sentCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
