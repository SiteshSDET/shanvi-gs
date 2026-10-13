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
  if (Number(request.headers.get("content-length") || 0) > 4096) {
    return Response.json({ error: "Request is too large" }, { status: 413, headers: corsHeaders });
  }

  let body: { reference?: unknown; token?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
  }
  if (
    typeof body.reference !== "string"
    || !/^(?:SGS-[A-F0-9]{16}|SNVGS-[0-9]{4}-[A-F0-9]{12})$/.test(body.reference)
    || typeof body.token !== "string"
    || !/^[a-f0-9]{64}$/.test(body.token)
  ) {
    return Response.json({ error: "Invalid order reference or access token" }, { status: 400, headers: corsHeaders });
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey) {
    return Response.json({ error: "Order status is not configured" }, { status: 503, headers: corsHeaders });
  }

  const supabase = createClient(projectUrl, serviceRoleKey);
  const { data: order, error } = await supabase.from("orders")
    .select("reference, status, rejection_reason, payment_method, created_at")
    .eq("reference", body.reference)
    .eq("customer_status_token_hash", await sha256Hex(body.token))
    .maybeSingle();
  if (error) {
    console.error("Could not check customer order status", error);
    return Response.json({ error: "Could not check order status" }, { status: 500, headers: corsHeaders });
  }
  if (!order) {
    return Response.json({ error: "Order not found" }, { status: 404, headers: corsHeaders });
  }

  return Response.json(
    {
      reference: order.reference,
      status: order.status,
      rejectionReason: order.rejection_reason,
      paymentMethod: order.payment_method,
      createdAt: order.created_at,
    },
    { headers: corsHeaders },
  );
});
