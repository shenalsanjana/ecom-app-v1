import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcileUnpaidOrders } from "@/app/_lib/payments/reconcile-unpaid";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.RECONCILIATION_SECRET;
  if (!secret) return NextResponse.json({ error: "Reconciliation is not configured" }, { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await reconcileUnpaidOrders());
}
