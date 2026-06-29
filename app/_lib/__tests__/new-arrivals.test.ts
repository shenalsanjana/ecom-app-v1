import { describe, it, expect, beforeEach, vi } from "vitest";

// Make unstable_cache a passthrough so the wrapped reader runs its inner fn directly.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const { findMany, groupBy } = vi.hoisted(() => ({
  findMany: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { product: { findMany }, review: { groupBy } },
}));

import { getNewArrivals, getFeaturedProducts } from "../products";

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  groupBy.mockReset().mockResolvedValue([]);
});

describe("getNewArrivals", () => {
  it("orders by id descending, newest-first", async () => {
    await getNewArrivals();
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ id: "desc" });
  });

  it("excludes archived but includes all products regardless of id", async () => {
    await getNewArrivals();
    const where = findMany.mock.calls[0][0].where;
    expect(where.archived).toBe(false);
    // Must NOT filter by id prefix — admin-created products have slug ids
    // (e.g. "oversized-bear-tee"), not "p1"/"p2" seed ids.
    expect(where.id).toBeUndefined();
  });

  it("defaults to 6 items and respects an explicit limit", async () => {
    await getNewArrivals();
    expect(findMany.mock.calls[0][0].take).toBe(6);
    findMany.mockClear();
    await getNewArrivals(3);
    expect(findMany.mock.calls[0][0].take).toBe(3);
  });
});

describe("getFeaturedProducts", () => {
  it("excludes archived but includes all products regardless of id", async () => {
    await getFeaturedProducts();
    const where = findMany.mock.calls[0][0].where;
    expect(where.archived).toBe(false);
    expect(where.id).toBeUndefined();
  });
});
