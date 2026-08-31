import { describe, it, expect, beforeEach, vi } from "vitest";

const { findMany, groupBy } = vi.hoisted(() => ({ findMany: vi.fn(), groupBy: vi.fn() }));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { product: { findMany }, review: { groupBy } },
}));

import { getProducts, searchProducts } from "../products";

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  groupBy.mockReset().mockResolvedValue([]);
});

describe("storefront product readers exclude archived", () => {
  it("getProducts always filters archived:false", async () => {
    await getProducts({ designSlug: "cat" });
    expect(findMany.mock.calls[0][0].where.archived).toBe(false);
  });
  it("searchProducts filters archived:false", async () => {
    await searchProducts("white");
    expect(findMany.mock.calls[0][0].where.archived).toBe(false);
  });
});
