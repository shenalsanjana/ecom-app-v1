import { describe, it, expect } from "vitest";
import { validateCartItems, type VariantStock } from "@/app/_lib/order-validation";
import { buildPlainStockMap, buildDesignStockMap } from "@/app/_lib/variants";

const variantMap = (): Map<string, VariantStock> =>
  new Map([
    ["v-white", { colorSlug: "white", dtfDesignId: "d-cats", sizes: [{ size: "S" }, { size: "M" }] }],
    ["v-pink", { colorSlug: "pink", dtfDesignId: "d-cats", sizes: [{ size: "M" }] }],
    ["v-no-design", { colorSlug: "white", dtfDesignId: null, sizes: [{ size: "M" }] }],
  ]);

const plainStock = () => buildPlainStockMap([
  { id: "ps1", colorSlug: "white", size: "S", quantity: 0 },
  { id: "ps2", colorSlug: "white", size: "M", quantity: 3 },
  { id: "ps3", colorSlug: "pink", size: "M", quantity: 5 },
]);
const designStock = () => buildDesignStockMap([{ id: "d-cats", quantity: 10 }]);

describe("validateCartItems", () => {
  it("passes when both pools have enough stock", () => {
    expect(validateCartItems([{ variantId: "v-white", size: "M", name: "Tee", quantity: 2 }], variantMap(), plainStock(), designStock())).toBeNull();
  });
  it("rejects an unknown variant", () => {
    expect(validateCartItems([{ variantId: "v-x", size: "M", name: "Tee", quantity: 1 }], variantMap(), plainStock(), designStock())).toMatch(/Unknown item/);
  });
  it("requires a size when the variant offers sizes", () => {
    expect(validateCartItems([{ variantId: "v-white", size: null, name: "Tee", quantity: 1 }], variantMap(), plainStock(), designStock())).toMatch(/select a size/);
  });
  it("rejects a size the variant does not offer", () => {
    expect(validateCartItems([{ variantId: "v-pink", size: "S", name: "Tee", quantity: 1 }], variantMap(), plainStock(), designStock())).toMatch(/not available/);
  });
  it("rejects when requested quantity exceeds the plain-tee pool", () => {
    expect(validateCartItems([{ variantId: "v-white", size: "M", name: "Tee", quantity: 4 }], variantMap(), plainStock(), designStock())).toMatch(/Insufficient stock/);
  });
  it("rejects a size with zero plain-tee stock", () => {
    expect(validateCartItems([{ variantId: "v-white", size: "S", name: "Tee", quantity: 1 }], variantMap(), plainStock(), designStock())).toMatch(/Insufficient stock/);
  });
  it("rejects when the product has no design assigned (null dtfDesignId)", () => {
    expect(validateCartItems([{ variantId: "v-no-design", size: "M", name: "Tee", quantity: 1 }], variantMap(), plainStock(), designStock())).toMatch(/Insufficient stock/);
  });
  it("rejects when the design pool is empty even though the plain-tee pool has stock", () => {
    const emptyDesigns = buildDesignStockMap([{ id: "d-cats", quantity: 0 }]);
    expect(validateCartItems([{ variantId: "v-white", size: "M", name: "Tee", quantity: 1 }], variantMap(), plainStock(), emptyDesigns)).toMatch(/Insufficient stock/);
  });
});
