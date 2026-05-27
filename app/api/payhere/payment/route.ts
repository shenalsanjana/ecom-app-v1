// app/api/payhere/payment/route.ts
import { NextResponse } from "next/server";
import { payHereMerchantId, payHereCheckoutHash, payHereCheckoutUrl } from "../../../_lib/payhere-config";
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

function isPayHereConfigError(error: unknown): boolean {
  return error instanceof Error && /^PAYHERE_/.test(error.message);
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

  try {
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
    // PayHere appends `order_id` to return_url and cancel_url itself when it
    // redirects the buyer back. If we also set it here, the customer lands on
    // `/checkout/success?order_id=X&order_id=X`, which Next.js parses as a
    // string[] and breaks the success page. Leave the order_id off — PayHere
    // adds it.
    const returnUrl = `${baseUrl}/checkout/success`;
    const cancelUrl = `${baseUrl}/checkout/success?status=cancelled`;
    const notifyUrl = `${baseUrl}/api/payhere/webhook`;

    console.log("[payhere/payment] Checkout field creation initiated", {
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

    const fields = {
      merchant_id: merchantId,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,
      first_name,
      last_name,
      email: customerEmail,
      phone: order.customerPhone,
      address: `${order.shippingLine1}${order.shippingLine2 ? ", " + order.shippingLine2 : ""}`,
      city: order.shippingCity,
      country: order.shippingCountry,
      order_id: orderId,
      items: itemsDescription,
      currency,
      amount: amount.toFixed(2),
      hash,
    };

    console.log("[payhere/payment] Checkout fields created successfully", {
      order_id: orderId,
      gateway_url: payHereCheckoutUrl(),
    });

    return NextResponse.json({
      gatewayUrl: payHereCheckoutUrl(),
      fields,
    });
  } catch (error) {
    console.error("[payhere/payment] Unexpected payment initialization failure", {
      order_id: orderId,
      error,
    });

    if (isPayHereConfigError(error)) {
      return NextResponse.json(
        { error: "Payment gateway is not configured" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "Failed to initialize payment" },
      { status: 500 },
    );
  }
}
