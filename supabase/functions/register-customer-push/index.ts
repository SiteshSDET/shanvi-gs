import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey) {
    return Response.json({ error: "Push registration is not configured" }, { status: 503, headers: corsHeaders });
  }

  let body: { reference?: unknown; token?: unknown; subscription?: unknown; language?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
  }
  if (
    typeof body.reference !== "string"
    || body.reference.length > 80
    || typeof body.token !== "string"
    || !/^[a-f0-9]{64}$/.test(body.token)
    || (body.language !== "en" && body.language !== "hi")
    || !body.subscription
    || typeof body.subscription !== "object"
  ) {
    return Response.json({ error: "Invalid order notification request" }, { status: 400, headers: corsHeaders });
  }
  const subscription = body.subscription as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  if (
    typeof subscription.endpoint !== "string"
    || subscription.endpoint.length > 2048
    || !subscription.endpoint.startsWith("https://")
    || typeof subscription.keys?.p256dh !== "string"
    || typeof subscription.keys?.auth !== "string"
  ) {
    return Response.json({ error: "Invalid push subscription" }, { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(projectUrl, serviceRoleKey);
  const { data: order, error: orderError } = await supabase.from("orders")
    .select("reference, status")
    .eq("reference", body.reference)
    .eq("customer_status_token_hash", await sha256Hex(body.token))
    .maybeSingle();
  if (orderError) {
    console.error("Could not verify customer order notification request", orderError);
    return Response.json({ error: "Could not verify order" }, { status: 500, headers: corsHeaders });
  }
  if (!order) {
    return Response.json({ error: "Order reference or notification token is invalid" }, { status: 401, headers: corsHeaders });
  }

  const { error } = await supabase.from("customer_push_subscriptions").upsert(
    { endpoint: subscription.endpoint, reference: body.reference, subscription, language: body.language },
    { onConflict: "endpoint,reference" },
  );
  if (error) {
    console.error("Could not save customer push subscription", error);
    return Response.json({ error: "Could not register this device" }, { status: 500, headers: corsHeaders });
  }
  return Response.json({ registered: true, status: order.status }, { headers: corsHeaders });
});
