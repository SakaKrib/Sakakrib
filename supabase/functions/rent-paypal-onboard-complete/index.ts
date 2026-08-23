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

    const body = await req.json();
    const suppliedTrackingId = String(body?.tracking_id ?? "");
    const suppliedMerchantId = String(body?.merchant_id_in_paypal ?? "");
    const permissionsGranted = String(body?.permissions_granted ?? "").toLowerCase() === "true";
    const consentStatus = String(body?.consent_status ?? "").toLowerCase() === "true";

    const { data: connection, error: connectionError } = await admin
      .from("landlord_paypal_connections")
      .select("id,tracking_id,merchant_id,status")
      .eq("landlord_user_id", user.id)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection) return json({ success: false, error: "No PayPal onboarding session found" }, 404);

    if (suppliedTrackingId && suppliedTrackingId !== connection.tracking_id) {
      return json({ success: false, error: "PayPal onboarding tracking ID does not match" }, 403);
    }

    if (!PAYPAL_PARTNER_MERCHANT_ID) return json({ success: false, error: "PayPal partner merchant ID is not configured" }, 503);

    const token = await paypalToken();
    const statusUrl = `${PAYPAL_BASE_URL}/v1/customer/partners/${encodeURIComponent(PAYPAL_PARTNER_MERCHANT_ID)}/merchant-integrations?tracking_id=${encodeURIComponent(connection.tracking_id)}`;
    const statusResponse = await fetch(statusUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(PAYPAL_PARTNER_ATTRIBUTION_ID
          ? { "PayPal-Partner-Attribution-Id": PAYPAL_PARTNER_ATTRIBUTION_ID }
          : {}),
      },
    });
    const statusPayload = await statusResponse.json();

    if (!statusResponse.ok) {
      console.error("PayPal merchant status lookup failed", statusPayload);
      return json({ success: false, error: statusPayload?.message ?? "Unable to verify PayPal merchant onboarding" }, 400);
    }

    const merchant = Array.isArray(statusPayload?.merchant_integrations)
      ? statusPayload.merchant_integrations[0]
      : statusPayload;

    const merchantId = String(
      merchant?.merchant_id ?? suppliedMerchantId ?? connection.merchant_id ?? "",
    );
    const paymentsReceivable = merchant?.payments_receivable === true;
    const emailConfirmed = merchant?.primary_email_confirmed === true;
    const granted = Array.isArray(merchant?.granted_permissions)
      ? merchant.granted_permissions.length > 0
      : permissionsGranted;

    const connected = Boolean(
      merchantId &&
      paymentsReceivable &&
      emailConfirmed &&
      granted,
    );

    const nextStatus = connected
      ? "CONNECTED"
      : merchant?.risk_status === "DECLINED"
        ? "REJECTED"
        : "ACTION_REQUIRED";

    const now = new Date().toISOString();
    const update = {
      merchant_id: merchantId || null,
      status: nextStatus,
      payments_receivable: paymentsReceivable,
      primary_email_confirmed: emailConfirmed,
      permissions_granted: granted,
      consent_status: consentStatus || Boolean(merchant?.oauth_third_party),
      account_status: merchant?.account_status ?? null,
      primary_email: merchant?.primary_email ?? null,
      legal_name: merchant?.legal_name ?? null,
      products: merchant?.products ?? [],
      granted_permissions: merchant?.granted_permissions ?? [],
      last_status_payload: statusPayload,
      connected_at: connected ? now : null,
      disconnected_at: null,
      updated_at: now,
    };

    const { error: updateError } = await admin
      .from("landlord_paypal_connections")
      .update(update)
      .eq("id", connection.id)
      .eq("landlord_user_id", user.id);
    if (updateError) throw updateError;

    return json({
      success: true,
      status: nextStatus,
      connected,
      merchant_id: merchantId || null,
      payments_receivable: paymentsReceivable,
      primary_email_confirmed: emailConfirmed,
      permissions_granted: granted,
      consent_status: update.consent_status,
      primary_email: merchant?.primary_email ?? null,
      legal_name: merchant?.legal_name ?? null,
    });
  } catch (error) {
    console.error("rent-paypal-onboard-complete error", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
