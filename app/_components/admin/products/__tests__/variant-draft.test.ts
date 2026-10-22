import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { emptyVariant, familyColors, familyStockOptions, addOfferedSizes, type InventoryStockChoice } from "@/app/_components/admin/products/variant-draft";

// Regression guard for the RSC-boundary bug: emptyVariant() is called from the
// server component app/admin/products/new/page.tsx. Next.js forbids calling a
// function exported from a "use client" module on the server, so this factory
// MUST live in a non-client module.
describe("variant-draft", () => {
  it("emptyVariant() returns a blank draft with the standard sizes", () => {
    const v = emptyVariant();
    expect(v).toMatchObject({ color: "", colorSlug: "", sku: "", cardImages: [], detailImages: [] });
    expect(v.sizeStocks).toEqual([{ size: "S" }, { size: "M" }, { size: "L" }, { size: "XL" }]);
    expect(v.id).toBeUndefined();
  });

  it("variant-draft.ts is NOT a client module (server components import emptyVariant from it)", () => {
    const src = readFileSync("app/_components/admin/products/variant-draft.ts", "utf8");
    // A "use client" directive is a bare string statement at the start of a line
    // (not the words appearing inside a comment).
    expect(src).not.toMatch(/^\s*["']use client["']\s*;?\s*$/m);
  });

  it("the server new-product page imports emptyVariant from variant-draft, not the client editor", () => {
    const page = readFileSync("app/admin/products/new/page.tsx", "utf8");
    expect(page).toMatch(/from "@\/app\/_components\/admin\/products\/variant-draft"/);
    expect(page).not.toMatch(/emptyVariant.*from "@\/app\/_components\/admin\/products\/variant-editor"/);
  });
});

describe("family-scoped variant setup", () => {
  const rows: InventoryStockChoice[] = [
    { id: "regular-white-m", inventoryProductId: "regular", parentName: "Regular", color: "White", colorSlug: "white", size: "M", quantity: 3, stockGroup: "PLAIN_TSHIRT" },
    { id: "oversized-white-m", inventoryProductId: "oversized", parentName: "Oversized", color: "White", colorSlug: "white", size: "M", quantity: 8, stockGroup: "PLAIN_TSHIRT" },
    { id: "tote-ivory", inventoryProductId: "tote", parentName: "Tote", color: "Natural Ivory", colorSlug: "natural-ivory", size: '12" × 12" × 4"', quantity: 22, stockGroup: "ACCESSORY" },
  ];
  it("does not borrow colours or sizes from another style or accessory family", () => {
    expect(familyStockOptions(rows, "regular").map(row => row.id)).toEqual(["regular-white-m"]);
    expect(familyColors(rows, "tote")).toEqual([{ color: "Natural Ivory", colorSlug: "natural-ivory" }]);
    expect(familyColors(rows, null)).toEqual([]);
    expect(familyColors(rows, "empty-raglan")).toEqual([]);
  });
  it("can start without imposing apparel sizes on an accessory", () => {
    expect(emptyVariant([]).sizeStocks).toEqual([]);
    expect(emptyVariant(['12" × 12" × 4"']).sizeStocks).toEqual([{ size: '12" × 12" × 4"' }]);
  });
  it("adding family sizes preserves explicit shared and unavailable bindings", () => {
    const existing = [{ size: "M", plainTshirtStockId: "shared-other-parent" }, { size: "L", plainTshirtStockId: null }];
    expect(addOfferedSizes(existing, ["M", "L", "XL", "XL"])).toEqual([...existing, { size: "XL" }]);
    expect(existing).toEqual([{ size: "M", plainTshirtStockId: "shared-other-parent" }, { size: "L", plainTshirtStockId: null }]);
  });
});
