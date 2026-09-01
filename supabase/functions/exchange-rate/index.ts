import { createClient } from "npm:@supabase/supabase-js@2";
// Public, shared exchange-rate endpoint - the single source of truth
// for currency conversion across every function that needs it
// (PayPal FX for individual listings, PMS subscription plan setup,
// future rent/moving-payment PayPal flows, etc). No auth required by
// design: server-to-server callers (other edge functions, webhooks,
// cron jobs) shouldn't need a user JWT just to ask "what's the
// current rate".
//
// Cache-first: reads exchange_rate_cache for a non-expired row before
// ever calling the external ExchangeRate-API. On a miss/expiry, fetches
// fresh, upserts the cache (now safe via the base_currency/quote_currency
// unique constraint), and returns it. This is also the first thing that
// actually WRITES to exchange_rate_cache - previously only read from as
// a fallback (e.g. in paypal-webhook), with nothing populating it.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const FX_API_KEY = Deno.env.get("EXCHANGERATE_API_KEY") ?? Deno.env.get("EXCHANGE_RATE_API_KEY");
const FX_BASE_URL = Deno.env.get("EXCHANGERATE_API_BASE_URL") ?? "https://v6.exchangerate-api.com/v6";
// How long a cached rate is considered fresh before we re-fetch.
const CACHE_TTL_HOURS = 12;
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
async function fetchFreshRate(base, quote) {
  if (!FX_API_KEY) throw new Error("Exchange-rate service is not configured (EXCHANGERATE_API_KEY missing)");
  const response = await fetch(`${FX_BASE_URL}/${FX_API_KEY}/pair/${base}/${quote}`);
  const data = await response.json();
  if (!response.ok || data.result !== "success" || !Number.isFinite(Number(data.conversion_rate)) || Number(data.conversion_rate) <= 0) {
    console.error("ExchangeRate-API error", data);
    throw new Error(`Unable to obtain current ${base}/${quote} exchange rate`);
  }
  return Number(data.conversion_rate);
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
  if (req.method !== "GET" && req.method !== "POST") return jsonResponse({
    success: false,
    error: "Method not allowed"
  }, 405);
  try {
    let base = "KES";
    let quote = "USD";
    if (req.method === "POST") {
      const body = await req.json().catch(()=>({}));
      if (typeof body?.base === "string" && body.base.trim()) base = body.base.trim().toUpperCase();
      if (typeof body?.quote === "string" && body.quote.trim()) quote = body.quote.trim().toUpperCase();
    } else {
      const url = new URL(req.url);
      base = (url.searchParams.get("base") ?? base).toUpperCase();
      quote = (url.searchParams.get("quote") ?? quote).toUpperCase();
    }
    if (base === quote) return jsonResponse({
      success: false,
      error: "base and quote currencies must differ"
    }, 400);
    const { data: cached } = await supabase.from("exchange_rate_cache").select("rate, source, fetched_at, expires_at").eq("base_currency", base).eq("quote_currency", quote).maybeSingle();
    if (cached && new Date(cached.expires_at) > new Date()) {
      return jsonResponse({
        success: true,
        base_currency: base,
        quote_currency: quote,
        rate: Number(cached.rate),
        source: cached.source,
        fetched_at: cached.fetched_at,
        expires_at: cached.expires_at,
        cached: true
      });
    }
    const rate = await fetchFreshRate(base, quote);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000);
    const { error: upsertError } = await supabase.from("exchange_rate_cache").upsert({
      base_currency: base,
      quote_currency: quote,
      rate,
      source: "ExchangeRate-API",
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    }, {
      onConflict: "base_currency,quote_currency"
    });
    if (upsertError) console.error("Failed to cache exchange rate:", upsertError);
    return jsonResponse({
      success: true,
      base_currency: base,
      quote_currency: quote,
      rate,
      source: "ExchangeRate-API",
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      cached: false
    });
  } catch (error) {
    console.error("exchange-rate error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error"
    }, 500);
  }
});
