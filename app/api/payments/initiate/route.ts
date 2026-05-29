import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { isPaymentConfigError } from "@/app/_lib/payments/config";
import { getPaymentProvider, isOnlinePaymentMethod } from "@/app/_lib/payments/registry";

const InitiateSchema = z.object({ orderId: z.string().min(1) });

function appBaseUrl(req: Request): string {
  return process.env.APP_URL || new URL(req.url).origin;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = InitiateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    include: {
      items: { select: { productId: true, name: true, quantity: true, price: true, size: true } },
      user: { select: { name: true, email: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const method = order.paymentMethod;
  if (!isOnlinePaymentMethod(method)) {
    return NextResponse.json({ error: "Order was not created for an online payment method" }, { status: 409 });
  }

  if (order.paymentStatus === "PAID") {
    return NextResponse.json({ error: "Order is already paid" }, { status: 409 });
  }

  try {
    const provider = getPaymentProvider(method);
    return NextResponse.json(await provider.initiate(order, appBaseUrl(req)));
  } catch (error) {
    console.error("[payments/initiate] failure", { order_id: order.id, provider: method, error });
    if (isPaymentConfigError(error)) {
      return NextResponse.json({ error: "Payment gateway is not configured" }, { status: 500 });
    }
    return NextResponse.json({ error: "Failed to initialize payment" }, { status: 500 });
  }
}
