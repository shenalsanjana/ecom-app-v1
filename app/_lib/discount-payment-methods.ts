import type { PaymentMethod } from "./payments/types";

/** Client-safe labels; importing the provider registry would bundle server code. */
export const DISCOUNT_PAYMENT_METHODS = ["COD", "PAYHERE", "KOKO", "MINTPAY"] as const;
export const DISCOUNT_PAYMENT_LABELS: Record<PaymentMethod, string> = {
  COD: "Cash on Delivery (COD)", PAYHERE: "PayHere", KOKO: "Koko", MINTPAY: "Mintpay",
};
export function hasPaymentRestriction(offer: { paymentMethods?: readonly string[] }) {
  const methods = offer.paymentMethods ?? [];
  return methods.length > 0 && !DISCOUNT_PAYMENT_METHODS.every(method => methods.includes(method));
}
export function eligiblePaymentLabels(offer: { paymentMethods?: readonly string[] }) {
  if (!hasPaymentRestriction(offer)) return "All payment methods";
  return new Intl.ListFormat("en", { style: "long", type: "disjunction" }).format(
    DISCOUNT_PAYMENT_METHODS.filter(method => offer.paymentMethods!.includes(method)).map(method => DISCOUNT_PAYMENT_LABELS[method]));
}
export function paymentEligible(offer: { paymentMethods?: readonly string[] }, method?: PaymentMethod) {
  return !hasPaymentRestriction(offer) || (!!method && offer.paymentMethods!.includes(method));
}
export function paymentEligibilityMessage(offer: { paymentMethods?: readonly string[] }, method?: PaymentMethod, subject = "This offer") {
  return method
    ? `${subject} is not applied with ${DISCOUNT_PAYMENT_LABELS[method]}. Choose ${eligiblePaymentLabels(offer)} to use it, or continue without this saving.`
    : `${subject} is not included yet. Choose ${eligiblePaymentLabels(offer)} at checkout to use it.`;
}
