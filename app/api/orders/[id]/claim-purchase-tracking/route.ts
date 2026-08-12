// app/api/orders/[id]/claim-purchase-tracking/route.ts
// Server-side one-shot claim for the Meta Pixel Purchase event. Client-only
// dedupe (localStorage) isn't durable across browser contexts — private
// windows, in-app browser webviews, or the confirmation link reopened on a
// different device all start with empty storage and would refire Purchase
// for the same order. This atomically flips purchaseTrackedAt exactly once
// per order, mirroring the confirmationSmsSentAt-style idempotency stamps in
// app/_lib/order-notifications.ts.
import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const result = await prisma.order.updateMany({
    where: { id, purchaseTrackedAt: null },
    data: { purchaseTrackedAt: new Date() },
  });

  return NextResponse.json({ claimed: result.count === 1 });
}
