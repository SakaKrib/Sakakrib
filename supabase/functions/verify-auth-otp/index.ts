import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const { email, otp, purpose } = body as { email?: string; otp?: string; purpose?: string };

    if (!email || !otp) {
      return jsonResponse({ success: false, error: "email and otp are required" }, 400);
    }

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: purpose === "signup" ? "signup" : "email",
    });

    if (verifyError) {
      return jsonResponse({ success: false, error: verifyError.message }, 400);
    }

    return jsonResponse({
      success: true,
      access_token: data.session?.access_token ?? null,
      refresh_token: data.session?.refresh_token ?? null,
      user_id: data.user?.id ?? null,
    });
  } catch (error) {
    console.error("verify-auth-otp error:", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      500
    );
  }
});
