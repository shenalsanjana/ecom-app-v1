import { NextResponse } from "next/server";
import { fetchKokoOrderStatus } from "@/app/_lib/payments/koko";
import { finalizeFailedPayment, finalizePaidPayment } from "@/app/_lib/payments/order-finalization";

export const runtime = "nodejs";

function successUrl(req: Request, orderId: string, status?: string): URL {
  const url = new URL("/checkout/success", req.url);
  url.searchParams.set("order_id", orderId);
  if (status) url.searchParams.set("status", status);
  return url;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("order_id") ?? url.searchParams.get("_orderId") ?? "";
  if (!orderId) return NextResponse.json({ error: "Missing order id" }, { status: 400 });

  const status = await fetchKokoOrderStatus(orderId);
  if (status === "SUCCESS") {
    await finalizePaidPayment(orderId, "KOKO");
    return NextResponse.redirect(successUrl(req, orderId), 302);
  }
  if (status === "FAILED") {
    await finalizeFailedPayment(orderId, "KOKO", "failed");
    return NextResponse.redirect(successUrl(req, orderId, "cancelled"), 302);
  }
  return NextResponse.redirect(successUrl(req, orderId), 302);
}
