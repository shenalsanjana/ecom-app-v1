import { describe, it, expect, beforeEach, vi } from "vitest";

const { orderCount, productCount } = vi.hoisted(() => ({
  orderCount: vi.fn(),
  productCount: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: { count: orderCount },
    product: { count: productCount },
  },
}));

const FROZEN_TODAY = new Date("2026-05-28T00:00:00.000Z");
vi.mock("@/app/_lib/time", () => ({
  startOfTodaySLT: () => FROZEN_TODAY,
}));

import { getDashboardKpis } from "../admin-kpis";

beforeEach(() => {
  orderCount.mockReset();
  productCount.mockReset();
});

describe("getDashboardKpis", () => {
  it("queries orders-to-confirm with status=PENDING", async () => {
    orderCount.mockResolvedValueOnce(5).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    productCount.mockResolvedValueOnce(0);

    const result = await getDashboardKpis();

    expect(orderCount).toHaveBeenNthCalledWith(1, { where: { status: "PENDING" } });
    expect(result.ordersToConfirm).toBe(5);
  });

  it("queries orders-to-dispatch with status=CONFIRMED and courierBookedAt=null", async () => {
    orderCount.mockResolvedValueOnce(0).mockResolvedValueOnce(7).mockResolvedValueOnce(0);
    productCount.mockResolvedValueOnce(0);

    const result = await getDashboardKpis();

    expect(orderCount).toHaveBeenNthCalledWith(2, {
      where: { status: "CONFIRMED", courierBookedAt: null },
    });
    expect(result.ordersToDispatch).toBe(7);
  });

  it("queries today's orders using startOfTodaySLT as the gte boundary", async () => {
    orderCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(12);
    productCount.mockResolvedValueOnce(0);

    const result = await getDashboardKpis();

    expect(orderCount).toHaveBeenNthCalledWith(3, {
      where: { createdAt: { gte: FROZEN_TODAY } },
    });
    expect(result.todaysOrders).toBe(12);
  });

  it("queries low-stock via variants whose size-stock cells are <=5", async () => {
    orderCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    productCount.mockResolvedValueOnce(2);

    const result = await getDashboardKpis();

    expect(productCount).toHaveBeenCalledWith({
      where: { variants: { some: { sizeStocks: { some: { stock: { lte: 5 } } } } } },
    });
    expect(result.lowStock).toBe(2);
  });

  it("returns all four KPIs in the expected shape", async () => {
    orderCount.mockResolvedValueOnce(5).mockResolvedValueOnce(7).mockResolvedValueOnce(12);
    productCount.mockResolvedValueOnce(2);

    const result = await getDashboardKpis();

    expect(result).toEqual({
      ordersToConfirm: 5,
      ordersToDispatch: 7,
      todaysOrders: 12,
      lowStock: 2,
    });
  });
});
