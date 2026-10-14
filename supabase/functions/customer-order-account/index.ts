import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OrderCredential = { reference: string; token: string };

function respond(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validReference(value: unknown): value is string {
  return typeof value === "string"
    && /^(?:SGS-[A-F0-9]{16}|SNVGS-[0-9]{4}-[A-F0-9]{12})$/.test(value);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  if (Number(request.headers.get("content-length") || 0) > 32768) {
    return respond({ error: "Request is too large" }, 413);
  }

  let body: {
    action?: unknown;
    phone?: unknown;
    password?: unknown;
    orders?: unknown;
    reference?: unknown;
    token?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return respond({ error: "Invalid JSON body" }, 400);
  }
  if (!["register", "link", "list"].includes(String(body.action))) {
    return respond({ error: "Unsupported customer account action" }, 400);
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey) return respond({ error: "Customer accounts are not configured" }, 503);
  const supabase = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (body.action === "register") {
    const phone = body.phone;
    const password = body.password;
    if (typeof phone !== "string" || !/^[0-9]{10}$/.test(phone)) {
      return respond({ error: "Enter a valid 10-digit mobile number" }, 400);
    }
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      return respond({ error: "Password must be between 8 and 128 characters" }, 400);
    }
    if (!Array.isArray(body.orders) || body.orders.length < 1 || body.orders.length > 30) {
      return respond({ error: "Create your account on the browser where you placed an order" }, 400);
    }
    const credentials = body.orders as OrderCredential[];
    if (credentials.some((entry) =>
      !entry || !validReference(entry.reference) || typeof entry.token !== "string" || !/^[a-f0-9]{64}$/.test(entry.token)
    )) {
      return respond({ error: "Invalid order recovery details" }, 400);
    }

    const references = [...new Set(credentials.map((entry) => entry.reference))];
    const { data: matchingOrders, error: lookupError } = await supabase.from("orders")
      .select("reference, customer_status_token_hash, customer_user_id")
      .eq("customer_phone", phone)
      .in("reference", references);
    if (lookupError) {
      console.error("Could not check customer account recovery orders", lookupError);
      return respond({ error: "Could not verify existing orders" }, 500);
    }
    const tokenHashByReference = new Map(
      await Promise.all(credentials.map(async (entry) => [entry.reference, await sha256Hex(entry.token)] as const)),
    );
    const verifiedOrders = (matchingOrders || []).filter((order) =>
      order.customer_status_token_hash
      && tokenHashByReference.has(order.reference)
      && order.customer_status_token_hash === tokenHashByReference.get(order.reference)
    );
    if (!verifiedOrders.length) {
      return respond({ error: "No saved order for this mobile number could be verified in this browser" }, 403);
    }
    const existingAccountIds = [...new Set(
      verifiedOrders.map((order) => order.customer_user_id).filter((id): id is string => typeof id === "string"),
    )];
    if (existingAccountIds.length > 1) {
      return respond({ error: "These orders are linked to different accounts. Contact the store for help." }, 409);
    }

    let accountUserId = "";
    let createdNewAccount = false;
    const existingAccountId = existingAccountIds[0];
    if (existingAccountId) {
      const { data: existingUser, error: existingUserError } = await supabase.auth.admin.getUserById(existingAccountId);
      if (existingUserError || !existingUser.user || existingUser.user.app_metadata?.customer_account !== true
        || existingUser.user.app_metadata?.customer_phone !== phone) {
        console.error("Could not verify existing customer account", existingUserError);
        return respond({ error: "Could not verify the account linked to this order" }, 409);
      }
      const { error: passwordError } = await supabase.auth.admin.updateUserById(existingAccountId, { password });
      if (passwordError) {
        console.error("Could not reset customer account password", passwordError);
        return respond({ error: "Could not update the account password" }, 500);
      }
      accountUserId = existingAccountId;
    } else {
      const email = `customer${phone}@customers.shanvi.invalid`;
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { customer_account: true, customer_phone: phone },
        user_metadata: { customer_phone: phone },
      });
      if (createError || !created.user) {
        console.error("Could not create customer account", createError);
        return respond({ error: "Could not create the account. It may already exist; use account recovery on this browser." }, 409);
      }
      accountUserId = created.user.id;
      createdNewAccount = true;
    }

    const verifiedReferences = verifiedOrders.map((order) => order.reference);
    const { data: linkedOrders, error: linkError } = await supabase.from("orders")
      .update({ customer_user_id: accountUserId })
      .eq("customer_phone", phone)
      .in("reference", verifiedReferences)
      .is("customer_user_id", null)
      .select("reference");
    const alreadyLinked = verifiedOrders.some((order) => order.customer_user_id === accountUserId);
    if (linkError || (!linkedOrders?.length && !alreadyLinked)) {
      if (createdNewAccount) {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(accountUserId);
        if (deleteError) console.error("Could not clean up an unlinked customer account", deleteError);
      }
      console.error("Could not link verified orders to customer account", linkError);
      return respond({ error: "Could not link your orders. Please try again." }, 500);
    }
    return respond({ registered: true, linked: linkedOrders?.length || 0 });
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return respond({ error: "Sign in to your customer account" }, 401);
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  const user = authData.user;
  const customerPhone = user?.app_metadata?.customer_phone;
  if (authError || !user || user.app_metadata?.customer_account !== true || typeof customerPhone !== "string") {
    return respond({ error: "Customer account session is invalid" }, 401);
  }

  if (body.action === "link") {
    if (!validReference(body.reference) || typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token)) {
      return respond({ error: "Invalid order recovery details" }, 400);
    }
    const { data: order, error: orderError } = await supabase.from("orders")
      .select("reference, customer_user_id")
      .eq("reference", body.reference)
      .eq("customer_phone", customerPhone)
      .eq("customer_status_token_hash", await sha256Hex(body.token))
      .maybeSingle();
    if (orderError) {
      console.error("Could not verify customer order link", orderError);
      return respond({ error: "Could not verify this order" }, 500);
    }
    if (!order) return respond({ error: "Order verification failed for this account" }, 403);
    if (order.customer_user_id && order.customer_user_id !== user.id) {
      return respond({ error: "This order is already linked to another account" }, 409);
    }
    if (!order.customer_user_id) {
      const { data: linkedOrder, error: linkError } = await supabase.from("orders")
        .update({ customer_user_id: user.id })
        .eq("reference", order.reference)
        .eq("customer_phone", customerPhone)
        .is("customer_user_id", null)
        .select("reference")
        .maybeSingle();
      if (linkError || !linkedOrder) {
        console.error("Could not link customer order", linkError);
        return respond({ error: "Could not link this order to your account" }, 500);
      }
    }
    return respond({ linked: true });
  }

  const { data: orders, error: ordersError } = await supabase.from("orders")
    .select("reference, customer_name, customer_phone, delivery_note, items, total, delivery_fee, discount, payment_method, payment_confirmed, rejection_reason, status, created_at")
    .eq("customer_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (ordersError) {
    console.error("Could not load linked customer orders", ordersError);
    return respond({ error: "Could not load your saved orders" }, 500);
  }
  return respond({ orders: orders || [] });
});
