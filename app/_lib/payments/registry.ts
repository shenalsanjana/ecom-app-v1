import { envFlag } from "./config";
import { kokoProvider } from "./koko";
import { mintpayProvider } from "./mintpay";
import { payHereProvider } from "./payhere";
import type { CheckoutPaymentOption, OnlinePaymentMethod, PaymentMethod, PaymentProvider } from "./types";

export const ONLINE_PAYMENT_METHODS = ["PAYHERE", "KOKO", "MINTPAY"] as const;

export function isOnlinePaymentMethod(value: string): value is OnlinePaymentMethod {
  return (ONLINE_PAYMENT_METHODS as readonly string[]).includes(value);
}

export function checkoutPaymentOptions(): CheckoutPaymentOption[] {
  const options: CheckoutPaymentOption[] = [
    { id: "COD", name: "Cash on Delivery", description: "Pay when you receive your order", icon: "💵" },
    { id: "PAYHERE", name: "Credit / Debit Card", description: "Visa, Mastercard & more — secured by PayHere", icon: "💳" },
  ];

  if (envFlag("KOKO_ENABLED")) {
    options.push({ id: "KOKO", name: "Koko", description: "Pay in 3 with Koko", icon: "🐘" });
  }
  if (envFlag("MINTPAY_ENABLED")) {
    options.push({ id: "MINTPAY", name: "Mintpay", description: "Pay with Mintpay", icon: "📱" });
  }

  return options;
}

export function assertPaymentMethod(value: string): asserts value is PaymentMethod {
  if (value !== "COD" && !isOnlinePaymentMethod(value)) {
    throw new Error(`Unsupported payment method: ${value}`);
  }
}

const PROVIDERS: Record<OnlinePaymentMethod, PaymentProvider> = {
  PAYHERE: payHereProvider,
  KOKO: kokoProvider,
  MINTPAY: mintpayProvider,
};

export function getPaymentProvider(method: OnlinePaymentMethod): PaymentProvider {
  return PROVIDERS[method];
}
