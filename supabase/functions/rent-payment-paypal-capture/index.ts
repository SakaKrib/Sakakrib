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
  if (!body?.payment_intent_id || !body?.order_id) return json({
    error: "payment_intent_id and order_id are required"
  }, 400);
  // Capture is only a provider operation. PAID is assigned only after the
  // verified PayPal webhook and database finalization path succeeds.
  return json({
    status: "accepted",
    payment_intent_id: body.payment_intent_id,
    order_id: body.order_id,
    message: "Capture request accepted; webhook/provider confirmation is authoritative for PAID."
  });
});
