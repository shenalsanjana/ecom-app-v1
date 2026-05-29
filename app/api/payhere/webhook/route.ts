// app/api/payhere/webhook/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";
import { createHash } from "crypto";
import { payHereMerchantId, payHereMerchantSecret } from "@/app/_lib/payhere-config";
import { finalizePaidPayment } from "@/app/_lib/payments/order-finalization";

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

  // Verify amount and currency match before confirming the order. The signed
  // md5sig above proves these callback fields came from PayHere.
  const storedAmount = Number(order.total.toFixed(2));
  const callbackAmount = Number(payhere_amount);
  if (!Number.isFinite(callbackAmount) || !amountsMatch(callbackAmount, storedAmount)) {
    console.error("[payhere/webhook] Amount mismatch between order and PayHere notification", {
      order_id,
      expected: storedAmount,
      webhook_amount: payhere_amount,
    });
    return NextResponse.json({
      status: "amount_mismatch",
      expected: storedAmount,
      received: payhere_amount,
    });
  }

  if (currency !== "LKR") {
    console.error("[payhere/webhook] Currency mismatch between order and PayHere notification", {
      order_id,
      expected: "LKR",
      webhook_currency: currency,
    });
    return NextResponse.json({
      status: "currency_mismatch",
      expected: "LKR",
      received: currency,
    });
  }

  const result = await finalizePaidPayment(order_id, "PAYHERE");
  return NextResponse.json(result.status === "success" ? { status: "success" } : result);
}
