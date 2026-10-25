import { describe, expect, it } from "vitest";
import { allocate, calculateSales, orderLines, type StatusSummary } from "../calculations";
import { order, refund } from "./fixtures";
import { salesRange } from "../range";
const now = new Date("2026-10-24T08:00:00Z"), range = salesRange({ period: "today" }, now);
const status = (): StatusSummary => ({ placed: 0, pending: 0, pendingCents: 0, failed: 0, cancelled: 0, deliveredPaid: 0, paymentReview: 0 });
describe("sales facts and allocation", () => {
  it("allocates every cent deterministically without multiplying totals across lines", () => {
    expect(allocate(101, [1, 1, 1])).toEqual([34, 34, 33]); expect(allocate(10, [0, 0])).toEqual([5, 5]); expect(allocate(0, [])).toEqual([]);
    expect(() => allocate(1, [])).toThrow(); expect(() => allocate(5, [-1])).toThrow();
  });
  it("counts each settled order once by payment date, excluding pending and cancelled orders", () => {
    const paid = order(), pos = order({ id: "o2", salesChannel: "POS", paymentMethod: "COD", paymentStatus: "COD_COLLECTED" });
    const result = calculateSales([paid, paid, pos, order({ id: "pending", paymentStatus: "COD_PENDING" }), order({ id: "cancelled", status: "CANCELLED" }), order({ id: "old", salesPaidAt: new Date("2026-10-23T08:00:00Z") })], [], range, status(), now);
    expect(result.totals).toMatchObject({ orders: 2, units: 4, grossCents: 480000, discountCents: 100000, netSalesCents: 380000, shippingCents: 70000, revenueCents: 450000, profitCents: 220000 });
    expect(result.channels.find(row => row.key === "POS")!.revenueCents).toBe(225000);
    expect(result.products[0].orders).toBe(2); expect(result.status.deliveredPaid).toBe(2); expect(result.daily[0].orders).toBe(2);
  });
  it("applies product/delivery refunds and recovered unit cost without subtracting cancelled sales twice", () => {
    const credit = refund(), cancelled = refund({ id: "r2", merchandiseCents: 20000, shippingCents: 0, order: { ...credit.order, status: "CANCELLED" } });
    const result = calculateSales([order()], [credit, credit, cancelled, refund({ id: "void", voidedAt: now })], range, status(), now);
    expect(result.totals).toMatchObject({ orders: 1, netSalesCents: 140000, shippingCents: 25000, revenueCents: 165000, refundCents: 80000, cancelledRefundCents: 20000, costCents: 80000, recoveredCostCents: 40000, profitCents: 100000 });
    expect(result.products[0]).toMatchObject({ netSalesCents: 140000, refundCents: 50000, returnedUnits: 1 });
  });
  it("records refunds on their own dates, including refunds of older orders", () => {
    const credit = refund({ items: [{ ...refund().items[0], returnedQuantity: 0 }], shippingCents: 0 });
    const result = calculateSales([], [credit], range, status(), now);
    expect(result.totals).toMatchObject({ orders: 0, revenueCents: -50000, netSalesCents: -50000, profitCents: -50000 });
  });
  it("leaves profit unavailable for unknown costs, while a known zero cost remains valid", () => {
    const paid = order(); paid.items[0].unitCostCents = null;
    const result = calculateSales([paid], [], range, status(), now);
    expect(result.totals.profitCents).toBeNull(); expect(result.totals.missingCostUnits).toBe(2); expect(result.quality.missingCosts).toHaveLength(1);
    paid.items[0].unitCostCents = 0; expect(calculateSales([paid], [], range, status(), now).totals.profitCents).toBe(190000);
    const unknownReturn = refund(); unknownReturn.items[0].unitCostCents = null;
    const returnReport = calculateSales([], [unknownReturn], range, status(), now);
    expect(returnReport.totals.profitCents).toBeNull();
    expect(returnReport.quality.missingCosts[0]).toMatchObject({ orderId: unknownReturn.orderId, quantity: 1 });
  });
  it("attributes item adjustments by SKU and bill adjustments proportionally without losing pennies", () => {
    const paid = order({ total: 2450.01, shippingCost: 0, adjustments: [{ amount: 500, salesItemSku: "SKU1" }, { amount: -49.99, salesItemSku: null }] });
    const lines = orderLines(paid).lines; expect(lines[0].charges).toBe(50000); expect(lines[0].net).toBe(245001); expect(lines[0].discounts).toBe(44999);
    const second = { ...paid.items[0], id: "i2", sku: "SKU2", productId: "p2", salesProductKey: "p2", name: "Pouch", price: 10, quantity: 1, salesListPriceCents: 1000 };
    paid.items = [second, ...paid.items]; paid.total += 10;
    const a = orderLines(paid), b = orderLines({ ...paid, items: [...paid.items].reverse() });
    expect(a.lines.map(line => line.net)).toEqual(b.lines.map(line => line.net)); expect(a.lines.reduce((sum, line) => sum + line.net, 0)).toBe(246001);
  });
  it("matches saved paid totals and exposes legacy pricing/date quality", () => {
    const paid = order({ total: 2250.01, salesDateEstimated: true }); paid.items[0].salesListPriceCents = null;
    const result = calculateSales([paid], [], range, status(), now);
    expect(result.totals.revenueCents).toBe(225001); expect(result.quality).toMatchObject({ estimatedPaidDates: 1, legacyPriceOrders: 1, reconciledOrders: 1 });
  });
  it("keeps category/size/product history after product deletion and filters channels consistently", () => {
    const paid = order(); paid.items[0].productId = null;
    const result = calculateSales([paid], [], range, status(), now);
    expect(result.products[0].key).toBe("p1"); expect(result.categories[0].name).toBe("Bags"); expect(result.sizes[0].name).toBe("One size");
    expect(calculateSales([paid], [refund()], { ...range, channel: "POS" }, status(), now).totals.revenueCents).toBe(0);
  });
  it("uses SLT midnight and an exclusive next-day end", () => {
    expect(calculateSales([order({ salesPaidAt: range.from })], [], range, status(), now).totals.orders).toBe(1);
    expect(calculateSales([order({ salesPaidAt: range.to })], [], range, status(), now).totals.orders).toBe(0);
  });
});
