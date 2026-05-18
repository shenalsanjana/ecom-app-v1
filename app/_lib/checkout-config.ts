// app/_lib/checkout-config.ts
// Shared so the client cart summary and the server action agree on totals.
import type { DeliveryZone } from "@/app/_lib/delivery-zones";

export const COLOMBO_DELIVERY_COST = 350;
export const OTHER_DELIVERY_COST = 450;
export const FREE_DELIVERY_THRESHOLD = 5000;

export function calculateDelivery(subtotal: number, zone: DeliveryZone): number {
  if (subtotal >= FREE_DELIVERY_THRESHOLD) return 0;
  return zone === "COLOMBO" ? COLOMBO_DELIVERY_COST : OTHER_DELIVERY_COST;
}
