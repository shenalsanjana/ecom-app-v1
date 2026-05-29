import { NextResponse } from "next/server";
import { fetchKokoOrderStatus } from "@/app/_lib/payments/koko";
import { finalizeFailedPayment, finalizePaidPayment } from "@/app/_lib/payments/order-finalization";
import { checkoutSuccessUrl } from "@/app/_lib/payments/shared";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("order_id") ?? url.searchParams.get("_orderId") ?? "";
  if (!orderId) return NextResponse.json({ error: "Missing order id" }, { status: 400 });

  try {
    const status = await fetchKokoOrderStatus(orderId);
    if (status === "SUCCESS") {
      await finalizePaidPayment(orderId, "KOKO");
      return NextResponse.redirect(checkoutSuccessUrl(req, orderId), 302);
    }
    if (status === "FAILED") {
      await finalizeFailedPayment(orderId, "KOKO", "failed");
      return NextResponse.redirect(checkoutSuccessUrl(req, orderId, "cancelled"), 302);
    }
    // PENDING: authoritative status not resolved yet. If the buyer arrived via
    // Koko's cancel redirect, show the cancelled state — but do NOT mutate order
    // state on this unverified browser hint; the order stays PENDING so a
    // genuinely completed payment can still be finalized by the `response`
    // (server-to-server) callback.
    if (url.searchParams.get("status") === "cancelled") {
      return NextResponse.redirect(checkoutSuccessUrl(req, orderId, "cancelled"), 302);
    }
    return NextResponse.redirect(checkoutSuccessUrl(req, orderId), 302);
  } catch (err) {
    console.error("[koko] return route error", { orderId, err });
    return NextResponse.redirect(checkoutSuccessUrl(req, orderId), 302);
  }
}
