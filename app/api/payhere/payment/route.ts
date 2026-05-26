// app/api/payhere/payment/route.ts
import { NextResponse } from "next/server";
import { payHereMerchantId, payHereCheckoutHash } from "../../../_lib/payhere-config";
import { createPaymentLink, CreatePaymentLinkInput } from "../../../_lib/payhere-api";
import { prisma } from "@/app/_lib/prisma";
import { z } from "zod";

const PaymentRequestSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive().optional(),
  currency: z.literal("LKR").default("LKR"),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().int().positive(),
        amount: z.number().nonnegative(),
      }),
    )
    .optional(),
  customer: z
    .object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string(),
      address: z.string().optional().default(""),
      city: z.string().optional().default(""),
      country: z.string().optional().default("Sri Lanka"),
    })
    .optional(),
  returnUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  notifyUrl: z.string().url().optional(),
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

function appBaseUrl(req: Request): string {
  return process.env.APP_URL || new URL(req.url).origin;
}

function urlWithOrderId(url: string, orderId: string): string {
  const nextUrl = new URL(url);
  nextUrl.searchParams.set("order_id", orderId);
  return nextUrl.toString();
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

  const { orderId, currency } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        select: { name: true, quantity: true, price: true },
      },
      user: {
        select: { name: true, email: true },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.paymentMethod !== "PAYHERE") {
    return NextResponse.json({ error: "Order was not created for PayHere" }, { status: 409 });
  }

  if (order.paymentStatus === "PAID") {
    return NextResponse.json({ error: "Order is already paid" }, { status: 409 });
  }

  const merchantId = payHereMerchantId();
  const amount = Number(order.total.toFixed(2));
  const baseUrl = appBaseUrl(req);
  const returnUrl = `${baseUrl}/checkout/success`;
  const cancelUrl = `${baseUrl}/checkout/success?status=cancelled`;
  const notifyUrl = `${baseUrl}/api/payhere/webhook`;

  console.log("[payhere/payment] Payment link creation initiated", {
    merchant_id: merchantId,
    order_id: orderId,
    amount,
    currency,
    customer_name: order.guestName ?? order.user?.name ?? parsed.data.customer?.name,
    customer_email: order.guestEmail ?? order.user?.email ?? parsed.data.customer?.email,
    customer_phone: order.customerPhone,
    items_count: order.items.length,
  });

  const customerName = order.guestName ?? order.user?.name ?? parsed.data.customer?.name;
  const customerEmail = order.guestEmail ?? order.user?.email ?? parsed.data.customer?.email;
  if (!customerName || !customerEmail) {
    return NextResponse.json(
      { error: "Order is missing customer name or email" },
      { status: 409 },
    );
  }

  const { first_name, last_name } = splitName(customerName);
  const itemsDescription =
    order.items.length > 0
      ? order.items.map((it) => `${it.name} x${it.quantity}`).join(", ")
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
    email: customerEmail,
    phone: order.customerPhone,
    address: `${order.shippingLine1}${order.shippingLine2 ? ", " + order.shippingLine2 : ""}`,
    city: order.shippingCity,
    country: order.shippingCountry,
    returnUrl: urlWithOrderId(returnUrl, orderId),
    cancelUrl: urlWithOrderId(cancelUrl, orderId),
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
