import { NextResponse } from "next/server";
import { getMintpayConfig } from "@/app/_lib/payments/config";
import { finalizeFailedPayment, finalizePaidPayment } from "@/app/_lib/payments/order-finalization";
import { mintpayFailHash, mintpaySuccessHash } from "@/app/_lib/payments/mintpay";
import { checkoutSuccessUrl } from "@/app/_lib/payments/shared";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId") ?? "";
  const hash = url.searchParams.get("hash") ?? "";
  const result = url.searchParams.get("result") ?? "";
  const amount = Number(url.searchParams.get("amount") ?? "0");
  const cfg = getMintpayConfig();

  if (!orderId || !hash) {
    return NextResponse.json({ error: "Invalid Mintpay return" }, { status: 400 });
  }

  if (result === "success") {
    if (!Number.isFinite(amount)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    const expected = Buffer.from(mintpaySuccessHash(cfg.merchantId, amount, orderId, cfg.merchantSecret)).toString("base64");
    if (hash !== expected) return NextResponse.json({ error: "Signature verification failed" }, { status: 403 });
    await finalizePaidPayment(orderId, "MINTPAY");
    return NextResponse.redirect(checkoutSuccessUrl(req, orderId), 302);
  } else if (result === "failed") {
    const expected = Buffer.from(mintpayFailHash(orderId, cfg.merchantSecret)).toString("base64");
    if (hash !== expected) return NextResponse.json({ error: "Signature verification failed" }, { status: 403 });
    await finalizeFailedPayment(orderId, "MINTPAY", "failed");
    return NextResponse.redirect(checkoutSuccessUrl(req, orderId, "cancelled"), 302);
  } else {
    return NextResponse.json({ error: "Unknown result" }, { status: 400 });
  }
}
