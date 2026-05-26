// app/api/payhere/webhook/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";
import { createHash } from "crypto";
import {
  sendOrderConfirmationEmail,
  logMailerError,
} from "@/app/_lib/mailer";
import { sendAdminFailureAlertEmail } from "@/app/_lib/mailer";
import { verifyPayment } from "@/app/_lib/payhere-api";
import { payHereMerchantId, payHereMerchantSecret } from "@/app/_lib/payhere-config";

/**
 * Verifies the MD5 signature PayHere sends with each webhook.
 * PayHere computes: md5(merchant_id + order_id + amount + currency + status_code + upper(md5(merchant_secret)))
 * We recompute using our MERCHANT_SECRET and compare.
 */
export function verifyPayHereSignature(params: {
  merchantId: string;
  orderId: string;
  amount: string;
  currency: string;
  status: string;
  md5sig: string;
  secret: string;
}): boolean {
  const { merchantId, orderId, amount, currency, status, md5sig, secret } = params;
  const hashedSecret = createHash("md5").update(secret).digest("hex").toUpperCase();
  const str = `${merchantId}${orderId}${amount}${currency}${status}${hashedSecret}`;
  const expected = createHash("md5").update(str).digest("hex").toUpperCase();
  return expected === md5sig.toUpperCase();
}

function amountsMatch(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100);
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
  const payhere_amount = params.get("payhere_amount") ?? params.get("amount") ?? "";
  const currency = params.get("payhere_currency") ?? params.get("currency") ?? "LKR";
  const status = params.get("status") ?? "";
  const md5sig = params.get("md5sig") ?? "";
  const status_code = params.get("status_code") ?? "";
  const paymentStatusCode = status_code || status;
  const method = params.get("method") ?? "";
  const status_message = params.get("status_message") ?? "";

  console.log("[payhere/webhook] Received webhook callback", {
    payment_id,
    merchant_id,
    order_id,
    amount: payhere_amount,
    currency,
    status,
    status_code,
    method,
    status_message,
  });

  const expectedMerchantId = payHereMerchantId();
  if (merchant_id !== expectedMerchantId) {
    console.warn("[payhere/webhook] Merchant ID mismatch", {
      order_id,
      merchant_id,
      expectedMerchantId,
    });
    return NextResponse.json({ error: "Merchant verification failed" }, { status: 403 });
  }

  // Verify signature using merchant_secret
  const merchantSecret = payHereMerchantSecret();
  const isValid = verifyPayHereSignature({
    merchantId: merchant_id,
    orderId: order_id,
    amount: payhere_amount,
    currency,
    status: paymentStatusCode,
    md5sig,
    secret: merchantSecret,
  });

  if (!isValid) {
    console.warn("[payhere/webhook] Signature verification failed — possible spoof", {
      order_id,
      md5sig,
      merchant_id,
    });
    return NextResponse.json({ error: "Signature verification failed" }, { status: 403 });
  }

  console.log("[payhere/webhook] Signature verified successfully", { order_id });

  // Only process completed payments (status_code "2" = success)
  if (paymentStatusCode !== "2") {
    console.log("[payhere/webhook] Non-success status code — ignoring", {
      order_id,
      status_code: paymentStatusCode,
      status_message,
    });
    return NextResponse.json({ status: "ignored", reason: `status_code=${paymentStatusCode}` });
  }

  // Load the order
  const order = await prisma.order.findUnique({
    where: { id: order_id },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!order) {
    console.warn("[payhere/webhook] Order not found", { order_id });
    return NextResponse.json({ status: "order_not_found" });
  }

  if (order.paymentMethod !== "PAYHERE") {
    console.warn("[payhere/webhook] Order payment method is not PayHere", {
      order_id,
      paymentMethod: order.paymentMethod,
    });
    return NextResponse.json({ status: "ignored", reason: "payment_method_mismatch" });
  }

  // Idempotency: if already PAID, skip
  if (order.paymentStatus === "PAID") {
    console.log("[payhere/webhook] Order already marked as PAID — skipping", { order_id });
    return NextResponse.json({ status: "already_processed" });
  }

  // ── Cross-verify payment with PayHere Merchant API ──────────────────────
  console.log("[payhere/webhook] Cross-verifying payment with PayHere Merchant API", {
    order_id,
  });

  const verification = await verifyPayment(order_id);

  if (!verification.verified) {
    console.error("[payhere/webhook] Payment verification via API failed", {
      order_id,
      error: verification.error,
      api_status: verification.status,
      api_status_text: verification.statusText,
    });
    // Do NOT confirm the order — the webhook signature was valid but the
    // merchant API could not confirm the payment. This could be a race condition
    // or a spoofed callback. Return 200 so PayHere doesn't retry, but don't
    // update the order.
    return NextResponse.json({
      status: "verification_failed",
      error: verification.error,
    });
  }

  console.log("[payhere/webhook] Payment verified via Merchant API", {
    order_id,
    payment_id: verification.paymentId,
    amount: verification.amount,
    method: verification.method,
    api_status: verification.status,
  });

  // Verify amount and currency match before confirming the order.
  const storedAmount = Number(order.total.toFixed(2));
  const callbackAmount = Number(payhere_amount);
  const verifiedAmount = verification.amount ?? (Number.isFinite(callbackAmount) ? Number(callbackAmount.toFixed(2)) : NaN);
  if (!Number.isFinite(verifiedAmount) || !amountsMatch(verifiedAmount, storedAmount)) {
    console.error("[payhere/webhook] Amount mismatch between order and verified payment", {
      order_id,
      expected: storedAmount,
      verified: verifiedAmount,
      webhook_amount: payhere_amount,
    });
    return NextResponse.json({
      status: "amount_mismatch",
      expected: storedAmount,
      verified: verifiedAmount,
    });
  }

  const verifiedCurrency = verification.currency ?? currency;
  if (verifiedCurrency !== "LKR" || currency !== "LKR") {
    console.error("[payhere/webhook] Currency mismatch between order and verified payment", {
      order_id,
      expected: "LKR",
      verified: verifiedCurrency,
      webhook_currency: currency,
    });
    return NextResponse.json({
      status: "currency_mismatch",
      expected: "LKR",
      verified: verifiedCurrency,
    });
  }

  // Update payment status to PAID
  await prisma.order.update({
    where: { id: order_id },
    data: { paymentStatus: "PAID" },
  });

  console.log("[payhere/webhook] Order payment status updated to PAID", { order_id });

  // Re-fetch updated order for downstream steps
  const updated = await prisma.order.findUnique({
    where: { id: order_id },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!updated) {
    return NextResponse.json({ status: "success" });
  }

  // Build order details for mailer and courier booking
  const orderItems = await prisma.orderItem.findMany({ where: { orderId: order_id } });
  const details = {
    orderId: order_id,
    customerName: updated.guestName ?? updated.user?.name ?? "Customer",
    customerEmail: updated.guestEmail ?? updated.user?.email ?? "",
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
      console.log("[payhere/webhook] Courier booking triggered successfully", { order_id });
    } catch (err) {
      console.error("[payhere/webhook] Courier booking failed:", err);
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
      console.log("[payhere/webhook] Order confirmation email sent", { order_id });
    } catch (err) {
      logMailerError("order-confirmation", { orderId: order_id, webNumber: updated.webNumber }, err);
    }
  }

  console.log("[payhere/webhook] Payment confirmation flow completed successfully", {
    order_id,
    payment_id: verification.paymentId,
  });

  return NextResponse.json({ status: "success" });
}
