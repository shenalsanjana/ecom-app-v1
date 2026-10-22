import { describe, expect, it } from "vitest";
import { groupPosProducts, matchesPosSearch } from "../pos-catalogue";
import type { PosProduct } from "../pos";

const option = (overrides: Partial<PosProduct> = {}): PosProduct => ({
  productId: "shirt", categoryId: "shirts", categoryName: "T-Shirts", name: "Bear Shirt",
  sizeStockId: "blue-m", sku: "DB001", color: "Blue", size: "M", price: 200000,
  available: 5, image: null, ...overrides,
});

describe("POS product catalogue", () => {
  it("shows one product for all its colours and sizes without losing options beyond 60", () => {
    const options = Array.from({ length: 80 }, (_, index) => option({ sizeStockId: `size-${index}`, sku: `DB${index}` }));
    const products = groupPosProducts(options);
    expect(products).toHaveLength(1);
    expect(products[0].options).toHaveLength(80);
    expect(products[0]).toMatchObject({ id: "shirt", categoryId: "shirts", categoryName: "T-Shirts" });
  });
  it("keeps different products with the same name separate and sorts the catalogue", () => {
    const products = groupPosProducts([option(), option({ productId: "bag", name: "Canvas Bag", categoryId: "bags" }),
      option({ productId: "another-shirt" })]);
    expect(products.map(product => product.id)).toEqual(["shirt", "another-shirt", "bag"]);
  });
  it("finds names, categories, sizes and exact scanned SKUs across all options", () => {
    const [product] = groupPosProducts([option(), option({ sizeStockId: "pink-l", sku: "DB999", color: "Pink", size: "L" })]);
    for (const query of ["bear", "t-shirts", "  DB999  ", "bear pink", "blue m"]) expect(matchesPosSearch(product, query)).toBe(true);
    expect(matchesPosSearch(product, "pink DB001")).toBe(false);
    expect(matchesPosSearch(product, "pouch")).toBe(false);
    expect(product.options).toHaveLength(2);
  });
});
