// app/_lib/checkout-config.ts
// Shared so the client cart summary and the server action agree on totals.
import type { DeliveryZone } from "@/app/_lib/delivery-zones";

export const COLOMBO_DELIVERY_COST = 350;
export const OTHER_DELIVERY_COST = 450;
export const FREE_DELIVERY_THRESHOLD = 5000;

export type DeliveryConfig = {
  colombo: number;
  other: number;
  freeThreshold: number;
};

// Seed/fallback. Live values come from StoreSettings via getDeliveryConfig().
export const DEFAULT_DELIVERY_CONFIG: DeliveryConfig = {
  colombo: COLOMBO_DELIVERY_COST,
  other: OTHER_DELIVERY_COST,
  freeThreshold: FREE_DELIVERY_THRESHOLD,
};

// Payment methods that never qualify for free delivery, whatever the subtotal.
// The buy-now-pay-later providers charge the store a fee per order, so the
// free-delivery threshold is not extended to them.
//
// Kept HERE rather than in app/_lib/payments/registry.ts on purpose: registry
// imports the provider modules, which pull in node `crypto`, and this file is
// imported by client components (cart summary, checkout form). Importing
// registry here would drag server-only code into the browser bundle.
export const NO_FREE_DELIVERY_METHODS = ["KOKO", "MINTPAY"] as const;

export function isFreeDeliveryEligible(paymentMethod?: string | null): boolean {
  if (!paymentMethod) return true;
  return !(NO_FREE_DELIVERY_METHODS as readonly string[]).includes(paymentMethod);
}

/**
 * Delivery cost for a cart.
 *
 * `paymentMethod` is optional so surfaces that do not know it yet (the cart
 * page — the method is chosen at checkout) keep their existing behaviour and
 * show the threshold-based estimate. Everywhere the method IS known it must be
 * passed, above all in the checkout server action, which decides what the
 * customer is actually charged.
 */
export function calculateDelivery(
  subtotal: number,
  zone: DeliveryZone,
  config: DeliveryConfig = DEFAULT_DELIVERY_CONFIG,
  paymentMethod?: string | null,
): number {
  const zoneCost = zone === "COLOMBO" ? config.colombo : config.other;
  if (!isFreeDeliveryEligible(paymentMethod)) return zoneCost;
  if (subtotal >= config.freeThreshold) return 0;
  return zoneCost;
}
