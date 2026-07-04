import { describe, it, expect } from "vitest";
import { validateCartItems, type VariantStock } from "@/app/_lib/order-validation";

const grid = (): Map<string, VariantStock> =>
  new Map([
    ["v-white", { sizeStocks: [{ size: "S", stock: 0 }, { size: "M", stock: 3 }] }],
    ["v-pink", { sizeStocks: [{ size: "M", stock: 5 }] }],
  ]);

describe("validateCartItems", () => {
  it("passes when the size cell has enough stock", () => {
    expect(validateCartItems([{ variantId: "v-white", size: "M", name: "Tee", quantity: 2 }], grid())).toBeNull();
  });
  it("rejects an unknown variant", () => {
    expect(validateCartItems([{ variantId: "v-x", size: "M", name: "Tee", quantity: 1 }], grid())).toMatch(/Unknown item/);
  });
  it("requires a size when the variant offers sizes", () => {
    expect(validateCartItems([{ variantId: "v-white", size: null, name: "Tee", quantity: 1 }], grid())).toMatch(/select a size/);
  });
  it("rejects a size the variant does not offer", () => {
    expect(validateCartItems([{ variantId: "v-pink", size: "S", name: "Tee", quantity: 1 }], grid())).toMatch(/not available/);
  });
  it("rejects when requested quantity exceeds the cell stock", () => {
    expect(validateCartItems([{ variantId: "v-white", size: "M", name: "Tee", quantity: 4 }], grid())).toMatch(/Insufficient stock/);
    expect(validateCartItems([{ variantId: "v-white", size: "S", name: "Tee", quantity: 1 }], grid())).toMatch(/Insufficient stock/);
  });
});
