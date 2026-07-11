// Pure variant domain helpers. No DB, no React — unit-tested in isolation.
export type SizeStock = { size: string; stock: number };

export function effectivePrice(
  variant: { price: number | null },
  product: { price: number },
): number {
  return variant.price ?? product.price;
}

export function effectiveOriginalPrice(
  variant: { originalPrice: number | null },
  product: { originalPrice: number | null },
): number | null {
  return variant.originalPrice ?? product.originalPrice;
}

export type PlainStockEntry = { id: string; quantity: number };
export type PlainStockMap = Map<string, PlainStockEntry>; // key: plainStockKey(colorSlug, size)
export type DesignStockMap = Map<string, number>;         // key: dtfDesignId -> quantity

export function plainStockKey(colorSlug: string, size: string): string {
  return `${colorSlug}::${size}`;
}

export function buildPlainStockMap(
  rows: { id: string; colorSlug: string; size: string; quantity: number }[],
): PlainStockMap {
  return new Map(rows.map((r) => [plainStockKey(r.colorSlug, r.size), { id: r.id, quantity: r.quantity }]));
}

export function buildDesignStockMap(rows: { id: string; quantity: number }[]): DesignStockMap {
  return new Map(rows.map((r) => [r.id, r.quantity]));
}

export function designAvailable(dtfDesignId: string | null, designStock: DesignStockMap): boolean {
  if (!dtfDesignId) return false;
  return (designStock.get(dtfDesignId) ?? 0) > 0;
}

// The fundamental two-pool primitive: how many units of this exact
// color+size+design combination can actually be fulfilled right now. Zero
// whenever the design is unavailable (a design hitting zero takes every size
// of every variant of that product out of stock, by construction).
export function stockForSize(
  colorSlug: string,
  size: string,
  dtfDesignId: string | null,
  plainStock: PlainStockMap,
  designStock: DesignStockMap,
): number {
  if (!designAvailable(dtfDesignId, designStock)) return 0;
  const designQty = designStock.get(dtfDesignId as string) ?? 0;
  const plainQty = plainStock.get(plainStockKey(colorSlug, size))?.quantity ?? 0;
  return Math.min(plainQty, designQty);
}

export function availableSizes(
  sizes: { size: string }[],
  colorSlug: string,
  dtfDesignId: string | null,
  plainStock: PlainStockMap,
  designStock: DesignStockMap,
): string[] {
  return sizes
    .filter((s) => stockForSize(colorSlug, s.size, dtfDesignId, plainStock, designStock) > 0)
    .map((s) => s.size);
}

export function variantInStock(
  sizes: { size: string }[],
  colorSlug: string,
  dtfDesignId: string | null,
  plainStock: PlainStockMap,
  designStock: DesignStockMap,
): boolean {
  return availableSizes(sizes, colorSlug, dtfDesignId, plainStock, designStock).length > 0;
}

export function productInStock(
  variants: { colorSlug: string; sizes: { size: string }[] }[],
  dtfDesignId: string | null,
  plainStock: PlainStockMap,
  designStock: DesignStockMap,
): boolean {
  return variants.some((v) => variantInStock(v.sizes, v.colorSlug, dtfDesignId, plainStock, designStock));
}

export function resolveDefaultVariant<T extends { sortOrder: number; archived: boolean }>(
  variants: T[],
): T | null {
  const active = variants.filter((v) => !v.archived);
  if (active.length === 0) return null;
  return active.reduce((best, v) => (v.sortOrder < best.sortOrder ? v : best));
}

export function pickVariantBySlug<T extends { colorSlug: string }>(
  variants: T[],
  slug: string | undefined,
): T | undefined {
  return slug ? variants.find((v) => v.colorSlug === slug) : undefined;
}

// Canonical apparel size order. Unknown/custom sizes sort after known ones,
// preserving their incoming relative order (stable).
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL"];

export function sizeRank(size: string): number {
  const i = SIZE_ORDER.indexOf(size.trim().toUpperCase());
  return i === -1 ? SIZE_ORDER.length : i;
}

export function sortSizeStocks<T extends { size: string }>(cells: T[]): T[] {
  // Stable sort: known sizes by canonical rank, unknown sizes keep input order after them.
  return cells
    .map((cell, idx) => ({ cell, idx }))
    .sort((a, b) => sizeRank(a.cell.size) - sizeRank(b.cell.size) || a.idx - b.idx)
    .map((x) => x.cell);
}
