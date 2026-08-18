import { NextResponse } from "next/server";
import { fetchKokoOrderStatus } from "@/app/_lib/payments/koko";
import { finalizeFailedPayment, finalizePaidPayment } from "@/app/_lib/payments/order-finalization";

export const runtime = "nodejs";

async function orderIdFromRequest(req: Request): Promise<string> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await req.json()) as Record<string, string>;
    // Log the KEY NAMES only (never values): if Koko names the order id something
    // outside the three we accept, this route 400s and the order is stranded at
    // "awaiting payment" with no other trace. Key names alone identify that.
    console.info("[koko] response callback received", {
      contentType: "json",
      keys: Object.keys(body ?? {}),
    });
    return body.order_id ?? body._orderId ?? body.orderId ?? "";
  }
  const body = new URLSearchParams(await req.text());
  console.info("[koko] response callback received", {
    contentType: contentType || "(none)",
    keys: [...body.keys()],
  });
  return body.get("order_id") ?? body.get("_orderId") ?? body.get("orderId") ?? "";
}

export async function POST(req: Request) {
  const orderId = await orderIdFromRequest(req);
  if (!orderId) {
    console.warn("[koko] response callback missing order id — cannot finalize");
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  try {
    const status = await fetchKokoOrderStatus(orderId);
    if (status === "SUCCESS") {
      const result = await finalizePaidPayment(orderId, "KOKO");
      console.info("[koko] response callback finalized as paid", { orderId, result: result.status });
      return NextResponse.json(result);
    }
    if (status === "FAILED") {
      const result = await finalizeFailedPayment(orderId, "KOKO", "failed");
      console.info("[koko] response callback finalized as failed", { orderId, result: result.status });
      return NextResponse.json(result);
    }
    console.warn("[koko] response callback left order PENDING", { orderId });
    return NextResponse.json({ status: "pending" });
  } catch (err) {
    console.error("[koko] response route error", { orderId, err });
    return NextResponse.json({ status: "pending" });
  }
}
