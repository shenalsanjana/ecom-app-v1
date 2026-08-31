import { describe, it, expect, beforeEach, vi } from "vitest";

const { productFindMany, productCount, productFindUnique, designFindMany, plainFindMany, dtfDesignFindMany } = vi.hoisted(() => ({
  productFindMany: vi.fn(),
  productCount: vi.fn(),
  productFindUnique: vi.fn(),
  designFindMany: vi.fn(),
  plainFindMany: vi.fn(),
  dtfDesignFindMany: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    product: { findMany: productFindMany, count: productCount, findUnique: productFindUnique },
    design: { findMany: designFindMany },
    plainTshirtStock: { findMany: plainFindMany },
    dtfDesign: { findMany: dtfDesignFindMany },
  },
}));

import { listProducts, getProduct, listCategories, getLowStockProductIds, resolveProductWhere } from "../admin-products";

beforeEach(() => {
  productFindMany.mockReset();
  productCount.mockReset();
  productFindUnique.mockReset();
  designFindMany.mockReset();
  plainFindMany.mockReset().mockResolvedValue([]);
  dtfDesignFindMany.mockReset().mockResolvedValue([]);
});

describe("listProducts", () => {
  it("paginates and returns rows + total", async () => {
    productFindMany.mockResolvedValueOnce([{ id: "cat-white" }]);
    productCount.mockResolvedValueOnce(42);
    const res = await listProducts({ tab: "active", page: 2, pageSize: 25 });
    expect(productCount).toHaveBeenCalledWith({ where: { archived: false } });
    const arg = productFindMany.mock.calls[0][0];
    expect(arg.where).toEqual({ archived: false });
    expect(arg.take).toBe(25);
    expect(arg.skip).toBe(25);
    expect(arg.orderBy).toEqual({ name: "asc" });
    expect(arg.include.variants.where).toEqual({ archived: false });
    expect(arg.include._count.select.variants).toEqual({ where: { archived: false } });
    expect(res.rows).toEqual([{ id: "cat-white" }]);
    expect(res.total).toBe(42);
  });

  it("clamps pageSize to 200 and floors page at 1 (skip 0)", async () => {
    productFindMany.mockResolvedValueOnce([]);
    productCount.mockResolvedValueOnce(0);
    await listProducts({ tab: "all", page: 0, pageSize: 300 });
    const arg = productFindMany.mock.calls[0][0];
    expect(arg.take).toBe(200);
    expect(arg.skip).toBe(0);
  });

  it("on the low-stock tab, resolves affected product ids first and filters by them", async () => {
    plainFindMany.mockResolvedValueOnce([{ colorSlug: "white", size: "M" }]);
    productFindMany
      .mockResolvedValueOnce([ // the getLowStockProductIds() scan
        { id: "p1", dtfDesignId: null, variants: [{ colorSlug: "white", sizeStocks: [{ size: "M" }] }] },
        { id: "p2", dtfDesignId: null, variants: [{ colorSlug: "pink", sizeStocks: [{ size: "M" }] }] },
      ])
      .mockResolvedValueOnce([{ id: "p1" }]); // the paginated listProducts() query
    productCount.mockResolvedValueOnce(1);

    const res = await listProducts({ tab: "low-stock" });

    const listArg = productFindMany.mock.calls[1][0];
    expect(listArg.where).toEqual({ archived: false, id: { in: ["p1"] } });
    expect(res.rows).toEqual([{ id: "p1" }]);
  });
});

describe("getLowStockProductIds", () => {
  it("returns an empty list when neither pool has a low row", async () => {
    plainFindMany.mockResolvedValueOnce([]);
    dtfDesignFindMany.mockResolvedValueOnce([]);
    const ids = await getLowStockProductIds();
    expect(ids).toEqual([]);
    expect(productFindMany).not.toHaveBeenCalled();
  });

  it("flags a product whose design is low, and one whose offered color+size is low, but not an unaffected product", async () => {
    plainFindMany.mockResolvedValueOnce([{ colorSlug: "white", size: "M" }]);
    dtfDesignFindMany.mockResolvedValueOnce([{ id: "d-low" }]);
    productFindMany.mockResolvedValueOnce([
      { id: "p-design-low", dtfDesignId: "d-low", variants: [{ colorSlug: "pink", sizeStocks: [{ size: "L" }] }] },
      { id: "p-plain-low", dtfDesignId: "d-ok", variants: [{ colorSlug: "white", sizeStocks: [{ size: "M" }] }] },
      { id: "p-fine", dtfDesignId: "d-ok", variants: [{ colorSlug: "pink", sizeStocks: [{ size: "L" }] }] },
    ]);
    const ids = await getLowStockProductIds();
    expect(ids).toEqual(["p-design-low", "p-plain-low"]);
  });
});

describe("resolveProductWhere", () => {
  it("passes through non-low-stock tabs unchanged", async () => {
    const where = await resolveProductWhere({ tab: "active" });
    expect(where).toEqual({ archived: false });
    expect(plainFindMany).not.toHaveBeenCalled();
  });

  it("layers an id filter on for the low-stock tab", async () => {
    plainFindMany.mockResolvedValueOnce([{ colorSlug: "white", size: "M" }]);
    productFindMany.mockResolvedValueOnce([{ id: "p1", dtfDesignId: null, variants: [{ colorSlug: "white", sizeStocks: [{ size: "M" }] }] }]);
    const where = await resolveProductWhere({ tab: "low-stock" });
    expect(where).toEqual({ archived: false, id: { in: ["p1"] } });
  });
});

describe("getProduct", () => {
  it("includes ordered variants with images and size stock, plus design", async () => {
    productFindUnique.mockResolvedValueOnce({ id: "cat-white" });
    await getProduct("cat-white");
    const arg = productFindUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "cat-white" });
    expect(arg.include.design).toBe(true);
    expect(arg.include.variants.where).toEqual({ archived: false });
    expect(arg.include.variants.orderBy).toEqual({ sortOrder: "asc" });
    expect(arg.include.variants.include.images.orderBy).toEqual({ sortOrder: "asc" });
    expect(arg.include.variants.include.sizeStocks.orderBy).toEqual({ size: "asc" });
  });
});

describe("listCategories", () => {
  it("returns categories ordered by name", async () => {
    designFindMany.mockResolvedValueOnce([{ slug: "cat", name: "Cat" }]);
    const res = await listCategories();
    expect(designFindMany).toHaveBeenCalledWith({ orderBy: { name: "asc" } });
    expect(res).toEqual([{ slug: "cat", name: "Cat" }]);
  });
});
