"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { reconcileUnpaidOrder } from "@/app/_lib/payments/reconcile-unpaid";
import type { ActionResult } from "./actions";
import { prisma } from "@/app/_lib/prisma";
import { claimOrderMutation } from "@/app/_lib/order-concurrency";

export async function recheckPayment(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    const result = await reconcileUnpaidOrder(orderId);
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
    return { success: true, warning: result.status === "not_due"
      ? "Payment checks begin two hours after checkout. Stock remains held."
      : result.status === "review_required" ? "Verify this payment with the provider before cancelling or fulfilling the order."
        : `Payment check: ${result.status.replaceAll("_", " ")}.` };
  } catch { return { success: false, error: "Payment verification failed. Stock remains held; try again." }; }
}

export async function resolvePaymentReview(orderId: string, note: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (typeof note !== "string" || note.trim().length < 10 || note.trim().length > 500) {
    return { success: false, error: "Describe the verified payment or refund outcome (10–500 characters)." };
  }
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order?.paymentReviewRequired) return { success: false, error: "This order has no pending payment review." };
  if (order.status !== "CANCELLED" && order.paymentStatus !== "PAID") {
    return { success: false, error: "Verify payment with the provider, or cancel after confirming non-payment, before resolving this review." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await claimOrderMutation(tx, order);
      await tx.orderNote.create({ data: { orderId, authorEmail: session.user.email ?? session.user.id, body: `Payment review resolved: ${note.trim()}` } });
      await tx.order.update({ where: { id: orderId }, data: { paymentReviewRequired: false, paymentReviewReason: null } });
    });
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
    return { success: true };
  } catch { return { success: false, error: "The order changed. Refresh and check the payment again." }; }
}
