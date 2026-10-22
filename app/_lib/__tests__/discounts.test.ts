import { describe, expect, it } from "vitest";
import { DiscountInputSchema, selectDiscount, discountAmount, type DiscountRule, type DiscountLine } from "../discounts";
const now = new Date("2026-10-21T12:00:00Z");
const rule = (overrides: Partial<DiscountRule> = {}): DiscountRule => ({ id: "d1", name: "Offer", code: null, type: "PERCENTAGE", scope: "STORE", value: 1000, active: true, startsAt: null, expiresAt: null, usageLimit: null, usedCount: 0, minimumOrder: 0, maximumDiscount: null, version: 0, products: [], categories: [], ...overrides });
const lines: DiscountLine[] = [{ productId: "p1", price: 1000, originalPrice: null, quantity: 2, categorySlugs: ["tees", "summer"] }, { productId: "p2", price: 500, originalPrice: null, quantity: 1, categorySlugs: ["bags"] }];
const input = { name: "Offer", code: " SAVE10 ", type: "PERCENTAGE", scope: "STORE", value: 10, active: true, startsAt: null, expiresAt: null, usageLimit: null, minimumOrder: 0, maximumDiscount: null, productIds: [], categorySlugs: [] };
describe("discount calculation and validation", () => {
  it("applies restrictions to single and multiple eligible methods, including COD", () => {
    const restricted = rule({ paymentMethods: ["PAYHERE", "KOKO"] });
    for (const method of ["PAYHERE", "KOKO"] as const) expect(selectDiscount([restricted], lines, "", now, method)?.amount).toBe(25000);
    for (const method of ["COD", "MINTPAY", undefined] as const) expect(selectDiscount([restricted], lines, "", now, method)).toBeNull();
    expect(selectDiscount([rule({ paymentMethods: ["COD"] })], lines, "", now, "COD")?.amount).toBe(25000);
  });
  it("preserves all-method offers and chooses the best eligible automatic offer", () => {
    const restricted = rule({ id: "bigger", value: 2000, paymentMethods: ["KOKO"] });
    expect(selectDiscount([rule(), restricted], lines, "", now, "COD")?.id).toBe("d1");
    expect(selectDiscount([rule(), restricted], lines, "", now, "KOKO")?.id).toBe("bigger");
    expect(selectDiscount([rule({ paymentMethods: [] })], lines, "", now)?.amount).toBe(25000);
    expect(selectDiscount([rule({ paymentMethods: ["COD", "PAYHERE", "KOKO", "MINTPAY"] })], lines, "", now, "MINTPAY")?.amount).toBe(25000);
  });
  it("explains restricted coupons without treating an ineligible method as a match", () => {
    const restricted = rule({ code: "SAVE", paymentMethods: ["PAYHERE", "KOKO"] });
    expect(() => selectDiscount([restricted], lines, "SAVE", now, "COD")).toThrow("Choose PayHere or Koko");
    expect(() => selectDiscount([restricted], lines, "SAVE", now)).toThrow("at checkout");
    expect(selectDiscount([restricted], lines, "SAVE", now, "PAYHERE")?.amount).toBe(25000);
  });
  it("accepts all or concrete selections and rejects no selections and mixed ALL values", () => {
    for (const methods of [["ALL"], ["COD"], ["PAYHERE", "KOKO"], ["MINTPAY"]]) expect(DiscountInputSchema.safeParse({ ...input, paymentMethods: methods }).success).toBe(true);
    for (const methods of [[], ["VISA"], ["ALL", "COD"], [null]]) expect(DiscountInputSchema.safeParse({ ...input, paymentMethods: methods }).success).toBe(false);
  });
  it("uses integer cents and applies a percentage once", () => { expect(selectDiscount([rule()], lines, "", now)?.amount).toBe(25000); });
  it("caps a fixed discount at eligible merchandise and then the configured cap", () => {
    expect(discountAmount(rule({ type: "FIXED", value: 999999 }), lines)).toBe(250000);
    expect(discountAmount(rule({ type: "FIXED", value: 999999, maximumDiscount: 5000 }), lines)).toBe(5000);
  });
  it("matches products, primary categories, and additional collections", () => {
    expect(discountAmount(rule({ scope: "PRODUCTS", products: [{ productId: "p2" }] }), lines)).toBe(5000);
    expect(discountAmount(rule({ scope: "CATEGORIES", categories: [{ designSlug: "summer" }, { designSlug: "tees" }] }), lines)).toBe(20000);
    expect(discountAmount(rule({ scope: "PRODUCTS", products: [] }), lines)).toBe(0);
  });
  it("never stacks on existing sale items", () => {
    expect(discountAmount(rule(), lines.map(l => ({ ...l, originalPrice: 2000 })))).toBe(0);
    expect(discountAmount(rule(), [{ ...lines[0], originalPrice: 2000 }, lines[1]])).toBe(5000);
  });
  it("selects the best automatic offer with deterministic ties", () => {
    expect(selectDiscount([rule({ id: "z" }), rule({ id: "a" }), rule({ id: "coupon", code: "SAVE", value: 9000 })], lines, "", now)?.id).toBe("a");
    expect(selectDiscount([rule(), rule({ id: "best", value: 2000 })], lines, "", now)?.id).toBe("best");
  });
  it("a normalized coupon replaces rather than stacks with automatic offers", () => {
    expect(selectDiscount([rule({ value: 9000 }), rule({ id: "coupon", code: "SAVE" })], lines, " save ", now)).toMatchObject({ id: "coupon", amount: 25000 });
  });
  it.each([
    [{ active: false }, "inactive"], [{ startsAt: new Date(now.getTime() + 1) }, "not available"],
    [{ expiresAt: now }, "expired"], [{ usageLimit: 2, usedCount: 2 }, "usage limit"],
    [{ minimumOrder: 250001 }, "Minimum order"],
  ] as [Partial<DiscountRule>, string][])("rejects unavailable coupons: %j", (overrides, message) => {
    expect(() => selectDiscount([rule({ code: "SAVE", ...overrides })], lines, "SAVE", now)).toThrow(message);
    expect(selectDiscount([rule(overrides)], lines, "", now)).toBeNull();
  });
  it("rejects invalid and inapplicable coupons", () => {
    expect(() => selectDiscount([], lines, "INVALID", now)).toThrow("Invalid coupon");
    expect(() => selectDiscount([rule({ code: "SAVE", scope: "PRODUCTS" })], lines, "SAVE", now)).toThrow("does not apply");
  });
  it("rounds fractional amounts to cents once", () => {
    expect(discountAmount(rule({ value: 1250 }), [{ ...lines[0], price: 0.05, quantity: 3 }])).toBe(2);
  });
  it("accepts exact minimum and start date boundaries", () => {
    expect(selectDiscount([rule({ startsAt: now, minimumOrder: 250000 })], lines, "", now)?.amount).toBe(25000);
  });
  it("normalizes codes and validates admin constraints", () => {
    expect(DiscountInputSchema.parse(input).code).toBe("SAVE10");
    for (const change of [{ value: 101 }, { value: 0 }, { value: NaN }, { value: 1.001 }, { usageLimit: 0 }, { minimumOrder: -1 }, { maximumDiscount: 0 }, { code: "A B" }, { scope: "PRODUCTS" }, { scope: "CATEGORIES" }, { startsAt: now.toISOString(), expiresAt: now.toISOString() }]) expect(DiscountInputSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
  it("compares schedule instants even when ISO precision differs", () => {
    expect(DiscountInputSchema.safeParse({ ...input, startsAt: "2026-10-21T12:00:00.000Z", expiresAt: "2026-10-21T12:00:00Z" }).success).toBe(false);
    expect(DiscountInputSchema.safeParse({ ...input, startsAt: "2026-10-21T12:00:00.100Z", expiresAt: "2026-10-21T12:00:00Z" }).success).toBe(false);
    expect(DiscountInputSchema.safeParse({ ...input, startsAt: "2026-10-21T12:00:00Z", expiresAt: "2026-10-21T12:00:00.100Z" }).success).toBe(true);
  });
});
