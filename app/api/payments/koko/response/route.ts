import { NextResponse } from "next/server";
import { fetchKokoOrderStatus } from "@/app/_lib/payments/koko";
import { finalizeFailedPayment, finalizePaidPayment } from "@/app/_lib/payments/order-finalization";

export const runtime = "nodejs";

async function orderIdFromRequest(req: Request): Promise<string> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await req.json()) as Record<string, string>;
    return body.order_id ?? body._orderId ?? body.orderId ?? "";
  }
  const body = new URLSearchParams(await req.text());
  return body.get("order_id") ?? body.get("_orderId") ?? body.get("orderId") ?? "";
}

export async function POST(req: Request) {
  const orderId = await orderIdFromRequest(req);
  if (!orderId) return NextResponse.json({ error: "Missing order id" }, { status: 400 });

  try {
    const status = await fetchKokoOrderStatus(orderId);
    if (status === "SUCCESS") {
      return NextResponse.json(await finalizePaidPayment(orderId, "KOKO"));
    }
    if (status === "FAILED") {
      return NextResponse.json(await finalizeFailedPayment(orderId, "KOKO", "failed"));
    }
    return NextResponse.json({ status: "pending" });
  } catch (err) {
    console.error("[koko] response route error", { orderId, err });
    return NextResponse.json({ status: "pending" });
  }
}
