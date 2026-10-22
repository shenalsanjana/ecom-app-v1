import { prisma } from "@/app/_lib/prisma";
import { claimOrderMutation, OrderConflictError } from "@/app/_lib/order-concurrency";
import { verifyPayment } from "@/app/_lib/payhere-api";
import { fetchKokoOrderStatus } from "./koko";
import { finalizeFailedPayment, finalizePaidPayment } from "./order-finalization";
import { ONLINE_PAYMENT_METHODS } from "./registry";

export const UNPAID_REVIEW_AFTER_MS = 2 * 60 * 60 * 1000;

export async function reconcileUnpaidOrder(orderId: string, now = new Date()) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentStatus !== "PENDING" || order.status !== "PENDING" || !(ONLINE_PAYMENT_METHODS as readonly string[]).includes(order.paymentMethod)) {
    return { status: "not_eligible" };
  }
  if (now.getTime() - order.createdAt.getTime() < UNPAID_REVIEW_AFTER_MS) return { status: "not_due" };
  if (!order.paymentStartedAt) {
    return finalizeFailedPayment(order.id, order.paymentMethod, "Expired before payment initiation", { uninitiatedOnly: true });
  }

  // An API timeout or "no records" is not proof that payment cannot settle.
  // Keep the stock held when the gateway cannot establish a terminal outcome.
  let reason = "Payment status is uncertain. Verify with the provider before releasing stock.";
  try {
    if (order.paymentMethod === "KOKO") {
      const status = await fetchKokoOrderStatus(order.id);
      if (status === "SUCCESS") return finalizePaidPayment(order.id, "KOKO");
      if (status === "FAILED") return finalizeFailedPayment(order.id, "KOKO", "Verified by reconciliation");
    } else if (order.paymentMethod === "PAYHERE") {
      const payment = await verifyPayment(order.id);
      if (payment.verified && payment.amount !== undefined && payment.currency) {
        return finalizePaidPayment(order.id, "PAYHERE", { reference: payment.paymentId, amount: payment.amount, currency: payment.currency });
      }
    } else {
      reason = "Mintpay requires provider verification by staff. Stock remains held until payment is confirmed or the order is cancelled after verification.";
    }
  } catch {
    reason = "The payment provider could not be reached. Stock remains held; retry verification before releasing it.";
  }
  try {
    await prisma.$transaction(async (tx) => {
      await claimOrderMutation(tx, order);
      await tx.order.update({ where: { id: order.id }, data: { paymentReviewRequired: true, paymentReviewReason: reason } });
      const eventKey = JSON.stringify([order.paymentMethod, order.id, "RECONCILE"]);
      await tx.paymentEvent.upsert({ where: { eventKey }, update: {}, create: {
        eventKey, orderId: order.id, provider: order.paymentMethod, outcome: "REVIEW", result: "review_required",
      } });
    });
  } catch (error) {
    if (error instanceof OrderConflictError) return { status: "changed" };
    throw error;
  }
  return { status: "review_required" };
}

export async function reconcileUnpaidOrders(now = new Date()) {
  const orders = await prisma.order.findMany({
    where: { paymentStatus: "PENDING", status: "PENDING", paymentMethod: { in: [...ONLINE_PAYMENT_METHODS] },
      paymentReviewRequired: false, createdAt: { lte: new Date(now.getTime() - UNPAID_REVIEW_AFTER_MS) } },
    orderBy: { createdAt: "asc" }, take: 5, select: { id: true },
  });
  const results = [];
  // Deliberately sequential: avoid a burst of DB connections/provider requests.
  for (const order of orders) {
    try { results.push({ orderId: order.id, ...await reconcileUnpaidOrder(order.id, now) }); }
    catch { results.push({ orderId: order.id, status: "retry_required" }); }
  }
  return results;
}
