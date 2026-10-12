import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");
  const authorization = request.headers.get("authorization");
  if (!serviceRoleKey || authorization !== `Bearer ${serviceRoleKey}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  if (!publicKey || !privateKey || !subject) {
    return Response.json({ error: "Web push is not configured" }, { status: 503, headers: corsHeaders });
  }

  let body: { reference?: unknown; event?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
  }
  if (
    typeof body.reference !== "string"
    || body.reference.length > 80
    || typeof body.event !== "string"
    || !["new", "approved", "rejected", "delivered", "completed"].includes(body.event)
  ) {
    return Response.json({ error: "Invalid order notification" }, { status: 400, headers: corsHeaders });
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  if (!projectUrl) {
    return Response.json({ error: "Supabase URL is missing" }, { status: 503, headers: corsHeaders });
  }
  const supabase = createClient(projectUrl, serviceRoleKey);
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("reference, status")
    .eq("reference", body.reference)
    .maybeSingle();
  if (orderError) {
    console.error("Could not verify order before notification", orderError);
    return Response.json({ error: "Could not verify order" }, { status: 500, headers: corsHeaders });
  }
  if (!order) {
    return Response.json({ error: "Order not found" }, { status: 404, headers: corsHeaders });
  }

  if (body.event === "approved" && order.status !== "Approved") {
    return Response.json({ error: "Order is not approved" }, { status: 409, headers: corsHeaders });
  }
  if (body.event === "rejected" && order.status !== "Rejected") {
    return Response.json({ error: "Order is not rejected" }, { status: 409, headers: corsHeaders });
  }
  if (body.event === "delivered" && order.status !== "Delivered") {
    return Response.json({ error: "Order is not delivered" }, { status: 409, headers: corsHeaders });
  }
  if (body.event === "completed" && order.status !== "Completed") {
    return Response.json({ error: "Order is not completed" }, { status: 409, headers: corsHeaders });
  }
  const { data: subscriptions, error: subscriptionError } = body.event === "new"
    ? await supabase.from("manager_push_subscriptions").select("endpoint, subscription")
    : await supabase.from("customer_push_subscriptions")
      .select("endpoint, subscription, language")
      .eq("reference", body.reference);
  if (subscriptionError) {
    console.error("Could not load manager push subscriptions", subscriptionError);
    return Response.json({ error: "Could not load manager devices" }, { status: 500, headers: corsHeaders });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const results = await Promise.all((subscriptions || []).map(async (entry) => {
    const { endpoint, subscription } = entry;
    const language = "language" in entry ? entry.language : "en";
    const payload = JSON.stringify({
      title: body.event === "new"
        ? (language === "hi" ? "नया Shanvi ऑर्डर" : "New Shanvi order")
        : body.event === "rejected"
          ? (language === "hi" ? "ऑर्डर अस्वीकार हुआ" : "Order rejected")
          : body.event === "delivered"
            ? (language === "hi" ? "ऑर्डर डिलीवर हुआ" : "Order delivered")
            : body.event === "completed"
              ? (language === "hi" ? "ऑर्डर पूरा हुआ" : "Order completed")
              : (language === "hi" ? "ऑर्डर मंज़ूर हुआ" : "Order accepted"),
      body: body.event === "new"
        ? (language === "hi" ? `ऑर्डर ${order.reference} मिला` : `Order ${order.reference} received`)
        : body.event === "rejected"
          ? (language === "hi"
            ? `Shanvi General Store ने आपका ऑर्डर ${order.reference} अस्वीकार कर दिया।`
            : `Your order ${order.reference} was rejected by Shanvi General Store.`)
          : body.event === "delivered"
            ? (language === "hi"
              ? `आपका ऑर्डर ${order.reference} डिलीवर कर दिया गया है।`
              : `Your order ${order.reference} has been delivered.`)
            : body.event === "completed"
              ? (language === "hi"
                ? `आपका ऑर्डर ${order.reference} पूरा हो गया है।`
                : `Your order ${order.reference} is complete.`)
              : (language === "hi"
                ? `Shanvi General Store ने आपका ऑर्डर ${order.reference} स्वीकार कर लिया।`
                : `Your order ${order.reference} was accepted by Shanvi General Store.`),
      reference: order.reference,
    });
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 60 });
      return true;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        const expiredSubscriptions = body.event === "new"
          ? supabase.from("manager_push_subscriptions").delete().eq("endpoint", endpoint)
          : supabase.from("customer_push_subscriptions").delete().eq("endpoint", endpoint).eq("reference", body.reference);
        const { error: deleteError } = await expiredSubscriptions;
        if (deleteError) console.error("Could not remove expired push subscription", deleteError);
      } else {
        console.error("Could not send order push notification", error);
      }
      return false;
    }
  }));

  return Response.json({ sent: results.filter(Boolean).length }, { headers: corsHeaders });
});
