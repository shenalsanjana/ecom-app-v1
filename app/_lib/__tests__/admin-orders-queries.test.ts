import { describe, it, expect, beforeEach, vi } from "vitest";

const { findMany, count, findUnique } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { order: { findMany, count, findUnique } },
}));

import { listOrders, getOrderDetail } from "../admin-orders";

beforeEach(() => {
  findMany.mockReset();
  count.mockReset();
  findUnique.mockReset();
});

describe("listOrders", () => {
  it("paginates with take/skip and returns rows + total", async () => {
    findMany.mockResolvedValueOnce([{ id: "o1" }]);
    count.mockResolvedValueOnce(42);

    const res = await listOrders({ tab: "needs-dispatch", page: 2, pageSize: 25 });

    expect(count).toHaveBeenCalledWith({ where: { status: "CONFIRMED", courierBookedAt: null } });
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ status: "CONFIRMED", courierBookedAt: null });
    expect(arg.take).toBe(25);
    expect(arg.skip).toBe(25);
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(res).toEqual({ rows: [{ id: "o1" }], total: 42 });
  });

  it("selects only the first two item snapshots plus the total item count", async () => {
    findMany.mockResolvedValueOnce([{ id: "o1" }]);
    count.mockResolvedValueOnce(1);

    await listOrders({ page: 1, pageSize: 25 });

    const arg = findMany.mock.calls[0][0];
    expect(arg.include.items).toEqual({
      take: 2,
      orderBy: { id: "asc" },
      select: { id: true, name: true, color: true, quantity: true },
    });
    expect(arg.include._count).toEqual({ select: { items: true } });
  });
});

describe("getOrderDetail", () => {
  it("includes items, variant size-stocks, user and notesLog", async () => {
    findUnique.mockResolvedValueOnce({ id: "o1" });
    const res = await getOrderDetail("o1");
    const arg = findUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "o1" });
    expect(arg.include.items.include.variant.select.sizeStocks.select.size).toBe(true);
    expect(arg.include.notesLog.orderBy).toEqual({ createdAt: "desc" });
    expect(res).toEqual({ id: "o1" });
  });
});
