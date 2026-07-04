import { describe, it, expect, beforeEach, vi } from "vitest";

const { productFindMany, productCount, productFindUnique, categoryFindMany } = vi.hoisted(() => ({
  productFindMany: vi.fn(),
  productCount: vi.fn(),
  productFindUnique: vi.fn(),
  categoryFindMany: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    product: { findMany: productFindMany, count: productCount, findUnique: productFindUnique },
    category: { findMany: categoryFindMany },
  },
}));

import { listProducts, getProduct, listCategories } from "../admin-products";

beforeEach(() => {
  productFindMany.mockReset();
  productCount.mockReset();
  productFindUnique.mockReset();
  categoryFindMany.mockReset();
});

describe("listProducts", () => {
  it("paginates and returns rows + total", async () => {
    productFindMany.mockResolvedValueOnce([{ id: "cat-white" }]);
    productCount.mockResolvedValueOnce(42);
    const res = await listProducts({ tab: "low-stock", page: 2, pageSize: 25 });
    const lowStockWhere = { archived: false, variants: { some: { sizeStocks: { some: { stock: { lte: 5 } } } } } };
    expect(productCount).toHaveBeenCalledWith({ where: lowStockWhere });
    const arg = productFindMany.mock.calls[0][0];
    expect(arg.where).toEqual(lowStockWhere);
    expect(arg.take).toBe(25);
    expect(arg.skip).toBe(25);
    expect(arg.orderBy).toEqual({ name: "asc" });
    expect(arg.include._count.select.variants).toBe(true);
    expect(res).toEqual({ rows: [{ id: "cat-white" }], total: 42 });
  });

  it("clamps pageSize to 200 and floors page at 1 (skip 0)", async () => {
    productFindMany.mockResolvedValueOnce([]);
    productCount.mockResolvedValueOnce(0);
    await listProducts({ tab: "all", page: 0, pageSize: 300 });
    const arg = productFindMany.mock.calls[0][0];
    expect(arg.take).toBe(200);
    expect(arg.skip).toBe(0);
  });
});

describe("getProduct", () => {
  it("includes ordered variants with images and size stock, plus category", async () => {
    productFindUnique.mockResolvedValueOnce({ id: "cat-white" });
    await getProduct("cat-white");
    const arg = productFindUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "cat-white" });
    expect(arg.include.category).toBe(true);
    expect(arg.include.variants.where).toEqual({ archived: false });
    expect(arg.include.variants.orderBy).toEqual({ sortOrder: "asc" });
    expect(arg.include.variants.include.images.orderBy).toEqual({ sortOrder: "asc" });
    expect(arg.include.variants.include.sizeStocks.orderBy).toEqual({ size: "asc" });
  });
});

describe("listCategories", () => {
  it("returns categories ordered by name", async () => {
    categoryFindMany.mockResolvedValueOnce([{ slug: "cat", name: "Cat" }]);
    const res = await listCategories();
    expect(categoryFindMany).toHaveBeenCalledWith({ orderBy: { name: "asc" } });
    expect(res).toEqual([{ slug: "cat", name: "Cat" }]);
  });
});
