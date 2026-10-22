import type { StockMode } from "./stock-policy";
// Pure cart-vs-inventory validation. No DB — the caller supplies a variant map
// plus the two raw-material stock maps. Kept separate from the "use server"
// action file so it can be unit-tested and so the action can import a
// non-async helper.
import { stockForSize, type PlainStockMap, type DesignStockMap } from "@/app/_lib/variants";

export type ValidatableItem = {
  variantId: string;
  size: string | null;
  name: string;
  quantity: number;
};

export type VariantStock = {
  stockMode?: StockMode;
  colorSlug: string;
  dtfDesignId: string | null;
  sizes: { size: string; plainTshirtStockId?: string | null }[]; // offered sizes; quantity lives only on the shared blank
};

export function validateCartItems(
  items: ValidatableItem[],
  variantMap: Map<string, VariantStock>,
  plainStock: PlainStockMap,
  designStock: DesignStockMap,
): string | null {
  for (const item of items) {
    const v = variantMap.get(item.variantId);
    if (!v) return `Unknown item "${item.name}"`;
    const sizes = v.sizes.map((s) => s.size);
    if (sizes.length === 0) return `Stock is not configured for "${item.name}"`;
    if (sizes.length > 0) {
      if (!item.size) return `Please select a size for "${item.name}"`;
      if (!sizes.includes(item.size)) return `Size "${item.size}" is not available for "${item.name}"`;
      const cell = v.sizes.find(s => s.size === item.size)!;
      const available = stockForSize(v.colorSlug, item.size, v.dtfDesignId, plainStock, designStock, cell.plainTshirtStockId, v.stockMode);
      if (available < item.quantity) return `Insufficient stock for "${item.name}"`;
    }
  }
  return null;
}
