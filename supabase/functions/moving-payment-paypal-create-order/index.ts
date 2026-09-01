import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const URL = Deno.env.get("SUPABASE_URL");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON = Deno.env.get("SUPABASE_ANON_KEY");
const CLIENT = Deno.env.get("PAYPAL_CLIENT_ID");
const SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET");
const BASE = Deno.env.get("PAYPAL_BASE_URL") ?? "https://api-m.sandbox.paypal.com";
const FXKEY = Deno.env.get("EXCHANGERATE_API_KEY") ?? Deno.env.get("EXCHANGE_RATE_API_KEY");
const FXBASE = Deno.env.get("EXCHANGERATE_API_BASE_URL") ?? "https://v6.exchangerate-api.com/v6";
const db = createClient(URL, SERVICE, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (b, s = 200)=>new Response(JSON.stringify(b), {
    status: s,
    headers: {
      ...cors,
      "Content-Type": "application/json"
    }
  });
async function token() {
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${CLIENT}:${SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!r.ok) throw new Error("Unable to authenticate with PayPal");
  const d = await r.json();
  if (!d.access_token) throw new Error("PayPal access token missing");
  return d.access_token;
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    status: 200,
    headers: cors
  });
  if (req.method !== "POST") return json({
    success: false,
    error: "Method not allowed"
  }, 405);
  try {
    const a = req.headers.get("Authorization");
    if (!a?.startsWith("Bearer ")) return json({
      success: false,
      error: "Authentication required"
    }, 401);
    const uc = createClient(URL, ANON);
    const { data: { user }, error: ae } = await uc.auth.getUser(a.slice(7));
    if (ae || !user) return json({
      success: false,
      error: "Invalid authentication"
    }, 401);
    const { booking_id } = await req.json();
    if (!booking_id) return json({
      success: false,
      error: "booking_id is required"
    }, 400);
    const { data: b, error: be } = await db.from("bookings").select("id,renter_id,mover_id,total_amount,status,payment_status").eq("id", booking_id).maybeSingle();
    if (be) throw be;
    if (!b || b.renter_id !== user.id) return json({
      success: false,
      error: "Booking not found"
    }, 404);
    if (b.status !== "confirmed") return json({
      success: false,
      error: "Booking must be confirmed before payment"
    }, 409);
    if (b.payment_status === "paid") return json({
      success: false,
      error: "Booking is already paid"
    }, 409);
    const { data: inv, error: ie } = await db.from("moving_invoices").select("id,invoice_number,amount_kes,status,payment_provider,provider_reference").eq("booking_id", booking_id).maybeSingle();
    if (ie) throw ie;
    if (!inv) return json({
      success: false,
      error: "Moving invoice has not been issued"
    }, 409);
    if (Number(inv.amount_kes) !== Number(b.total_amount)) return json({
      success: false,
      error: "Invoice amount does not match booking"
    }, 409);
    const { data: existing, error: pe } = await db.from("moving_payments").select("id,status,provider,provider_reference,amount_kes,paypal_order_id,provider_amount,provider_currency").eq("booking_id", booking_id).in("status", [
      "PENDING",
      "PROCESSING",
      "HELD"
    ]).order("created_at", {
      ascending: false
    }).limit(1).maybeSingle();
    if (pe) throw pe;
    if (existing?.status === "HELD") return json({
      success: false,
      error: "Booking payment is already held"
    }, 409);
    if (existing && existing.provider !== "PAYPAL") return json({
      success: false,
      error: "An active payment attempt already exists for another provider"
    }, 409);
    if (existing?.provider_reference && existing.provider_amount && existing.provider_currency === "USD") return json({
      success: true,
      order_id: existing.provider_reference,
      amount_kes: Number(b.total_amount),
      amount_usd: Number(existing.provider_amount),
      currency: "USD",
      reused: true
    });
    if (!FXKEY) return json({
      success: false,
      error: "Exchange-rate service is not configured"
    }, 503);
    const fx = await fetch(`${FXBASE}/${FXKEY}/pair/KES/USD`);
    const fd = await fx.json();
    const rate = Number(fd?.conversion_rate);
    if (!fx.ok || fd?.result !== "success" || !Number.isFinite(rate) || rate <= 0) return json({
      success: false,
      error: "Unable to obtain current KES/USD exchange rate"
    }, 502);
    const usd = Math.round(Number(b.total_amount) * rate * 100) / 100;
    if (usd <= 0) return json({
      success: false,
      error: "Invalid PayPal amount"
    }, 409);
    const pt = await token();
    const pr = await fetch(`${BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pt}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: usd.toFixed(2)
            },
            description: `Saka Krib moving service ${inv.invoice_number}`,
            custom_id: `moving:${booking_id}`
          }
        ],
        application_context: {
          brand_name: "Saka Krib",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW"
        }
      })
    });
    const pd = await pr.json();
    if (!pr.ok || !pd.id) return json({
      success: false,
      error: pd?.message ?? "PayPal rejected request"
    }, 400);
    const orderId = pd.id;
    if (existing) {
      const { error: u } = await db.from("moving_payments").update({
        provider: "PAYPAL",
        provider_reference: orderId,
        paypal_order_id: orderId,
        provider_amount: usd,
        provider_currency: "USD",
        updated_at: new Date().toISOString()
      }).eq("id", existing.id).in("status", [
        "PENDING",
        "PROCESSING"
      ]);
      if (u) throw u;
    } else {
      const { error: i } = await db.from("moving_payments").insert({
        booking_id,
        invoice_id: inv.id,
        payer_id: user.id,
        amount_kes: Number(b.total_amount),
        provider: "PAYPAL",
        status: "PENDING",
        provider_reference: orderId,
        paypal_order_id: orderId,
        provider_amount: usd,
        provider_currency: "USD"
      });
      if (i) throw i;
    }
    const approval = (pd.links ?? []).find((x)=>x.rel === "approve")?.href ?? null;
    return json({
      success: true,
      booking_id,
      order_id: orderId,
      amount_kes: Number(b.total_amount),
      amount_usd: usd,
      currency: "USD",
      fx_rate: rate,
      approval_url: approval
    });
  } catch (e) {
    console.error("moving-payment-paypal-create-order", e);
    return json({
      success: false,
      error: e instanceof Error ? e.message : "Internal server error"
    }, 500);
  }
});
