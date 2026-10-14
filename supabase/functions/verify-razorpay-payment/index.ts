import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function paymentSignature(orderId: string, paymentId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${orderId}|${paymentId}`),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const requestText = await request.text();
  if (new TextEncoder().encode(requestText).length > 4096) return json({ error: "Request is too large" }, 413);

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(requestText);
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return json({ error: "Invalid request body" }, 400);
  }
  const body = parsedBody as Record<string, unknown>;
  const { orderId, paymentId, signature } = body;
  if (typeof orderId !== "string" || !/^order_[A-Za-z0-9]+$/.test(orderId)
    || typeof paymentId !== "string" || !/^pay_[A-Za-z0-9]+$/.test(paymentId)
    || typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) {
    return json({ error: "Invalid payment verification details" }, 400);
  }

  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!keyId || !keySecret || !projectUrl || !serviceRoleKey) {
    return json({ error: "Secure payment verification is not configured" }, 503);
  }
  const expectedSignature = await paymentSignature(orderId, paymentId, keySecret);
  if (!constantTimeEqual(signature.toLowerCase(), expectedSignature)) {
    return json({ error: "Payment signature is invalid" }, 400);
  }

  const supabase = createClient(projectUrl, serviceRoleKey);
  const { data: attempt, error: attemptError } = await supabase
    .from("razorpay_payment_attempts")
    .select("reference, amount, order_payload, status, payment_id, expires_at")
    .eq("razorpay_order_id", orderId)
    .maybeSingle();
  if (attemptError) {
    console.error("Could not load Razorpay attempt", attemptError);
    return json({ error: "Payment verification storage is unavailable" }, 503);
  }
  if (!attempt) return json({ error: "Payment attempt was not found" }, 404);
  if (attempt.status === "verified") {
    return attempt.payment_id === paymentId
      ? json({ verified: true, reference: attempt.reference })
      : json({ error: "This payment attempt was already used" }, 409);
  }
  if (attempt.status !== "created") {
    return json({ error: "This payment attempt is no longer active. Contact the store." }, 409);
  }

  let gatewayResponse: Response;
  try {
    gatewayResponse = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Basic ${btoa(`${keyId}:${keySecret}`)}` },
    });
  } catch (error) {
    console.error("Could not retrieve Razorpay payment", error);
    return json({ error: "Could not contact the payment provider. Retry verification shortly." }, 502);
  }
  const payment = await gatewayResponse.json().catch(() => null);
  if (!gatewayResponse.ok) {
    console.error("Razorpay payment lookup failed", gatewayResponse.status, payment?.error?.code);
    return json({ error: "Could not verify payment with the provider. Retry shortly." }, 502);
  }
  if (payment?.order_id !== orderId
    || payment?.status !== "captured"
    || payment?.captured !== true
    || payment?.amount !== attempt.amount
    || payment?.currency !== "INR"
    || payment?.method !== "upi") {
    return json({ error: "Payment is not captured for this order yet." }, 409);
  }
  if (!attempt.order_payload || typeof attempt.order_payload !== "object"
    || attempt.order_payload.reference !== attempt.reference) {
    console.error("Razorpay attempt contains an invalid order payload", orderId);
    return json({ error: "Stored order details are invalid. Contact the store." }, 500);
  }

  const { data: existingOrder, error: existingError } = await supabase.from("orders")
    .select("reference, razorpay_payment_id")
    .eq("reference", attempt.reference)
    .maybeSingle();
  if (existingError) {
    console.error("Could not check for an existing paid order", existingError);
    return json({ error: "Could not save the verified order. Retry shortly." }, 503);
  }
  if (existingOrder) {
    if (existingOrder.razorpay_payment_id === paymentId) {
      const { error: recoveredAttemptError } = await supabase.from("razorpay_payment_attempts")
        .update({ status: "verified", payment_id: paymentId, order_payload: {}, updated_at: new Date().toISOString() })
        .eq("razorpay_order_id", orderId);
      if (recoveredAttemptError) {
        console.error("Could not recover verified Razorpay attempt", recoveredAttemptError);
        return json({ error: "Order was saved and payment verified. Retry verification shortly." }, 503);
      }
      return json({ verified: true, reference: attempt.reference });
    }
    return json({ error: "This order reference has already been used. Contact the store." }, 409);
  }

  const { error: insertError } = await supabase.from("orders").insert({
    ...attempt.order_payload,
    razorpay_payment_id: paymentId,
  });
  if (insertError) {
    console.error("Could not save verified Razorpay order", insertError);
    return json({ error: "Payment was captured but the order could not be saved yet. Retry verification; do not pay again." }, 503);
  }
  const { error: updateError } = await supabase.from("razorpay_payment_attempts")
    .update({ status: "verified", payment_id: paymentId, order_payload: {}, updated_at: new Date().toISOString() })
    .eq("razorpay_order_id", orderId)
    .eq("status", "created");
  if (updateError) {
    console.error("Could not mark Razorpay attempt verified", updateError);
    return json({ error: "Payment was captured. Retry verification; do not pay again." }, 503);
  }
  return json({ verified: true, reference: attempt.reference });
});
