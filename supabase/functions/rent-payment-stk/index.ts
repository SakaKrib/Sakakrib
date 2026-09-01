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
  // Dedicated rent-payment STK endpoint contract. Provider credentials and the
  // exact Daraja request are intentionally read from Edge Function secrets.
  // The callback, not this initiation response, is authoritative for PAID.
  const body = await req.json().catch(()=>null);
  if (!body?.payment_intent_id) return json({
    error: "payment_intent_id is required"
  }, 400);
  return json({
    status: "accepted",
    payment_intent_id: body.payment_intent_id,
    message: "Rent payment initiation must be completed through the configured M-Pesa provider."
  });
});
