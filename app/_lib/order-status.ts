// app/_lib/order-status.ts
// Payment-lifecycle enum and customer-facing labels for Order.paymentStatus.

export const PAYMENT_STATUSES = [
  "PENDING",
  "PAID",
  "PAYMENT_FAILED",
  "COD_PENDING",
  "COD_COLLECTED",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Returns the initial payment status for a new order based on payment method.
 * COD orders are awaiting cash collection at delivery; everything else is
 * awaiting online payment confirmation.
 */
export function initialPaymentStatus(paymentMethod: string): PaymentStatus {
  return paymentMethod === "COD" ? "COD_PENDING" : "PENDING";
}

/** Customer-facing label for a payment status. Returns null for null / unknown. */
export function paymentStatusLabel(
  status: PaymentStatus | string | null | undefined,
): string | null {
  if (!status) return null;
  switch (status) {
    case "PENDING":
      return "Awaiting payment";
    case "PAID":
    case "COD_COLLECTED":
      return "Paid";
    case "COD_PENDING":
      return "Cash on delivery";
    case "PAYMENT_FAILED":
      return "Payment failed";
    default:
      return null;
  }
}

export function checkoutPaymentState(args: {
  paymentMethod: string;
  paymentStatus: PaymentStatus | string | null | undefined;
  urlStatus?: string | null;
}): { isPaid: boolean; isCod: boolean; isCancelled: boolean } {
  const isCod = args.paymentMethod === "COD";
  const isPaid = args.paymentStatus === "PAID" || args.paymentStatus === "COD_COLLECTED";
  const isCancelled =
    !isPaid &&
    !isCod &&
    (args.urlStatus === "cancelled" || args.paymentStatus === "PAYMENT_FAILED");

  return { isPaid, isCod, isCancelled };
}
