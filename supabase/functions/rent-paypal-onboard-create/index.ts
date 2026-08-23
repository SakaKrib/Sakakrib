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
const PAYPAL_PARTNER_MERCHANT_ID = Deno.env.get("PAYPAL_PARTNER_MERCHANT_ID")!;
const PAYPAL_PARTNER_ATTRIBUTION_ID = Deno.env.get("PAYPAL_PARTNER_ATTRIBUTION_ID") ?? "";
const PAYPAL_PARTNER_RETURN_URL = Deno.env.get("PAYPAL_PARTNER_RETURN_URL")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function paypalToken(): Promise<string> {
  const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("Unable to authenticate with PayPal");
  const data = await response.json();
  if (!data.access_token) throw new Error("PayPal access token missing");
  return data.access_token;
}

function randomTrackingId(userId: string): string {
  const suffix = crypto.randomUUID().replaceAll("-", "");
  return `SAKACRIB-RENT-${userId.replaceAll("-", "").slice(0, 12)}-${suffix}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ success: false, error: "Authentication required" }, 401);

    const accessToken = authHeader.slice("Bearer ".length);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !user) return json({ success: false, error: "Invalid authentication" }, 401);

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role,full_name,email")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || !["landlord", "real_estate"].includes(String(profile.role).toLowerCase())) {
      return json({ success: false, error: "Only landlord or real-estate accounts can connect PayPal for rent collection" }, 403);
    }

    if (!PAYPAL_PARTNER_MERCHANT_ID || !PAYPAL_PARTNER_RETURN_URL) {
      return json({ success: false, error: "PayPal partner onboarding is not configured" }, 503);
    }

    const { data: existing } = await admin
      .from("landlord_paypal_connections")
      .select("id,status,merchant_id,tracking_id")
      .eq("landlord_user_id", user.id)
      .maybeSingle();

    if (existing?.status === "CONNECTED" && existing.merchant_id) {
      return json({
        success: true,
        already_connected: true,
        status: existing.status,
        merchant_id: existing.merchant_id,
      });
    }

    const trackingId = existing?.tracking_id ?? randomTrackingId(user.id);
    const token = await paypalToken();

    const referralResponse = await fetch(`${PAYPAL_BASE_URL}/v2/customer/partner-referrals`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(PAYPAL_PARTNER_ATTRIBUTION_ID
          ? { "PayPal-Partner-Attribution-Id": PAYPAL_PARTNER_ATTRIBUTION_ID }
          : {}),
      },
      body: JSON.stringify({
        tracking_id: trackingId,
        partner_config_override: {
          return_url: PAYPAL_PARTNER_RETURN_URL,
        },
        operations: [{
          operation: "API_INTEGRATION",
          api_integration_preference: {
            rest_api_integration: {
              integration_method: "PAYPAL",
              integration_type: "THIRD_PARTY",
              third_party_details: {
                features: ["PAYMENT", "REFUND"],
              },
            },
          },
        }],
        products: ["EXPRESS_CHECKOUT"],
        legal_consents: [{
          type: "SHARE_DATA_CONSENT",
          granted: true,
        }],
        // Pre-fill only non-secret seller information.
        // PayPal performs its own KYC/risk checks during onboarding.
        individual_owner: {
          names: [{
            prefix: "",
            given_name: String(profile.full_name ?? user.user_metadata?.full_name ?? "").split(" ")[0] ?? "",
            surname: String(profile.full_name ?? user.user_metadata?.full_name ?? "").split(" ").slice(1).join(" ") ?? "",
          }],
          email_address: String(profile.email ?? user.email ?? ""),
        },
      }),
    });

    const referral = await referralResponse.json();
    if (!referralResponse.ok) {
      console.error("PayPal partner referral failed", referral);
      return json({ success: false, error: referral?.message ?? "PayPal onboarding could not be started" }, 400);
    }

    const actionUrl = referral.links?.find((link: { rel?: string }) => link.rel === "action_url")?.href;
    if (!actionUrl) return json({ success: false, error: "PayPal did not return an onboarding URL" }, 502);

    const now = new Date().toISOString();
    const payload = {
      landlord_user_id: user.id,
      tracking_id: trackingId,
      status: "PENDING",
      payments_receivable: false,
      primary_email_confirmed: false,
      permissions_granted: false,
      consent_status: false,
      last_status_payload: {
        referral_id: referral.id ?? null,
        created_at: now,
      },
      updated_at: now,
    };

    if (existing) {
      const { error } = await admin
        .from("landlord_paypal_connections")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await admin.from("landlord_paypal_connections").insert(payload);
      if (error) throw error;
    }

    return json({
      success: true,
      status: "PENDING",
      tracking_id: trackingId,
      action_url: actionUrl,
      expires_after_use: true,
    });
  } catch (error) {
    console.error("rent-paypal-onboard-create error", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
