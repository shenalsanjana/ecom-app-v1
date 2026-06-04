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

export function calculateDelivery(
  subtotal: number,
  zone: DeliveryZone,
  config: DeliveryConfig = DEFAULT_DELIVERY_CONFIG,
): number {
  if (subtotal >= config.freeThreshold) return 0;
  return zone === "COLOMBO" ? config.colombo : config.other;
}
