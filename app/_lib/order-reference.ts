// app/_lib/order-reference.ts
// Single source of truth for the customer-facing order reference.
// New orders carry `webNumber`. Pre-WEB-rollout orders carry `rbNumber`.
// Both fields may be absent on internal-only Prisma row shapes; fall back
// through `orderId` and `id` so this helper is safe to call anywhere.

export function orderReference(o: {
  webNumber?: string | null;
  rbNumber?: string | null;
  orderId?: string;
  id?: string;
}): string {
  return o.webNumber ?? o.rbNumber ?? o.orderId ?? o.id ?? "";
}
