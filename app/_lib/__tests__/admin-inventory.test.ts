import { describe, it, expect, beforeEach, vi } from "vitest";

const { plainFindMany, designFindMany, productGroupBy, variantFindMany } = vi.hoisted(() => ({
  plainFindMany: vi.fn(),
  designFindMany: vi.fn(),
  productGroupBy: vi.fn(),
  variantFindMany: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    plainTshirtStock: { findMany: plainFindMany },
    dtfDesign: { findMany: designFindMany },
    product: { groupBy: productGroupBy },
    productVariant: { findMany: variantFindMany },
  },
}));

import { listPlainTshirtStock, listDtfDesigns, listInventoryStockGroups } from "../admin-inventory";

beforeEach(() => {
  plainFindMany.mockReset();
  designFindMany.mockReset();
  productGroupBy.mockReset();
  variantFindMany.mockReset();
});

describe("listInventoryStockGroups", () => {
  it("joins product identity to existing accessory balances and keeps unlinked blanks visible", async () => {
    plainFindMany.mockResolvedValueOnce([
      { id: "tee", color: "Black", colorSlug: "black", size: "M", quantity: 5, version: 1 },
      { id: "bag", color: "Natural Ivory", colorSlug: "natural-ivory", size: "One size", quantity: 22, version: 2 },
    ]);
    variantFindMany.mockResolvedValueOnce([{
      archived: false,
      color: "Natural Ivory", colorSlug: "natural-ivory", sizeStocks: [{ size: "One size" }],
      product: { id: "tote", name: "Canvas tote", archived: false, department: { slug: "accessories", slugHistory: [] } },
    }]);
    const result = await listInventoryStockGroups();
    expect(result.plain.map(row => row.id)).toEqual(["tee"]);
    expect(result.accessories).toMatchObject([{ id: "bag", quantity: 22, products: [{ id: "tote", name: "Canvas tote" }] }]);
    expect(result.shared).toEqual([]);
  });
});

describe("listPlainTshirtStock", () => {
  it("orders by colorSlug then size", async () => {
    plainFindMany.mockResolvedValueOnce([{ id: "ps1", color: "White", colorSlug: "white", size: "M", quantity: 3 }]);
    const rows = await listPlainTshirtStock();
    expect(plainFindMany).toHaveBeenCalledWith({ orderBy: [{ colorSlug: "asc" }, { size: "asc" }] });
    expect(rows).toEqual([{ id: "ps1", color: "White", colorSlug: "white", size: "M", quantity: 3 }]);
  });
});

describe("listDtfDesigns", () => {
  it("attaches a productCount per design, defaulting to 0 when unused", async () => {
    designFindMany.mockResolvedValueOnce([
      { id: "d1", name: "Cats", slug: "cats", quantity: 5 },
      { id: "d2", name: "Dinos", slug: "dinos", quantity: 0 },
    ]);
    productGroupBy.mockResolvedValueOnce([{ dtfDesignId: "d1", _count: { _all: 3 } }]);
    const rows = await listDtfDesigns();
    expect(productGroupBy).toHaveBeenCalledWith({
      by: ["dtfDesignId"],
      where: { dtfDesignId: { not: null }, archived: false },
      _count: { _all: true },
    });
    expect(rows).toEqual([
      { id: "d1", name: "Cats", slug: "cats", quantity: 5, productCount: 3 },
      { id: "d2", name: "Dinos", slug: "dinos", quantity: 0, productCount: 0 },
    ]);
  });
});
