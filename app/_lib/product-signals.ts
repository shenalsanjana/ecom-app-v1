// app/_lib/product-signals.ts
// Display-only conversion signals for product cards. Pure — the DB reads live
// in app/_lib/products.ts and pass their results in.
//
// These are display metadata only: nothing here participates in pricing, cart,
// or checkout logic. Both signals are derived from real data on purpose — a
// hardcoded "Only 4 left" would be fabricated scarcity shown to real customers.
import {
  designAvailable,
  plainStockKey,
  type PlainStockMap,
  type DesignStockMap,
} from "@/app/_lib/variants";

export const LOW_STOCK_THRESHOLD = 6;
export const BESTSELLER_COUNT = 3;

/**
 * Total fulfillable units for one color, across all its sizes.
 *
 * Every finished tee consumes one blank AND one print from a SINGLE SHARED
 * design pool (see `stockForSize` in variants.ts). Summing per-size minima
 * against that shared pool would count the same design units once per size,
 * overstating stock. The true total is capped once, at the colour level:
 * min(designQty, sum of plain blanks across sizes) — zero when there is no
 * design or the design pool is empty.
 */
export function unitsForVariant(
  sizes: { size: string }[],
  colorSlug: string,
  dtfDesignId: string | null,
  plainStock: PlainStockMap,
  designStock: DesignStockMap,
): number {
  if (!designAvailable(dtfDesignId, designStock)) return 0;
  const designQty = designStock.get(dtfDesignId as string) ?? 0;
  const totalPlain = sizes.reduce(
    (sum, s) => sum + (plainStock.get(plainStockKey(colorSlug, s.size))?.quantity ?? 0),
    0,
  );
  return Math.min(designQty, totalPlain);
}

/**
 * The "Only N left" nudge, or undefined when it should not be shown.
 * Zero is deliberately silent: out of stock is not scarcity, and the card
 * already communicates unavailability through its sizes.
 */
export function lowStockSignal(units: number): number | undefined {
  return units > 0 && units <= LOW_STOCK_THRESHOLD ? units : undefined;
}

/**
 * Product ids to badge as "Bestseller". Sorted by units sold descending, then
 * by productId ascending so the result is stable across cache windows for a
 * catalog where several products are tied.
 */
export function pickBestsellers(
  sold: { productId: string; units: number }[],
  topN: number,
): Set<string> {
  return new Set(
    sold
      .filter((s) => s.units > 0)
      .sort((a, b) => b.units - a.units || a.productId.localeCompare(b.productId))
      .slice(0, topN)
      .map((s) => s.productId),
  );
}
