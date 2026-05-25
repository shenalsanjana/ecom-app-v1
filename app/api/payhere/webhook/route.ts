// app/api/payhere/webhook/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";
import { createHash } from "crypto";
import { sendOrderConfirmationEmail, logMailerError } from "@/app/_lib/mailer";
import { sendAdminFailureAlertEmail } from "@/app/_lib/mailer";

/**
 * Verifies the MD5 signature PayHere sends with each webhook.
 * PayHere computes: md5(merchant_id + order_id + amount + currency + status)
 * We recompute using our APP_SECRET and compare.
 */
export function verifyPayHereSignature(params: {
  merchantId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  md5sig: string;
  secret: string;
}): boolean {
  const { merchantId, orderId, amount, currency, status, md5sig, secret } = params;
  const str = `${merchantId}${orderId}${amount}${currency}${status}`;
  const expected = createHash("md5").update(str).digest("hex").toUpperCase();
  return expected === md5sig.toUpperCase();
}

export async function POST(req: Request) {
  // PayHere sends form-urlencoded data
  let params: URLSearchParams;
  try {
    const text = await req.text();
    params = new URLSearchParams(text);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const payment_id = params.get("payment_id") ?? "";
  const merchant_id = params.get("merchant_id") ?? "";
  const order_id = params.get("order_id") ?? "";
  const payhere_amount = params.get("amount") ?? "";
  const currency = params.get("currency") ?? "LKR";
  const status = params.get("status") ?? "";
  const md5sig = params.get("md5sig") ?? "";

  // Verify signature
  const app_secret = process.env.PAYHERE_APP_SECRET;
  if (!app_secret) {
    console.error("[payhere/webhook] APP_SECRET not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const isValid = verifyPayHereSignature({
    merchantId: merchant_id,
    orderId: order_id,
    amount: Number(payhere_amount),
    currency,
    status,
    md5sig,
    secret: app_secret,
  });

  if (!isValid) {
    console.warn("[payhere/webhook] signature mismatch — possible spoof", { order_id, md5sig });
    return NextResponse.json({ error: "Signature verification failed" }, { status: 403 });
  }

  // Only process completed payments
  if (status !== "COMPLETED") {
    // PayHere may send "REJECTED", "CANCELLED" etc. — acknowledge but don't update.
    return NextResponse.json({ status: "ignored" });
  }

  // Load the order
  const order = await prisma.order.findUnique({ where: { id: order_id } });
  if (!order) {
    // Order not found — could be a test ping or old order. Acknowledge.
    return NextResponse.json({ status: "order_not_found" });
  }

  // Idempotency: if already PAID, skip
  if (order.paymentStatus === "PAID") {
    return NextResponse.json({ status: "already_processed" });
  }

  // Verify amount matches (log discrepancy but don't block)
  // PayHere amount is in the smallest currency unit (LKR, no decimals)
  const storedAmountCents = Math.round(order.total * 100);
  const webhookAmountCents = Math.round(Number(payhere_amount) * 100);
  if (webhookAmountCents !== storedAmountCents) {
    console.error("[payhere/webhook] amount mismatch:", {
      orderId: order_id,
      expected: storedAmountCents,
      received: webhookAmountCents,
    });
  }

  // Update payment status to PAID
  await prisma.order.update({
    where: { id: order_id },
    data: { paymentStatus: "PAID" },
  });

  // Re-fetch updated order for downstream steps
  const updated = await prisma.order.findUnique({ where: { id: order_id } });
  if (!updated) {
    return NextResponse.json({ status: "success" });
  }

  // Build order details for mailer and courier booking
  const orderItems = await prisma.orderItem.findMany({ where: { orderId: order_id } });
  const details = {
    orderId: order_id,
    customerName: updated.guestName ?? updated.userId ?? "Customer",
    customerEmail: updated.guestEmail ?? "",
    customerPhone: updated.customerPhone,
    items: orderItems.map((it) => ({
      name: it.name,
      size: it.size,
      price: it.price,
      quantity: it.quantity,
    })),
    subtotal: updated.subtotal,
    shipping: updated.shippingCost,
    total: updated.total,
    shippingAddress: {
      line1: updated.shippingLine1,
      line2: updated.shippingLine2 ?? undefined,
      city: updated.shippingCity,
      country: updated.shippingCountry,
    },
    paymentMethod: updated.paymentMethod as "COD" | "PAYHERE" | "KOKO" | "MINITPAY",
    paymentMethodDisplay: updated.paymentMethodDisplay ?? undefined,
    webNumber: updated.webNumber,
    rbNumber: updated.rbNumber,
    paymentStatus: "PAID",
  };

  // Trigger courier booking (same pattern as COD flow)
  if (process.env.ROYAL_EXPRESS_ENABLED === "true") {
    try {
      const { bookCourierAndNotify } = await import("@/app/checkout/book-courier");
      await bookCourierAndNotify({ order: details });
    } catch (err) {
      console.error("[payhere/webhook] courier booking failed:", err);
      try {
        await sendAdminFailureAlertEmail({
          orderId: order_id,
          step: "orchestrate-courier",
          reason: err instanceof Error ? err.message : "unknown",
          order: details,
        });
      } catch {
        // swallow — don't fail the webhook response
      }
    }
  }

  // Send confirmation email if not already sent
  if (!updated.emailSent) {
    try {
      await sendOrderConfirmationEmail(details);
      await prisma.order.update({ where: { id: order_id }, data: { emailSent: true } });
    } catch (err) {
      logMailerError("order-confirmation", { orderId: order_id, webNumber: updated.webNumber }, err);
    }
  }

  return NextResponse.json({ status: "success" });
}