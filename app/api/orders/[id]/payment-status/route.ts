// app/api/orders/[id]/payment-status/route.ts
// Lightweight status probe used by the checkout success page to wait for the
// PayHere webhook to flip paymentStatus from PENDING to PAID. Returns only the
// two fields the success page needs — no PII, no amounts.
import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: { paymentStatus: true, paymentMethod: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
  });
}
