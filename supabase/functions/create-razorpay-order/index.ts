import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

type CartLine = { productId: string; quantity: number; isFreeGift: boolean };
type ProductRow = {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number | null;
  stock_tracked: boolean;
  size: string | null;
  dimensions: string | null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!keyId || !keySecret || !projectUrl || !serviceRoleKey) {
    return json({ error: "Secure UPI payment is not configured. Choose cash on delivery or contact the store." }, 503);
  }

  const requestText = await request.text();
  if (new TextEncoder().encode(requestText).length > 16_384) return json({ error: "Request is too large" }, 413);
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
  const { reference, name, phone, address, statusTokenHash, couponApplied, expectedTotal, payerReference } = body;
  if (
    typeof reference !== "string" || !/^SNVGS-[0-9]{4}-[A-F0-9]{12}$/.test(reference)
    || typeof name !== "string" || name.trim().length < 1 || name.trim().length > 100
    || typeof phone !== "string" || !/^[0-9]{10}$/.test(phone)
    || typeof address !== "string" || address.trim().length < 1 || address.trim().length > 500
    || typeof statusTokenHash !== "string" || !/^[a-f0-9]{64}$/.test(statusTokenHash)
    || typeof couponApplied !== "boolean"
    || typeof expectedTotal !== "number" || !Number.isInteger(expectedTotal) || expectedTotal < 1
    || typeof payerReference !== "string" || payerReference.length > 100
    || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30
  ) return json({ error: "Order details are invalid. Review the cart and try again." }, 400);

  const lines = body.items as CartLine[];
  if (lines.some((line) =>
    !line || typeof line.productId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(line.productId)
    || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50
    || typeof line.isFreeGift !== "boolean"
  )) return json({ error: "Cart items are invalid. Refresh the catalog and try again." }, 400);
  if (payerReference && !(/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(payerReference) || /^[0-9]{10}$/.test(payerReference))) {
    return json({ error: "Enter a valid UPI ID or 10-digit mobile number, or leave it blank." }, 400);
  }

  const supabase = createClient(projectUrl, serviceRoleKey);
  const { data: previousAttempt, error: previousError } = await supabase
    .from("razorpay_payment_attempts")
    .select("razorpay_order_id, amount, status, expires_at")
    .eq("reference", reference)
    .maybeSingle();
  if (previousError) {
    console.error("Could not load payment attempt", previousError);
    return json({ error: "Secure payment storage is not ready. Contact the store." }, 503);
  }
  if (previousAttempt?.status === "verified") {
    return json({ error: "Payment for this order has already been completed. Contact the store if you need help." }, 409);
  }
  if (previousAttempt?.status === "created") {
    if (new Date(previousAttempt.expires_at).getTime() > Date.now()) {
      return json({ orderId: previousAttempt.razorpay_order_id, amount: previousAttempt.amount, keyId });
    }
    return json({ error: "This secure payment session expired. Return to the cart and start checkout again." }, 409);
  }
  if (previousAttempt?.status === "expired") {
    return json({ error: "This secure payment session expired. Return to the cart and start checkout again." }, 409);
  }

  const productIds = [...new Set(lines.map((line) => line.productId))];
  const [{ data: productRows, error: productsError }, { data: storefrontRow, error: storefrontError }] = await Promise.all([
    supabase.from("products")
      .select("id,name,category,price,stock,stock_tracked,size,dimensions,active")
      .in("id", productIds)
      .eq("active", true),
    supabase.from("store_settings").select("value").eq("key", "storefront").maybeSingle(),
  ]);
  if (productsError || storefrontError) {
    console.error("Could not validate payment cart", productsError || storefrontError);
    return json({ error: "Could not verify current products. Refresh and try again." }, 503);
  }
  if (!productRows || productRows.length !== productIds.length) {
    return json({ error: "A product in your cart is no longer available. Refresh the cart." }, 409);
  }
  const products = new Map<string, ProductRow>(
    (productRows as ProductRow[]).map((product) => [product.id, product]),
  );
  const settings = storefrontRow?.value && typeof storefrontRow.value === "object" ? storefrontRow.value : {};
  const coupon = settings.coupon && typeof settings.coupon === "object" ? settings.coupon : {};
  const offer = settings.offer && typeof settings.offer === "object" ? settings.offer : {};
  const delivery = settings.delivery && typeof settings.delivery === "object" ? settings.delivery : {};

  const giftLines = lines.filter((line) => line.isFreeGift);
  if (giftLines.length > 1 || giftLines.some((line) => line.quantity !== 1)) {
    return json({ error: "The free-item offer in this cart is invalid. Refresh and try again." }, 400);
  }
  let subtotal = 0;
  const stockCounts = new Map<string, number>();
  const orderItems = [];
  for (const line of lines) {
    const product = products.get(line.productId);
    if (!product || !Number.isInteger(Number(product.price)) || Number(product.price) < 1) {
      return json({ error: "A product price could not be verified. Refresh and try again." }, 409);
    }
    stockCounts.set(line.productId, (stockCounts.get(line.productId) || 0) + line.quantity);
    if (line.isFreeGift) {
      if (line.productId !== offer.giftProductId) {
        return json({ error: "The free-item offer in this cart is invalid. Refresh and try again." }, 400);
      }
    } else {
      subtotal += Number(product.price) * line.quantity;
    }
    orderItems.push({
      id: product.id,
      name: product.name,
      category: product.category,
      size: product.size || "",
      dimensions: product.dimensions || "",
      price: line.isFreeGift ? 0 : Number(product.price),
      quantity: line.quantity,
      is_free_gift: line.isFreeGift,
    });
  }
  for (const [productId, quantity] of stockCounts) {
    const product = products.get(productId);
    if (!product) return json({ error: "A product changed while checking stock. Refresh and try again." }, 409);
    if (product.stock_tracked !== false && quantity > Number(product.stock ?? 0)) {
      return json({ error: `${product.name} no longer has enough stock. Update your cart.` }, 409);
    }
  }

  let discount = 0;
  if (couponApplied) {
    const percent = Number(coupon.percent);
    const maxDiscount = Number(coupon.maxDiscount);
    if (coupon.enabled !== true || !Number.isFinite(percent) || percent < 1 || percent > 100
      || !Number.isFinite(maxDiscount) || maxDiscount < 1) {
      return json({ error: "This coupon is no longer available. Refresh the cart." }, 409);
    }
    discount = Math.min(Math.round(subtotal * percent / 100), maxDiscount);
  }
  const minimumOrderValue = Number.isInteger(Number(delivery.minimumOrderValue))
    && Number(delivery.minimumOrderValue) >= 1
    ? Number(delivery.minimumOrderValue)
    : 100;
  const deliveryFee = delivery.enabled === false || subtotal - discount >= minimumOrderValue ? 0 : 20;
  const total = subtotal - discount + deliveryFee;
  if (total !== expectedTotal) {
    return json({ error: "The cart total changed. Return to your cart and review the current prices." }, 409);
  }

  if (giftLines.length) {
    const threshold = Number(offer.threshold);
    if (offer.enabled !== true || !Number.isFinite(threshold) || subtotal - discount < threshold) {
      return json({ error: "The free-item offer is no longer valid. Refresh the cart." }, 409);
    }
  }
  const expectedGiftId = typeof offer.giftProductId === "string" ? offer.giftProductId : "";
  const giftProduct = typeof expectedGiftId === "string" ? products.get(expectedGiftId) : null;
  const giftCountInCart = stockCounts.get(expectedGiftId) || 0;
  const availableGiftStock = giftProduct && giftProduct.stock_tracked !== false
    ? Number(giftProduct.stock ?? 0) - giftCountInCart + (giftLines.length ? 1 : 0)
    : 1;
  if (offer.enabled === true && giftProduct && subtotal - discount >= Number(offer.threshold)
    && availableGiftStock > 0 && giftLines.length !== 1) {
    return json({ error: "The free item changed. Refresh your cart to update the offer." }, 409);
  }

  const amount = total * 100;
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 100_000_000) {
    return json({ error: "The order total is outside the secure payment limit." }, 400);
  }
  const orderPayload = {
    reference,
    customer_name: name.trim(),
    customer_phone: phone,
    delivery_note: address.trim(),
    items: orderItems,
    total,
    delivery_fee: deliveryFee,
    discount,
    payment_method: "upi_id",
    payer_upi_id: payerReference || null,
    payment_confirmed: true,
    status: "Awaiting manager approval",
    customer_status_token_hash: statusTokenHash,
  };

  const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
  let gatewayResponse: Response;
  try {
    gatewayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt: reference,
        notes: { reference },
      }),
    });
  } catch (error) {
    console.error("Razorpay order request failed", error);
    return json({ error: "Could not connect to secure payment. Please try again." }, 502);
  }
  const gatewayOrder = await gatewayResponse.json().catch(() => null);
  if (!gatewayResponse.ok || typeof gatewayOrder?.id !== "string" || gatewayOrder.amount !== amount) {
    console.error("Razorpay rejected order creation", gatewayResponse.status, gatewayOrder?.error?.code);
    return json({ error: gatewayOrder?.error?.description || "Secure payment could not be started." }, 502);
  }

  const { error: attemptError } = await supabase.from("razorpay_payment_attempts").insert({
    razorpay_order_id: gatewayOrder.id,
    reference,
    amount,
    order_payload: orderPayload,
    status: "created",
    payment_id: null,
    expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (attemptError) {
    if (attemptError.code === "23505") {
      const { data: racedAttempt, error: racedAttemptError } = await supabase
        .from("razorpay_payment_attempts")
        .select("razorpay_order_id, amount, status, expires_at")
        .eq("reference", reference)
        .maybeSingle();
      if (racedAttemptError) {
        console.error("Could not reload concurrent payment attempt", racedAttemptError);
        return json({ error: "Could not safely start payment. Contact the store." }, 503);
      }
      if (racedAttempt?.status === "created" && new Date(racedAttempt.expires_at).getTime() > Date.now()) {
        return json({ orderId: racedAttempt.razorpay_order_id, amount: racedAttempt.amount, keyId });
      }
      return json({ error: "This order already has a payment attempt. Return to the cart and try again." }, 409);
    }
    console.error("Could not save Razorpay attempt", attemptError);
    return json({ error: "Could not safely save the payment attempt. Do not proceed; contact the store." }, 503);
  }
  return json({ orderId: gatewayOrder.id, amount, keyId });
});
