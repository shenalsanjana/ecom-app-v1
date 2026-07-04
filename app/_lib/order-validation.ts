// Pure cart-vs-inventory validation. No DB — the caller supplies a variant map.
// Kept separate from the "use server" action file so it can be unit-tested and
// so the action can import a non-async helper.
export type ValidatableItem = {
  variantId: string;
  size: string | null;
  name: string;
  quantity: number;
};

export type VariantStock = { sizeStocks: { size: string; stock: number }[] };

export function validateCartItems(
  items: ValidatableItem[],
  variantMap: Map<string, VariantStock>,
): string | null {
  for (const item of items) {
    const v = variantMap.get(item.variantId);
    if (!v) return `Unknown item "${item.name}"`;
    const sizes = v.sizeStocks.map((s) => s.size);
    if (sizes.length > 0) {
      if (!item.size) return `Please select a size for "${item.name}"`;
      const cell = v.sizeStocks.find((s) => s.size === item.size);
      if (!cell) return `Size "${item.size}" is not available for "${item.name}"`;
      if (cell.stock < item.quantity) return `Insufficient stock for "${item.name}"`;
    }
  }
  return null;
}
