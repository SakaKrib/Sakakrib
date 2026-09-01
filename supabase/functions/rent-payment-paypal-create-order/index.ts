import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const json = (body, status = 200)=>new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
Deno.serve(async (req)=>{
  if (req.method !== "POST") return json({
    error: "Method not allowed"
  }, 405);
  const body = await req.json().catch(()=>null);
  if (!body?.payment_intent_id) return json({
    error: "payment_intent_id is required"
  }, 400);
  // Dedicated rent PayPal order endpoint. The order amount must be derived from
  // the server-side rent payment intent, never from a trusted client amount.
  return json({
    status: "accepted",
    payment_intent_id: body.payment_intent_id,
    message: "PayPal rent order creation contract is ready; server-side PayPal credentials and intent validation are required."
  });
});
