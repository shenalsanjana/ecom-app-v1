import { describe, it, expect, beforeEach, vi } from "vitest";

const { orderCount, plainStockCount, dtfDesignCount } = vi.hoisted(() => ({
  orderCount: vi.fn(),
  plainStockCount: vi.fn(),
  dtfDesignCount: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: { count: orderCount },
    plainTshirtStock: { count: plainStockCount },
    dtfDesign: { count: dtfDesignCount },
  },
}));

const FROZEN_TODAY = new Date("2026-05-28T00:00:00.000Z");
vi.mock("@/app/_lib/time", () => ({
  startOfTodaySLT: () => FROZEN_TODAY,
}));

import { getDashboardKpis } from "../admin-kpis";
import { LOW_STOCK_THRESHOLD } from "@/app/_lib/admin-products";

beforeEach(() => {
  orderCount.mockReset();
  plainStockCount.mockReset();
  dtfDesignCount.mockReset();
});

describe("getDashboardKpis", () => {
  it("queries orders-to-confirm with status=PENDING", async () => {
    orderCount.mockResolvedValueOnce(5).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    plainStockCount.mockResolvedValueOnce(0);
    dtfDesignCount.mockResolvedValueOnce(0);

    const result = await getDashboardKpis();

    expect(orderCount).toHaveBeenNthCalledWith(1, { where: { status: "PENDING" } });
    expect(result.ordersToConfirm).toBe(5);
  });

  it("queries orders-to-dispatch with status=CONFIRMED and courierBookedAt=null", async () => {
    orderCount.mockResolvedValueOnce(0).mockResolvedValueOnce(7).mockResolvedValueOnce(0);
    plainStockCount.mockResolvedValueOnce(0);
    dtfDesignCount.mockResolvedValueOnce(0);

    const result = await getDashboardKpis();

    expect(orderCount).toHaveBeenNthCalledWith(2, {
      where: { status: "CONFIRMED", courierBookedAt: null },
    });
    expect(result.ordersToDispatch).toBe(7);
  });

  it("queries today's orders using startOfTodaySLT as the gte boundary", async () => {
    orderCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(12);
    plainStockCount.mockResolvedValueOnce(0);
    dtfDesignCount.mockResolvedValueOnce(0);

    const result = await getDashboardKpis();

    expect(orderCount).toHaveBeenNthCalledWith(3, {
      where: { createdAt: { gte: FROZEN_TODAY } },
    });
    expect(result.todaysOrders).toBe(12);
  });

  it("sums low-stock counts from both raw-material pools", async () => {
    orderCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    plainStockCount.mockResolvedValueOnce(2);
    dtfDesignCount.mockResolvedValueOnce(1);

    const result = await getDashboardKpis();

    expect(plainStockCount).toHaveBeenCalledWith({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } } });
    expect(dtfDesignCount).toHaveBeenCalledWith({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } } });
    expect(result.lowStock).toBe(3);
  });

  it("returns all four KPIs in the expected shape", async () => {
    orderCount.mockResolvedValueOnce(5).mockResolvedValueOnce(7).mockResolvedValueOnce(12);
    plainStockCount.mockResolvedValueOnce(2);
    dtfDesignCount.mockResolvedValueOnce(1);

    const result = await getDashboardKpis();

    expect(result).toEqual({
      ordersToConfirm: 5,
      ordersToDispatch: 7,
      todaysOrders: 12,
      lowStock: 3,
    });
  });
});
