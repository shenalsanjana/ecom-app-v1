// app/api/payhere/payment/route.ts
import { NextResponse } from "next/server";
import { payHereCredentials, payHereMerchantId, payHerePaymentLinkUrl } from "../../../_lib/payhere-config";
import { z } from "zod";
import { createHash } from "crypto";

const PaymentRequestSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.literal("LKR").default("LKR"),
  items: z
    .array(z.object({ name: z.string(), quantity: z.number().int().positive(), amount: z.number().nonnegative() }))
    .default([]),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string(),
  }),
  returnUrl: z.string().url().default(`${process.env.APP_URL}/checkout/success`),
  cancelUrl: z.string().url().default(`${process.env.APP_URL}/checkout/success?status=cancelled`),
  notifyUrl: z.string().url().default(`${process.env.APP_URL}/api/payhere/webhook`),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PaymentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { orderId, amount, currency, items, customer, returnUrl, cancelUrl, notifyUrl } = parsed.data;

  const merchantId = payHereMerchantId();
  const { app_secret } = payHereCredentials();
  const baseUrl = payHerePaymentLinkUrl();

  // Build PayHere Payment Link URL with query params
  // PayHere Payment Link format:
  // https://www.payhere.lk/pay/{merchant_id}?xxxxx
  const returnUrlWithOrder = `${returnUrl}?order_id=${encodeURIComponent(orderId)}`;
  const cancelUrlWithOrder = `${cancelUrl}&order_id=${encodeURIComponent(orderId)}`;
  const params = new URLSearchParams({
    _fp_id: merchantId,
    _amount: String(amount),
    _currency: currency,
    _order_id: orderId,
    _items_description: items.length > 0
      ? items.map((it) => `${it.name} x${it.quantity}`).join(", ")
      : "Dressing Bear Order",
    _payer_name: customer.name,
    _payer_email: customer.email,
    _payer_phone: customer.phone,
    _return_url: returnUrlWithOrder,
    _cancel_url: cancelUrlWithOrder,
    _notify_url: notifyUrl,
  });

  // Generate HMAC-MD5 signature for payment link
  // Signature format: md5(merchant_id + order_id + amount + currency + app_secret)
  const sigString = `${merchantId}${orderId}${amount}${currency}${app_secret}`;
  const signature = createHash("md5").update(sigString).digest("hex").toUpperCase();
  params.set("_signature", signature);

  const paymentUrl = `${baseUrl}/${merchantId}?${params.toString()}`;

  return NextResponse.json({ paymentUrl });
}