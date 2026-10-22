// Plain (non-"use client") module so the empty-variant factory can be called
// from BOTH server components (e.g. app/admin/products/new/page.tsx) and the
// client variant editor. `emptyVariant` used to live in variant-editor.tsx
// ("use client"); calling it from a server component throws in RSC
// ("Attempted to call emptyVariant() from the server"). Keeping the pure data
// factory here fixes that while the editor stays a client component.

export type VariantDraft = {
  id?: string;
  color: string;
  colorSlug: string;
  swatchHex: string;
  sku: string;
  price: string;         // "" => no override
  originalPrice: string; // "" => no override
  cardImages: string[];
  detailImages: string[];
  sizeStocks: { id?: string; sku?: string; size: string; plainTshirtStockId?: string | null }[];
};

export const STD_SIZES = ["S", "M", "L", "XL"];

export function emptyVariant(sizes: string[] = STD_SIZES): VariantDraft {
  return {
    color: "", colorSlug: "", swatchHex: "", sku: "", price: "", originalPrice: "",
    cardImages: [], detailImages: [],
    sizeStocks: sizes.map((size) => ({ size })),
  };
}

export type InventoryStockChoice = {
  id: string; inventoryProductId: string | null; parentName: string;
  color: string; colorSlug: string; size: string; quantity: number; stockGroup: string; section?: string | null;
};

export function familyStockOptions(rows: InventoryStockChoice[], parentId?: string | null) {
  return parentId ? rows.filter(row => row.inventoryProductId === parentId) : [];
}

export function familyColors(rows: InventoryStockChoice[], parentId?: string | null) {
  return [...new Map(familyStockOptions(rows, parentId).map(row => [row.colorSlug, { color: row.color, colorSlug: row.colorSlug }])).values()];
}

// Adding presets must retain deliberate shared bindings and unconfigured cells.
export function addOfferedSizes(current: VariantDraft["sizeStocks"], sizes: string[]): VariantDraft["sizeStocks"] {
  const added = new Set(current.map(cell => cell.size));
  return [...current.filter(cell => cell.size.trim()), ...sizes.flatMap(size => {
    if (!size.trim() || added.has(size)) return [];
    added.add(size); return [{ size }];
  })];
}
