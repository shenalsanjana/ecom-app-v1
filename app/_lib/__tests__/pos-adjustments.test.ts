import { describe, expect, it } from "vitest";
import { calculatePosPricing, emptyPosAdjustments, parsePosAdjustments, PosPriceAdjustmentsSchema, hasPosPriceAdjustments } from "../pos-adjustments";
import { PosSaleSchema, posChange } from "../pos";
import { randomUUID } from "node:crypto";

describe("POS additional costs and discounts", () => {
  it("applies fixed item amounts once per quantity line, then percentage bill adjustments", () => {
    const result = calculatePosPricing([
      { sizeStockId: "shirt", price: 100_000, quantity: 2, adjustments: { charge: { mode: "FIXED", value: 10_000 }, discount: { mode: "PERCENT", value: 1000 } } },
      { sizeStockId: "bag", price: 50_000, quantity: 1 },
    ], { charge: { mode: "PERCENT", value: 1000 }, discount: { mode: "FIXED", value: 12_900 } });
    expect(result.subtotal).toBe(250_000);
    expect(result.lineTotals.get("shirt")).toBe(189_000);
    expect(result.lineTotals.get("bag")).toBe(50_000);
    expect(result.merchandiseTotal).toBe(250_000);
    expect(result.adjustments.map(entry => entry.amount)).toEqual([10_000, -21_000, 23_900, -12_900]);
  });
  it("rounds percentage amounts once to cents, including half-cent boundaries", () => {
    expect(calculatePosPricing([{ sizeStockId: "one", price: 199999, quantity: 1, adjustments: { discount: { mode: "PERCENT", value: 1250 } } }]).merchandiseTotal).toBe(174999);
    expect(calculatePosPricing([{ sizeStockId: "one", price: 1, quantity: 1, adjustments: { discount: { mode: "PERCENT", value: 5000 } } }]).merchandiseTotal).toBe(0);
  });
  it("rejects excessive discounts and unsafe values rather than hiding negative totals", () => {
    for (const adjustments of [{ discount: { mode: "FIXED", value: 101 } }, { discount: { mode: "PERCENT", value: 10001 } },
      { charge: { mode: "FIXED", value: -1 } }, { charge: { mode: "PERCENT", value: 100001 } }] as const) {
      expect(() => calculatePosPricing([{ sizeStockId: "one", price: 100, quantity: 1 }], adjustments)).toThrow();
    }
    expect(() => calculatePosPricing([{ sizeStockId: "one", price: 1_000_000_000, quantity: 2 }])).toThrow();
  });
  it("parses exact fixed amounts and percentages and rejects unsupported precision", () => {
    const draft = emptyPosAdjustments();
    expect(parsePosAdjustments(draft)).toBeUndefined();
    draft.charge.value = "12.34";
    draft.discount = { mode: "PERCENT", value: "12.5" };
    expect(parsePosAdjustments(draft)).toEqual({ charge: { mode: "FIXED", value: 1234 }, discount: { mode: "PERCENT", value: 1250 } });
    for (const value of ["1.001", "-1", "Infinity", "1e2"]) {
      draft.charge.value = value;
      expect(() => parsePosAdjustments(draft)).toThrow();
    }
    expect(PosPriceAdjustmentsSchema.safeParse({ discount: { mode: "PERCENT", value: 10001 } }).success).toBe(false);
  });
  it("allows an exact zero cash settlement and preserves unadjusted pending payloads", () => {
    expect(posChange(0, 0)).toBe(0);
    expect(() => posChange(0, 100)).toThrow();
    const parsed = PosSaleSchema.parse({ operationKey: randomUUID(), items: [{ sizeStockId: "one", expectedPrice: 100, quantity: 1 }], paymentMethod: "CASH", tendered: 100 });
    expect(parsed).not.toHaveProperty("adjustments");
    expect(parsed.items[0]).not.toHaveProperty("adjustments");
  });
  it("recognizes saved POS price agreements without locking ordinary orders", () => {
    expect(hasPosPriceAdjustments({ salesChannel: "POS", adjustments: [{ label: "POS · Item test · Discount (10%)" }] })).toBe(true);
    expect(hasPosPriceAdjustments({ salesChannel: "ONLINE", adjustments: [{ label: "POS · Item test" }] })).toBe(false);
    expect(hasPosPriceAdjustments({ salesChannel: "POS", adjustments: [] })).toBe(false);
  });
});
