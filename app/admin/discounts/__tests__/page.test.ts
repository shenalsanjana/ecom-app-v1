import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ auth: vi.fn(), discounts: vi.fn(), redemptions: vi.fn(), products: vi.fn(), collections: vi.fn() }));
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin: mock.auth }));
vi.mock("@/app/_lib/prisma", () => ({ prisma: {
  discount: { findMany: mock.discounts }, discountRedemption: { groupBy: mock.redemptions },
  product: { findMany: mock.products }, design: { findMany: mock.collections },
} }));

import DiscountsPage from "../page";

const now = new Date("2026-10-21T12:00:00Z");
const discount = (overrides: Record<string, unknown> = {}) => ({
  id: "offer", version: 7, name: "Tote sale", code: "TOTE10", type: "PERCENTAGE", scope: "PRODUCTS", value: 1250,
  active: true, startsAt: null, expiresAt: null, usageLimit: 10, usedCount: 2, minimumOrder: 100000, maximumDiscount: 50000,
  products: [{ productId: "tote" }], categories: [], ...overrides,
});
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  mock.auth.mockResolvedValue({ user: { id: "admin" } }); mock.discounts.mockResolvedValue([discount()]);
  mock.products.mockResolvedValue([{ id: "tote", name: "Canvas tote" }]);
  mock.collections.mockResolvedValue([{ slug: "bags", name: "Bags", department: { name: "Accessories" } }]);
  mock.redemptions.mockResolvedValueOnce([
    { discountId: "offer", _sum: { amount: 40000 }, _count: { _all: 2 } },
    { discountId: null, _sum: { amount: 10000 }, _count: { _all: 1 } },
  ]).mockResolvedValueOnce([{ discountId: "offer", _count: { _all: 1 } }, { discountId: null, _count: { _all: 1 } }]);
});
afterEach(() => vi.useRealTimers());

describe("admin discount dashboard", () => {
  it("checks admin access before reading offers, history or products", async () => {
    mock.auth.mockRejectedValue(new Error("denied"));
    await expect(DiscountsPage()).rejects.toThrow("denied");
    for (const query of [mock.discounts, mock.redemptions, mock.products, mock.collections]) expect(query).not.toHaveBeenCalled();
  });

  it("shows saved usage and paid orders while keeping deleted offers in historical totals", async () => {
    const page = await DiscountsPage();
    expect(page.props.rows).toEqual([expect.objectContaining({ id: "offer", version: 7, value: 12.5, minimumOrder: 1000, maximumDiscount: 500, usedCount: 2, savings: 400, paidOrders: 1, productIds: ["tote"] })]);
    expect(page.props.totals).toEqual({ active: 1, uses: 3, savings: 500, paid: 2 });
    expect(page.props.categories).toEqual([{ id: "bags", name: "Accessories / Bags" }]);
    expect(mock.redemptions).toHaveBeenLastCalledWith(expect.objectContaining({ where: { order: { paymentStatus: { in: ["PAID", "COD_COLLECTED"] } } } }));
  });

  it("counts only offers currently enabled, within schedule and below their usage limit", async () => {
    mock.discounts.mockResolvedValue([
      discount({ startsAt: now }), discount({ id: "disabled", active: false }),
      discount({ id: "scheduled", startsAt: new Date(now.getTime() + 1) }),
      discount({ id: "expired", expiresAt: now }), discount({ id: "exhausted", usedCount: 10 }),
    ]);
    expect((await DiscountsPage()).props.totals.active).toBe(1);
  });
});
