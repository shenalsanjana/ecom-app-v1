import { describe, expect, it } from "vitest";
import { salesRange } from "../range";
import { moneyInput } from "../input";
import { salesItemSnapshot } from "../snapshot";
import { RefundInputSchema, prepareRefund } from "../refunds";
import { randomUUID } from "node:crypto";
import { order } from "./fixtures";
const now = new Date("2026-10-24T08:00:00Z");
describe("report ranges", () => {
  it("uses Sri Lankan today, Monday week start and calendar month", () => {
    expect(salesRange({ period: "today" }, now).from.toISOString()).toBe("2026-10-23T18:30:00.000Z");
    expect(salesRange({ period: "week" }, now).start).toBe("2026-10-19"); expect(salesRange({ period: "month" }, now).start).toBe("2026-10-01");
    expect(salesRange({ period: "today" }, new Date("2026-12-31T20:00:00Z")).start).toBe("2027-01-01");
  });
  it.each([{ period: "custom", start: "2026-02-30", end: "2026-03-01" }, { period: "custom", start: "2026-10-25", end: "2026-10-24" }, { period: "custom", start: "2024-01-01", end: "2026-01-01" }, { period: "bad" }, { channel: "bad" }])("rejects invalid and oversized ranges", query => { expect(() => salesRange(query, now)).toThrow(); });
  it("accepts a leap day and inclusive custom end", () => { expect(salesRange({ period: "custom", start: "2024-02-29", end: "2024-02-29" }, now).to.toISOString()).toBe("2024-02-29T18:30:00.000Z"); });
});
describe("costs and verified refunds", () => {
  const raw = () => ({ operationKey: randomUUID(), reference: " ref-123 ", reason: "Returned item", occurredAt: now.toISOString(), shippingCents: 0, verified: true as const, items: [{ orderItemId: "i1", amountCents: 50000, returnedQuantity: 1 }] });
  const past = () => ({ merchandiseCents: 0, shippingCents: 0, items: [] });
  it("keeps unknown and zero costs distinct and snapshots server prices/categories", () => {
    expect(moneyInput("", true)).toBeNull(); expect(moneyInput("0", true)).toBe(0); expect(moneyInput("12.34")).toBe(1234); expect(() => moneyInput("1.001")).toThrow();
    expect(salesItemSnapshot({ id: "p", costPriceCents: 20000, designSlug: "bags", design: { name: "Bags" }, originalPrice: 1200 }, {}, 1000)).toMatchObject({ unitCostCents: 20000, salesListPriceCents: 120000, salesCategoryName: "Bags" });
    expect(salesItemSnapshot({ id: "p" }, {}, 1000).unitCostCents).toBeNull();
  });
  it("requires a verified positive refund and rejects duplicate items", () => {
    expect(RefundInputSchema.safeParse({ ...raw(), verified: false }).success).toBe(false);
    expect(RefundInputSchema.safeParse({ ...raw(), items: [{ ...raw().items[0], amountCents: 0 }] }).success).toBe(false);
    expect(RefundInputSchema.safeParse({ ...raw(), items: [...raw().items, ...raw().items] }).success).toBe(false);
    expect(RefundInputSchema.parse(raw()).reference).toBe("REF-123");
  });
  it("uses remaining paid line values, return quantities and shipping caps", () => {
    const input = RefundInputSchema.parse(raw()); expect(prepareRefund(order(), input, past(), now).merchandiseCents).toBe(50000);
    expect(() => prepareRefund(order(), input, { ...past(), items: [{ orderItemId: "i1", amountCents: 180000, returnedQuantity: 0 }] }, now)).toThrow("remaining paid value");
    expect(() => prepareRefund(order(), input, { ...past(), items: [{ orderItemId: "i1", amountCents: 0, returnedQuantity: 2 }] }, now)).toThrow("purchased quantity");
    expect(() => prepareRefund(order(), { ...input, shippingCents: 35001 }, past(), now)).toThrow("delivery refund");
    expect(() => prepareRefund(order(), { ...input, items: [{ ...input.items[0], orderItemId: "other" }] }, past(), now)).toThrow("does not belong");
  });
  it("does not infer payment or stock returns from a refund", () => {
    const input = RefundInputSchema.parse(raw()); expect(() => prepareRefund(order({ paymentStatus: "PENDING" }), input, past(), now)).toThrow("verified paid");
    expect(() => prepareRefund(order({ status: "CONFIRMED" }), input, past(), now)).toThrow("returned-to-stock");
    expect(() => prepareRefund(order({ status: "CANCELLED" }), input, past(), now)).toThrow("already released");
    expect(prepareRefund(order({ status: "CANCELLED" }), { ...input, items: [{ ...input.items[0], returnedQuantity: 0 }] }, past(), now).merchandiseCents).toBe(50000);
  });
  it("rejects future/pre-payment dates and permits reviewed cancelled late payments", () => {
    const input = RefundInputSchema.parse(raw()); expect(() => prepareRefund(order(), { ...input, occurredAt: "2026-10-25T08:00:00Z" }, past(), now)).toThrow("refund date");
    expect(() => prepareRefund(order(), { ...input, occurredAt: "2026-10-23T08:00:00Z" }, past(), now)).toThrow("refund date");
    const closed = { ...order({ status: "CANCELLED", paymentStatus: "PENDING" }), paymentReviewRequired: true, verifiedLatePayment: true };
    expect(prepareRefund(closed, { ...input, items: [{ ...input.items[0], returnedQuantity: 0 }] }, past(), now).merchandiseCents).toBe(50000);
  });
});
