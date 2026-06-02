import { describe, it, expect, beforeEach, vi } from "vitest";

const { userFindMany, userCount, userFindUnique, orderGroupBy, orderAggregate } = vi.hoisted(() => ({
  userFindMany: vi.fn(), userCount: vi.fn(), userFindUnique: vi.fn(),
  orderGroupBy: vi.fn(), orderAggregate: vi.fn(),
}));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    user: { findMany: userFindMany, count: userCount, findUnique: userFindUnique },
    order: { groupBy: orderGroupBy, aggregate: orderAggregate },
  },
}));

import { listCustomers, getCustomer } from "../admin-customers";

beforeEach(() => {
  userFindMany.mockReset();
  userCount.mockReset();
  orderGroupBy.mockReset();
  userFindUnique.mockReset(); orderAggregate.mockReset();
});

describe("listCustomers", () => {
  it("paginates, aggregates non-cancelled order count + spend, returns rows + total", async () => {
    userFindMany.mockResolvedValueOnce([
      { id: "u1", name: "Nimali", email: "n@x.test", role: "CUSTOMER", createdAt: new Date() },
      { id: "u2", name: "Ravi", email: "r@x.test", role: "CUSTOMER", createdAt: new Date() },
    ]);
    userCount.mockResolvedValueOnce(2);
    orderGroupBy.mockResolvedValueOnce([
      { userId: "u1", _count: { _all: 7 }, _sum: { total: 48300 } },
    ]);

    const res = await listCustomers({ role: "customers", page: 1, pageSize: 25 });

    // user query: select excludes passwordHash, paginates, ordered
    const uArg = userFindMany.mock.calls[0][0];
    expect(uArg.where).toEqual({ role: "CUSTOMER" });
    expect(uArg.take).toBe(25);
    expect(uArg.skip).toBe(0);
    expect(uArg.select.passwordHash).toBeUndefined();

    // aggregate query scoped to these users, excluding cancelled
    const gArg = orderGroupBy.mock.calls[0][0];
    expect(gArg.by).toEqual(["userId"]);
    expect(gArg.where).toEqual({ userId: { in: ["u1", "u2"] }, status: { not: "CANCELLED" } });

    expect(res.total).toBe(2);
    expect(res.rows[0]).toMatchObject({ id: "u1", orderCount: 7, totalSpent: 48300 });
    expect(res.rows[1]).toMatchObject({ id: "u2", orderCount: 0, totalSpent: 0 });
  });

  it("skips the aggregate query and returns empty when no users match", async () => {
    userFindMany.mockResolvedValueOnce([]);
    userCount.mockResolvedValueOnce(0);
    const res = await listCustomers({ role: "customers", page: 1 });
    expect(orderGroupBy).not.toHaveBeenCalled();
    expect(res).toEqual({ rows: [], total: 0 });
  });

  it("computes skip from page (page 3, size 10 → skip 20)", async () => {
    userFindMany.mockResolvedValueOnce([]);
    userCount.mockResolvedValueOnce(0);
    await listCustomers({ role: "customers", page: 3, pageSize: 10 });
    expect(userFindMany.mock.calls[0][0].skip).toBe(20);
  });
});

describe("getCustomer", () => {
  it("returns null when the user does not exist", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    expect(await getCustomer("nope")).toBeNull();
  });

  it("returns user (no passwordHash) + addresses + recent orders + wishlist count + stats", async () => {
    userFindUnique.mockResolvedValueOnce({
      id: "u1", name: "Nimali", email: "n@x.test", role: "CUSTOMER", createdAt: new Date(),
      addresses: [{ id: "a1" }], orders: [{ id: "o1" }], _count: { wishlist: 3 },
    });
    orderAggregate.mockResolvedValueOnce({ _count: { _all: 7 }, _sum: { total: 48300 }, _max: { createdAt: new Date("2026-06-02") } });

    const res = await getCustomer("u1");

    const uArg = userFindUnique.mock.calls[0][0];
    expect(uArg.where).toEqual({ id: "u1" });
    expect(uArg.select.passwordHash).toBeUndefined();
    expect(uArg.select.orders.take).toBe(10);
    expect(uArg.select.orders.orderBy).toEqual({ createdAt: "desc" });
    expect(uArg.select._count.select.wishlist).toBe(true);

    const aArg = orderAggregate.mock.calls[0][0];
    expect(aArg.where).toEqual({ userId: "u1", status: { not: "CANCELLED" } });

    expect(res).toMatchObject({
      id: "u1", wishlistCount: 3,
      stats: { orderCount: 7, totalSpent: 48300 },
    });
    expect(res!.stats.lastOrderAt).toEqual(new Date("2026-06-02"));
  });

  it("returns zero stats when the customer has no non-cancelled orders", async () => {
    userFindUnique.mockResolvedValueOnce({
      id: "u3", name: "New", email: "new@x.test", role: "CUSTOMER", createdAt: new Date(),
      addresses: [], orders: [], _count: { wishlist: 0 },
    });
    orderAggregate.mockResolvedValueOnce({ _count: { _all: 0 }, _sum: { total: null }, _max: { createdAt: null } });
    const res = await getCustomer("u3");
    expect(res!.stats).toEqual({ orderCount: 0, totalSpent: 0, lastOrderAt: null });
    expect(res!.wishlistCount).toBe(0);
  });
});
