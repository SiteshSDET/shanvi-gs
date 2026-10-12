import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const enrollmentCode = Deno.env.get("MANAGER_ENROLLMENT_CODE");
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!enrollmentCode || !projectUrl || !serviceRoleKey) {
    return Response.json({ error: "Push registration is not configured" }, { status: 503, headers: corsHeaders });
  }

  let body: { code?: unknown; subscription?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
  }
  const subscription = body.subscription;
  if (body.code !== enrollmentCode || !subscription || typeof subscription !== "object") {
    return Response.json({ error: "Invalid manager setup code or subscription" }, { status: 401, headers: corsHeaders });
  }
  const value = subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (
    typeof value.endpoint !== "string"
    || value.endpoint.length > 2048
    || !value.endpoint.startsWith("https://")
    || typeof value.keys?.p256dh !== "string"
    || typeof value.keys?.auth !== "string"
  ) {
    return Response.json({ error: "Invalid push subscription" }, { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(projectUrl, serviceRoleKey);
  const { error } = await supabase.from("manager_push_subscriptions").upsert(
    { endpoint: value.endpoint, subscription },
    { onConflict: "endpoint" },
  );
  if (error) {
    console.error("Could not save manager push subscription", error);
    return Response.json({ error: "Could not register this device" }, { status: 500, headers: corsHeaders });
  }
  return Response.json({ registered: true }, { headers: corsHeaders });
});
