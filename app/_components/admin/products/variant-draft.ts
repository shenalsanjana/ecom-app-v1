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
  sizeStocks: { size: string; stock: string }[];
};

export const STD_SIZES = ["S", "M", "L", "XL"];

export function emptyVariant(): VariantDraft {
  return {
    color: "", colorSlug: "", swatchHex: "", sku: "", price: "", originalPrice: "",
    cardImages: [], detailImages: [],
    sizeStocks: STD_SIZES.map((size) => ({ size, stock: "0" })),
  };
}
