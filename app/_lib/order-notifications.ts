import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import {
  sendOrderConfirmationEmail,
  sendCustomerDispatchEmail,
  sendCustomerCancellationEmail,
  logMailerError,
  type OrderDetails,
} from "@/app/_lib/mailer";
import { shouldEmailCustomer } from "@/app/_lib/mailer-guard";
import {
  sendOrderConfirmationSms,
  sendOrderDispatchedSms,
  sendOrderCancelledSms,
} from "@/app/_lib/sms";
import { orderReference } from "@/app/_lib/order-reference";
import { DELIVERY_COMPANY_NAME } from "@/app/_lib/carrier";

function logSmsError(context: string, meta: Record<string, unknown>, err: unknown): void {
  console.error(`[sms] ${context} failed`, {
    ...meta,
    error: err instanceof Error ? err.message : String(err),
  });
}

// Atomically flip an "unsent" flag to "sent". Returns true only for the caller
// whose conditional updateMany changed the row — so a repeated trigger (e.g.
// Koko's double payment callback) sends at most one message per channel.
async function claimOnce(
  orderId: string,
  guard: Prisma.OrderWhereInput,
  mark: Prisma.OrderUpdateManyMutationInput,
  label: string,
): Promise<boolean> {
  try {
    const r = await prisma.order.updateMany({ where: { id: orderId, ...guard }, data: mark });
    return r.count === 1;
  } catch (err) {
    logSmsError(`${label}-claim`, { orderId }, err);
    return false;
  }
}

// Undo a claim so a later legitimate retry can re-send.
async function releaseOnce(orderId: string, mark: Prisma.OrderUpdateManyMutationInput): Promise<void> {
  await prisma.order.updateMany({ where: { id: orderId }, data: mark }).catch(() => {});
}

/**
 * Order confirmation → email (when present, guarded by the one-time emailSent
 * flag) and SMS (always, to the order's mobile). Never throws.
 */
export async function notifyOrderConfirmed(details: OrderDetails): Promise<void> {
  const orderId = details.orderId;

  if (
    shouldEmailCustomer(details.customerEmail) &&
    (await claimOnce(orderId, { emailSent: false }, { emailSent: true }, "confirmation-email"))
  ) {
    try {
      await sendOrderConfirmationEmail(details);
    } catch (err) {
      await releaseOnce(orderId, { emailSent: false });
      logMailerError("order-confirmation", { orderId, webNumber: details.webNumber }, err);
    }
  }

  if (
    details.customerPhone &&
    (await claimOnce(
      orderId,
      { confirmationSmsSentAt: null },
      { confirmationSmsSentAt: new Date() },
      "confirmation-sms",
    ))
  ) {
    try {
      await sendOrderConfirmationSms({
        phone: details.customerPhone,
        ref: orderReference(details),
        total: details.total,
        items: details.items.map((item) => ({ name: item.name, color: item.color ?? null })),
      });
    } catch (err) {
      await releaseOnce(orderId, { confirmationSmsSentAt: null });
      logSmsError("order-confirmation", { orderId, webNumber: details.webNumber }, err);
    }
  }
}

/**
 * Dispatch → customer dispatch email (guarded by customerDispatchEmailSentAt)
 * and SMS with the tracking code. Never throws.
 */
export async function notifyOrderDispatched(details: OrderDetails, trackingCode: string): Promise<void> {
  const orderId = details.orderId;

  if (
    shouldEmailCustomer(details.customerEmail) &&
    (await claimOnce(
      orderId,
      { customerDispatchEmailSentAt: null },
      { customerDispatchEmailSentAt: new Date() },
      "dispatch-email",
    ))
  ) {
    try {
      await sendCustomerDispatchEmail({ ...details, trackingCode });
    } catch (err) {
      await releaseOnce(orderId, { customerDispatchEmailSentAt: null });
      logMailerError("dispatch", { orderId, webNumber: details.webNumber }, err);
    }
  }

  if (
    details.customerPhone &&
    (await claimOnce(
      orderId,
      { dispatchSmsSentAt: null },
      { dispatchSmsSentAt: new Date() },
      "dispatch-sms",
    ))
  ) {
    try {
      await sendOrderDispatchedSms({
        phone: details.customerPhone,
        ref: orderReference(details),
        trackingCode,
        carrier: DELIVERY_COMPANY_NAME,
      });
    } catch (err) {
      await releaseOnce(orderId, { dispatchSmsSentAt: null });
      logSmsError("dispatch", { orderId, webNumber: details.webNumber }, err);
    }
  }
}

/**
 * Cancellation → cancellation email (guarded by shouldEmailCustomer; no email
 * flag column exists, and the cancel action's status transition already
 * prevents re-entry) and SMS (guarded by cancellationSmsSentAt). Never throws.
 */
export async function notifyOrderCancelled(details: OrderDetails): Promise<void> {
  const orderId = details.orderId;

  if (shouldEmailCustomer(details.customerEmail)) {
    try {
      await sendCustomerCancellationEmail(details);
    } catch (err) {
      logMailerError("cancellation", { orderId, webNumber: details.webNumber }, err);
    }
  }

  if (
    details.customerPhone &&
    (await claimOnce(
      orderId,
      { cancellationSmsSentAt: null },
      { cancellationSmsSentAt: new Date() },
      "cancellation-sms",
    ))
  ) {
    try {
      await sendOrderCancelledSms({ phone: details.customerPhone, ref: orderReference(details) });
    } catch (err) {
      await releaseOnce(orderId, { cancellationSmsSentAt: null });
      logSmsError("cancellation", { orderId, webNumber: details.webNumber }, err);
    }
  }
}
