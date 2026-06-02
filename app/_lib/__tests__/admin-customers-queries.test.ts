import { describe, it, expect, beforeEach, vi } from "vitest";

const { userFindMany, userCount, orderGroupBy } = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  userCount: vi.fn(),
  orderGroupBy: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { user: { findMany: userFindMany, count: userCount }, order: { groupBy: orderGroupBy } },
}));

import { listCustomers } from "../admin-customers";

beforeEach(() => {
  userFindMany.mockReset();
  userCount.mockReset();
  orderGroupBy.mockReset();
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
});
