import { setStockMovementContext } from "@/app/_lib/stock-movements";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import { logMailerError, type OrderDetails } from "@/app/_lib/mailer";
import { notifyOrderConfirmed } from "@/app/_lib/order-notifications";
import { restoreItemPools } from "@/app/_lib/inventory-pools";
import { claimOrderMutation, OrderConflictError } from "@/app/_lib/order-concurrency";
import { invalidateStock } from "@/app/_lib/invalidate-stock";

type PaymentOrder = Prisma.OrderGetPayload<{ include: { user: { select: { name: true; email: true } }; items: true; adjustments: true } }>;
export type PaymentEvidence = { reference?: string; amount?: number; currency?: string; uninitiatedOnly?: boolean };

function paidDetails(order: PaymentOrder): OrderDetails {
  return {
    orderId: order.id,
    customerName: order.guestName ?? order.user?.name ?? "Customer",
    customerEmail: order.guestEmail ?? order.user?.email ?? "",
    customerPhone: order.customerPhone,
    alternatePhone: order.alternatePhone,
    items: order.items,
    adjustments: order.adjustments,
    subtotal: order.subtotal,
    shipping: order.shippingCost,
    total: order.total,
    shippingAddress: { line1: order.shippingLine1, line2: order.shippingLine2 ?? undefined, city: order.shippingCity, country: order.shippingCountry },
    paymentMethod: order.paymentMethod as OrderDetails["paymentMethod"],
    paymentMethodDisplay: order.paymentMethodDisplay,
    webNumber: order.webNumber,
    rbNumber: order.rbNumber,
    paymentStatus: "PAID",
  };
}

async function finalize(orderId: string, method: string, outcome: "PAID" | "FAILED", reason: string, evidence: PaymentEvidence) {
  // Reread after a lost claim. Failure must not restore a paid order's stock;
  // late success is recorded for review instead of silently reviving an order.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId }, include: { user: { select: { name: true, email: true } }, items: true, adjustments: true } });
        if (!order) return { status: "order_not_found" as const };
        if (order.paymentMethod !== method || method === "COD") return { status: "payment_method_mismatch" as const };
        let status: "success" | "failed" | "already_processed" | "already_failed" | "already_paid" | "review_required" | "not_expired";
        let review: string | null = null;
        const amountMismatch = evidence.amount !== undefined && (!Number.isFinite(evidence.amount) || Math.round(evidence.amount * 100) !== Math.round(order.total * 100));
        if (amountMismatch || (evidence.currency !== undefined && evidence.currency !== "LKR")) {
          review = "Gateway amount or currency does not match the order. Verify the payment before fulfillment.";
          status = "review_required";
        } else if (outcome === "PAID") {
          if (order.paymentStatus === "PAID") {
            const previous = evidence.reference ? await tx.paymentEvent.findFirst({
              where: { orderId, provider: method, outcome: "PAID", result: "success" },
              orderBy: { createdAt: "asc" }, select: { providerReference: true },
            }) : null;
            if (evidence.reference && previous?.providerReference !== evidence.reference) {
              review = "A different payment reference was received for an already-paid order. Check for a duplicate charge before refunding or fulfilling.";
              status = "review_required";
            } else status = "already_processed";
          }
          else if (order.status === "CANCELLED" || order.paymentStatus === "PAYMENT_FAILED") {
            review = "Payment received after this order was closed and its stock released. Reconcile or refund the payment; do not fulfill automatically.";
            status = "review_required";
          } else status = "success";
        } else if (order.paymentStatus === "PAID") status = "already_paid";
        else if (order.status === "CANCELLED" || order.paymentStatus === "PAYMENT_FAILED") status = "already_failed";
        else if (evidence.uninitiatedOnly && order.paymentStartedAt) status = "not_expired";
        else if (order.status !== "PENDING" || order.courierBookedAt) {
          review = "Payment failed after order preparation or dispatch. Verify physical stock and payment before cancelling.";
          status = "review_required";
        } else status = "failed";

        if (status === "success" || status === "failed" || status === "review_required") {
          await setStockMovementContext(tx, { actorType: "SYSTEM", reason: "Verified payment failure / allocation released", orderId: order.id });
          await claimOrderMutation(tx, order);
          if (status === "success") {
            await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID", paymentReviewRequired: false, paymentReviewReason: null } });
          } else if (status === "failed") {
            await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PAYMENT_FAILED", status: "CANCELLED", paymentReviewRequired: false, paymentReviewReason: null } });
            for (const item of order.items) await restoreItemPools(tx, item);
          } else {
            await tx.order.update({ where: { id: order.id }, data: { paymentReviewRequired: true, paymentReviewReason: review } });
          }
        }
        if (status !== "not_expired") {
          const eventKey = JSON.stringify([method, orderId, evidence.reference ?? reason, outcome]);
          await tx.paymentEvent.upsert({ where: { eventKey }, update: {}, create: {
            eventKey, orderId, provider: method, outcome, result: status, providerReference: evidence.reference,
          } });
        }
        return { status, order };
      });
      if (result.status === "success" || result.status === "failed" || result.status === "review_required") invalidateStock();
      if ((result.status === "success" || result.status === "already_processed") && result.order && result.order.status !== "CANCELLED") {
        // Dispatcher claims permit retries after email/SMS failure without
        // duplicating a previously delivered notification.
        try { await notifyOrderConfirmed(paidDetails(result.order)); }
        catch (error) { logMailerError("order-confirmation", { orderId }, error); }
      }
      return { status: result.status, ...(result.status === "failed" ? { reason } : {}) };
    } catch (error) {
      if (error instanceof OrderConflictError || (typeof error === "object" && error !== null && "code" in error && ["P2002", "P2034"].includes(String(error.code)))) continue;
      throw error;
    }
  }
  throw new OrderConflictError();
}

export function finalizePaidPayment(orderId: string, expectedMethod: string, evidence: PaymentEvidence = {}) {
  return finalize(orderId, expectedMethod, "PAID", "paid", evidence);
}

export function finalizeFailedPayment(orderId: string, expectedMethod: string, reason: string, evidence: PaymentEvidence = {}) {
  return finalize(orderId, expectedMethod, "FAILED", reason, evidence);
}
