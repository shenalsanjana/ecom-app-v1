import { describe, it, expect } from "vitest";
import {
  effectivePrice,
  effectiveOriginalPrice,
  variantInStock,
  productInStock,
  availableSizes,
  stockForSize,
  resolveDefaultVariant,
  pickVariantBySlug,
} from "../variants";

describe("effectivePrice", () => {
  it("uses the variant override when present", () => {
    expect(effectivePrice({ price: 2490 }, { price: 2190 })).toBe(2490);
  });
  it("falls back to the product base price when override is null", () => {
    expect(effectivePrice({ price: null }, { price: 2190 })).toBe(2190);
  });
});

describe("effectiveOriginalPrice", () => {
  it("prefers the variant override, else the product value, else null", () => {
    expect(effectiveOriginalPrice({ originalPrice: 2990 }, { originalPrice: 2790 })).toBe(2990);
    expect(effectiveOriginalPrice({ originalPrice: null }, { originalPrice: 2790 })).toBe(2790);
    expect(effectiveOriginalPrice({ originalPrice: null }, { originalPrice: null })).toBeNull();
  });
});

describe("stock helpers", () => {
  const grid = [
    { size: "S", stock: 0 },
    { size: "M", stock: 4 },
    { size: "L", stock: 0 },
  ];
  it("variantInStock is true when any cell > 0", () => {
    expect(variantInStock(grid)).toBe(true);
    expect(variantInStock([{ size: "S", stock: 0 }])).toBe(false);
  });
  it("availableSizes returns only sizes with stock", () => {
    expect(availableSizes(grid)).toEqual(["M"]);
  });
  it("stockForSize returns the cell count, or 0 when absent", () => {
    expect(stockForSize(grid, "M")).toBe(4);
    expect(stockForSize(grid, "XL")).toBe(0);
  });
  it("productInStock is true when any variant has stock", () => {
    expect(productInStock([{ sizeStocks: [{ size: "S", stock: 0 }] }, { sizeStocks: grid }])).toBe(true);
    expect(productInStock([{ sizeStocks: [{ size: "S", stock: 0 }] }])).toBe(false);
  });
});

describe("resolveDefaultVariant", () => {
  it("returns the lowest sortOrder among non-archived variants", () => {
    const v = resolveDefaultVariant([
      { colorSlug: "white", sortOrder: 2, archived: false },
      { colorSlug: "pink", sortOrder: 0, archived: false },
      { colorSlug: "ivory", sortOrder: 1, archived: false },
    ]);
    expect(v?.colorSlug).toBe("pink");
  });
  it("skips archived variants and returns null when none are active", () => {
    expect(
      resolveDefaultVariant([{ colorSlug: "white", sortOrder: 0, archived: true }])
    ).toBeNull();
  });
});

describe("pickVariantBySlug", () => {
  const vs = [{ colorSlug: "white" }, { colorSlug: "ivory" }];
  it("finds by slug, returns undefined for unknown or missing slug", () => {
    expect(pickVariantBySlug(vs, "ivory")?.colorSlug).toBe("ivory");
    expect(pickVariantBySlug(vs, "green")).toBeUndefined();
    expect(pickVariantBySlug(vs, undefined)).toBeUndefined();
  });
});
