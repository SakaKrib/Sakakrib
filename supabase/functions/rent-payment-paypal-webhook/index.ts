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
  const rawBody = await req.text();
  let data;
  try {
    data = JSON.parse(rawBody);
  } catch  {
    return json({
      error: "Invalid JSON"
    }, 400);
  }
  // IMPORTANT: This endpoint is intentionally public because PayPal calls it.
  // Before production payment finalization, verify the PayPal webhook signature
  // using PayPal's webhook verification API/credentials. Never trust the body alone.
  const eventType = String(data?.event_type ?? "").toUpperCase();
  const resource = data?.resource ?? {};
  const relevant = new Set([
    "PAYMENT.CAPTURE.COMPLETED",
    "CHECKOUT.ORDER.COMPLETED",
    "PAYMENT.CAPTURE.DENIED",
    "PAYMENT.CAPTURE.DECLINED",
    "PAYMENT.CAPTURE.REVERSED",
    "PAYMENT.CAPTURE.REFUNDED"
  ]);
  if (!relevant.has(eventType)) return json({
    status: "ignored"
  });
  const orderId = resource?.supplementary_data?.related_ids?.order_id ?? resource?.id ?? null;
  const captureId = resource?.id ?? null;
  const status = String(resource?.status ?? "").toUpperCase();
  // No rent record is marked PAID here yet. The production implementation must:
  // 1) verify the PayPal signature;
  // 2) resolve the rent_payment_intent by our PayPal order/reference;
  // 3) verify amount/currency/order/capture and renter/unit/periods;
  // 4) call the protected process_rent_payment() exactly once (idempotently).
  return json({
    status: "received",
    event_type: eventType,
    order_id: orderId,
    capture_id: captureId,
    provider_status: status
  });
});
