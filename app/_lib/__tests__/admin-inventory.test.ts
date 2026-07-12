import { describe, it, expect, beforeEach, vi } from "vitest";

const { plainFindMany, designFindMany, productGroupBy } = vi.hoisted(() => ({
  plainFindMany: vi.fn(),
  designFindMany: vi.fn(),
  productGroupBy: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    plainTshirtStock: { findMany: plainFindMany },
    dtfDesign: { findMany: designFindMany },
    product: { groupBy: productGroupBy },
  },
}));

import { listPlainTshirtStock, listDtfDesigns } from "../admin-inventory";

beforeEach(() => {
  plainFindMany.mockReset();
  designFindMany.mockReset();
  productGroupBy.mockReset();
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
