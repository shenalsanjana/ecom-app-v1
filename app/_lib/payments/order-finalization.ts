import { type OrderItem, type Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import {
  logMailerError,
  sendAdminFailureAlertEmail,
  sendOrderConfirmationEmail,
  type OrderDetails,
} from "@/app/_lib/mailer";

type OrderWithUser = Prisma.OrderGetPayload<{ include: { user: { select: { name: true; email: true } } } }>;

function paidDetails(order: OrderWithUser, items: OrderItem[]): OrderDetails {
  return {
    orderId: order.id,
    customerName: order.guestName ?? order.user?.name ?? "Customer",
    customerEmail: order.guestEmail ?? order.user?.email ?? "",
    customerPhone: order.customerPhone,
    items: items.map((it) => ({
      name: it.name,
      size: it.size,
      price: it.price,
      quantity: it.quantity,
    })),
    subtotal: order.subtotal,
    shipping: order.shippingCost,
    total: order.total,
    shippingAddress: {
      line1: order.shippingLine1,
      line2: order.shippingLine2 ?? undefined,
      city: order.shippingCity,
      country: order.shippingCountry,
    },
    paymentMethod: order.paymentMethod as OrderDetails["paymentMethod"],
    paymentMethodDisplay: order.paymentMethodDisplay ?? undefined,
    webNumber: order.webNumber,
    rbNumber: order.rbNumber,
    paymentStatus: "PAID",
  };
}

export async function finalizePaidPayment(orderId: string, expectedMethod: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!order) return { status: "order_not_found" as const };
  if (order.paymentMethod !== expectedMethod) return { status: "payment_method_mismatch" as const };
  if (order.paymentStatus === "PAID") return { status: "already_processed" as const };
  if (order.paymentStatus === "PAYMENT_FAILED" || order.status === "CANCELLED") {
    return { status: "already_failed" as const };
  }

  // Atomically claim the order as PAID. Koko fires BOTH a server-to-server
  // response and a browser return, so two concurrent callers can pass the
  // check-then-act guard above. Only the caller whose conditional updateMany
  // flips the row (count === 1) proceeds to run email/courier side effects;
  // the loser short-circuits as already_processed. (Amendment A2)
  const claim = await prisma.order.updateMany({
    where: { id: orderId, paymentStatus: { not: "PAID" } },
    data: { paymentStatus: "PAID" },
  });
  if (claim.count !== 1) return { status: "already_processed" as const };

  const updated = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!updated) return { status: "success" as const };

  try {
    const items = await prisma.orderItem.findMany({ where: { orderId } });
    const details = paidDetails(updated, items);

    // NOTE: emailSent is a best-effort dedup hint for the mailer; the atomic
    // claim (updateMany above) is the real idempotency gate — do not remove the
    // claim assuming this flag alone suffices.
    if (!updated.emailSent) {
      try {
        await sendOrderConfirmationEmail(details);
        await prisma.order.update({ where: { id: orderId }, data: { emailSent: true } });
      } catch (err) {
        logMailerError("order-confirmation", { orderId, webNumber: updated.webNumber }, err);
      }
    }
  } catch (err) {
    // Safety net: findMany or paidDetails threw after the order was already
    // marked PAID. The payment is finalized; alert the admin so post-processing
    // (courier + confirmation email) can be handled manually.
    try {
      await sendAdminFailureAlertEmail({
        orderId,
        step: "orchestrate-courier",
        reason: err instanceof Error ? err.message : "finalize-paid post-claim failure",
        order: paidDetails(updated, []),
      });
    } catch {
      /* alert delivery must not prevent the success response */
    }
  }

  return { status: "success" as const };
}

export async function finalizeFailedPayment(orderId: string, expectedMethod: string, reason: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return { status: "order_not_found" as const };
  if (order.paymentMethod !== expectedMethod) return { status: "payment_method_mismatch" as const };
  if (order.paymentStatus === "PAID") return { status: "already_paid" as const };
  if (order.paymentStatus === "PAYMENT_FAILED" || order.status === "CANCELLED") {
    return { status: "already_failed" as const };
  }

  let claimed = false;
  await prisma.$transaction(async (tx) => {
    // Atomically claim the failure so concurrent callbacks restore stock
    // exactly once (design doc: "Stock is restored ... exactly once"). (Amendment A2)
    const claim = await tx.order.updateMany({
      where: {
        id: orderId,
        paymentStatus: { notIn: ["PAID", "PAYMENT_FAILED"] },
        status: { not: "CANCELLED" },
      },
      data: { paymentStatus: "PAYMENT_FAILED", status: "CANCELLED" },
    });
    if (claim.count !== 1) return;
    claimed = true;
    for (const item of order.items) {
      if (!item.variantId || !item.size) continue; // variant hard-deleted or sizeless — nothing to restore
      await tx.variantSizeStock.updateMany({
        where: { variantId: item.variantId, size: item.size },
        data: { stock: { increment: item.quantity } },
      });
    }
  });

  return claimed
    ? { status: "failed" as const, reason }
    : { status: "already_failed" as const };
}
