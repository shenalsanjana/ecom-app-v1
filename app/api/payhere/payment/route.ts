// app/api/payhere/payment/route.ts
import { NextResponse } from "next/server";
import { payHereCredentials, payHereMerchantId, payHereCheckoutUrl } from "../../../_lib/payhere-config";
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

/**
 * Generates the PayHere Checkout hash.
 * Per PayHere docs: md5(merchant_id + order_id + amount + currency + upper(md5(app_secret)))
 */
function generatePayHereHash(
  merchantId: string,
  orderId: string,
  amount: string,
  currency: string,
  appSecret: string,
): string {
  const secretHash = createHash("md5").update(appSecret).digest("hex").toUpperCase();
  const str = `${merchantId}${orderId}${amount}${currency}${secretHash}`;
  return createHash("md5").update(str).digest("hex").toUpperCase();
}

/**
 * Splits a full name into first_name and last_name.
 * Single-word names are used as both first and last.
 */
function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: parts[0] };
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
  };
}

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
  const baseUrl = payHereCheckoutUrl();

  const amountStr = String(amount);
  const { first_name, last_name } = splitName(customer.name);
  const itemsDescription = items.length > 0
    ? items.map((it) => `${it.name} x${it.quantity}`).join(", ")
    : "Dressing Bear Order";

  const hash = generatePayHereHash(merchantId, orderId, amountStr, currency, app_secret);

  const params = new URLSearchParams({
    merchant_id: merchantId,
    order_id: orderId,
    amount: amountStr,
    currency,
    items: itemsDescription,
    first_name,
    last_name,
    email: customer.email,
    phone: customer.phone,
    address: "",        // collected on the checkout form but not mapped here
    country: "Sri Lanka",
    return_url: `${returnUrl}?order_id=${encodeURIComponent(orderId)}`,
    cancel_url: `${cancelUrl}&order_id=${encodeURIComponent(orderId)}`,
    notify_url: notifyUrl,
    hash,
  });

  const paymentUrl = `${baseUrl}?${params.toString()}`;

  return NextResponse.json({ paymentUrl });
}
