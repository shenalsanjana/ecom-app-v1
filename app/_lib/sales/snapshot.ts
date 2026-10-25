import { effectiveOriginalPrice } from "../variants";

export function salesItemSnapshot(product: { id: string; costPriceCents?: number | null; originalPrice?: number | null; designSlug?: string; design?: { name: string } | null },
  variant: { originalPrice?: number | null }, price: number) {
  const original = effectiveOriginalPrice({ originalPrice: variant.originalPrice ?? null }, { originalPrice: product.originalPrice ?? null });
  return {
    unitCostCents: product.costPriceCents ?? null,
    salesListPriceCents: Math.max(Math.round(price * 100), Math.round((original ?? price) * 100)),
    salesProductKey: product.id,
    salesCategoryKey: product.designSlug ?? "uncategorized",
    salesCategoryName: product.design?.name ?? product.designSlug ?? "Uncategorized",
  };
}
