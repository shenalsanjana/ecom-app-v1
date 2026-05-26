// app/api/payhere/payment/route.ts
import { NextResponse } from "next/server";
import { payHereMerchantId, payHereCheckoutHash } from "../../../_lib/payhere-config";
import { createPaymentLink, CreatePaymentLinkInput } from "../../../_lib/payhere-api";
import { z } from "zod";

const PaymentRequestSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.literal("LKR").default("LKR"),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().int().positive(),
        amount: z.number().nonnegative(),
      }),
    )
    .default([]),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string(),
    address: z.string().optional().default(""),
    city: z.string().optional().default(""),
    country: z.string().optional().default("Sri Lanka"),
  }),
  returnUrl: z.string().url().default(`${process.env.APP_URL}/checkout/success`),
  cancelUrl: z
    .string()
    .url()
    .default(`${process.env.APP_URL}/checkout/success?status=cancelled`),
  notifyUrl: z.string().url().default(`${process.env.APP_URL}/api/payhere/webhook`),
});

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

  const { orderId, amount, currency, items, customer, returnUrl, cancelUrl, notifyUrl } =
    parsed.data;

  const merchantId = payHereMerchantId();

  console.log("[payhere/payment] Payment link creation initiated", {
    merchant_id: merchantId,
    order_id: orderId,
    amount,
    currency,
    customer_name: customer.name,
    customer_email: customer.email,
    customer_phone: customer.phone,
    items_count: items.length,
  });

  const { first_name, last_name } = splitName(customer.name);
  const itemsDescription =
    items.length > 0
      ? items.map((it) => `${it.name} x${it.quantity}`).join(", ")
      : "Dressing Bear Order";

  // Generate the checkout hash per PayHere docs
  const hash = payHereCheckoutHash(merchantId, orderId, amount, currency);

  console.log("[payhere/payment] Checkout hash generated", {
    order_id: orderId,
    hash_prefix: hash.substring(0, 8) + "...",
  });

  const input: CreatePaymentLinkInput = {
    orderId,
    amount,
    currency,
    items: itemsDescription,
    firstName: first_name,
    lastName: last_name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    city: customer.city,
    country: customer.country,
    returnUrl: `${returnUrl}?order_id=${encodeURIComponent(orderId)}`,
    cancelUrl: `${cancelUrl}&order_id=${encodeURIComponent(orderId)}`,
    notifyUrl,
    hash,
  };

  const result = await createPaymentLink(input);

  if (!result.success || !result.paymentUrl) {
    console.error("[payhere/payment] Payment link creation failed", {
      order_id: orderId,
      error: result.error,
    });
    return NextResponse.json(
      { error: result.error ?? "Failed to create payment link" },
      { status: 502 },
    );
  }

  console.log("[payhere/payment] Payment link created successfully", {
    order_id: orderId,
    payment_id: result.paymentId,
    payment_url: result.paymentUrl,
  });

  return NextResponse.json({
    paymentUrl: result.paymentUrl,
    paymentId: result.paymentId,
  });
}
