// app/_lib/checkout-config.ts
// Shared so the client cart summary and the server action agree on totals.
export const SHIPPING_COST = 350;
export const FREE_SHIPPING_THRESHOLD = 5000;

export function calculateShipping(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
}
