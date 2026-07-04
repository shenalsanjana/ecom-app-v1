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

export function variantInStock(sizeStocks: SizeStock[]): boolean {
  return sizeStocks.some((s) => s.stock > 0);
}

export function productInStock(variants: { sizeStocks: SizeStock[] }[]): boolean {
  return variants.some((v) => variantInStock(v.sizeStocks));
}

export function availableSizes(sizeStocks: SizeStock[]): string[] {
  return sizeStocks.filter((s) => s.stock > 0).map((s) => s.size);
}

export function stockForSize(sizeStocks: SizeStock[], size: string): number {
  return sizeStocks.find((s) => s.size === size)?.stock ?? 0;
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
