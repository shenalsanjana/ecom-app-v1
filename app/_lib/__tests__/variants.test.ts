import { describe, it, expect } from "vitest";
import {
  effectivePrice,
  effectiveOriginalPrice,
  plainStockKey,
  buildPlainStockMap,
  buildDesignStockMap,
  stockForSize,
  designAvailable,
  availableSizes,
  variantInStock,
  productInStock,
  resolveDefaultVariant,
  pickVariantBySlug,
  sortSizeStocks,
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

describe("plainStockKey / buildPlainStockMap / buildDesignStockMap", () => {
  it("keys plain stock by colorSlug::size", () => {
    expect(plainStockKey("white", "M")).toBe("white::M");
  });
  it("builds a map from rows keyed by colorSlug::size, carrying id + quantity", () => {
    const map = buildPlainStockMap([{ id: "ps1", colorSlug: "white", size: "M", quantity: 4 }]);
    expect(map.get("white::M")).toEqual({ id: "ps1", quantity: 4 });
  });
  it("builds a design map keyed by id", () => {
    const map = buildDesignStockMap([{ id: "d1", quantity: 3 }]);
    expect(map.get("d1")).toBe(3);
  });
});

describe("stockForSize (two-pool derived quantity)", () => {
  const plainStock = buildPlainStockMap([
    { id: "ps-white-s", colorSlug: "white", size: "S", quantity: 0 },
    { id: "ps-white-m", colorSlug: "white", size: "M", quantity: 4 },
  ]);
  const designStock = buildDesignStockMap([{ id: "d-cats", quantity: 2 }]);

  it("is zero when the design pool is missing or zero", () => {
    expect(stockForSize("white", "M", null, plainStock, designStock)).toBe(0);
    expect(stockForSize("white", "M", "unknown-design", plainStock, designStock)).toBe(0);
    expect(stockForSize("white", "M", "d-cats", plainStock, buildDesignStockMap([{ id: "d-cats", quantity: 0 }]))).toBe(0);
  });
  it("is zero when the plain pool is missing or zero", () => {
    expect(stockForSize("white", "S", "d-cats", plainStock, designStock)).toBe(0);
    expect(stockForSize("white", "XL", "d-cats", plainStock, designStock)).toBe(0);
  });
  it("is the minimum of the two pools when both are available", () => {
    expect(stockForSize("white", "M", "d-cats", plainStock, designStock)).toBe(2); // min(4, 2)
  });
});

describe("designAvailable", () => {
  const designStock = buildDesignStockMap([{ id: "d-cats", quantity: 2 }, { id: "d-empty", quantity: 0 }]);
  it("false for null, unknown, or zero-quantity design ids", () => {
    expect(designAvailable(null, designStock)).toBe(false);
    expect(designAvailable("unknown", designStock)).toBe(false);
    expect(designAvailable("d-empty", designStock)).toBe(false);
  });
  it("true when the design has quantity > 0", () => {
    expect(designAvailable("d-cats", designStock)).toBe(true);
  });
});

describe("availableSizes / variantInStock / productInStock (two-pool)", () => {
  const plainStock = buildPlainStockMap([
    { id: "ps1", colorSlug: "white", size: "S", quantity: 0 },
    { id: "ps2", colorSlug: "white", size: "M", quantity: 4 },
    { id: "ps3", colorSlug: "pink", size: "M", quantity: 3 },
  ]);
  const designStock = buildDesignStockMap([{ id: "d-cats", quantity: 2 }]);

  it("availableSizes returns only sizes with stock in both pools", () => {
    expect(availableSizes([{ size: "S" }, { size: "M" }], "white", "d-cats", plainStock, designStock)).toEqual(["M"]);
  });
  it("availableSizes is empty when the design is unavailable, regardless of plain stock", () => {
    expect(availableSizes([{ size: "M" }], "white", null, plainStock, designStock)).toEqual([]);
  });
  it("variantInStock is true iff at least one size clears both pools", () => {
    expect(variantInStock([{ size: "S" }, { size: "M" }], "white", "d-cats", plainStock, designStock)).toBe(true);
    expect(variantInStock([{ size: "S" }], "white", "d-cats", plainStock, designStock)).toBe(false);
  });
  it("productInStock is true iff any variant has an available size", () => {
    const variants = [
      { colorSlug: "white", sizes: [{ size: "S" }] },  // out of plain stock
      { colorSlug: "pink", sizes: [{ size: "M" }] },   // in stock
    ];
    expect(productInStock(variants, "d-cats", plainStock, designStock)).toBe(true);
    expect(productInStock([variants[0]], "d-cats", plainStock, designStock)).toBe(false);
  });
  it("productInStock is false for every variant when the design is unavailable", () => {
    const variants = [{ colorSlug: "pink", sizes: [{ size: "M" }] }];
    expect(productInStock(variants, null, plainStock, designStock)).toBe(false);
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

describe("sortSizeStocks", () => {
  it("orders known sizes S,M,L,XL regardless of input order", () => {
    const out = sortSizeStocks([
      { size: "XL", stock: 1 }, { size: "S", stock: 2 }, { size: "L", stock: 3 }, { size: "M", stock: 4 },
    ]);
    expect(out.map((c) => c.size)).toEqual(["S", "M", "L", "XL"]);
  });
  it("places unknown sizes after known ones, keeping their input order", () => {
    const out = sortSizeStocks([
      { size: "Custom-A", stock: 1 }, { size: "M", stock: 2 }, { size: "Custom-B", stock: 3 },
    ]);
    expect(out.map((c) => c.size)).toEqual(["M", "Custom-A", "Custom-B"]);
  });
  it("is case-insensitive on known sizes", () => {
    expect(sortSizeStocks([{ size: "xl", stock: 1 }, { size: "s", stock: 2 }]).map((c) => c.size)).toEqual(["s", "xl"]);
  });
});
