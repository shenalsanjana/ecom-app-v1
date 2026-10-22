import { describe, expect, it } from "vitest";
import { discountAmount, selectDiscount, type DiscountRule } from "../discounts";
import { activePromotions, automaticPriceOffer, cartPromotionAdvice, productPromotion, promotionHeadline, promotionRule, promotionTerms, publicPromotions, storeCampaign, type StorefrontPromotion } from "../storefront-promotions";

const now = Date.parse("2026-10-21T16:00:00Z");
const base: DiscountRule & { publicOffer?: boolean } = { id: "auto", name: "Store event", code: null, active: true, type: "PERCENTAGE", scope: "STORE", value: 1000, minimumOrder: 0, maximumDiscount: null, startsAt: null, expiresAt: null, usageLimit: null, usedCount: 0, version: 0, products: [], categories: [] };
const line = { productId: "p", price: 2000, originalPrice: null, quantity: 1, categorySlugs: ["primary", "extra"] };
const offer = (override: Partial<typeof base> = {}): StorefrontPromotion => publicPromotions([{ ...base, ...override }], now)[0];

describe("public promotion boundary", () => {
  it("keeps private codes out of the public payload and omits internal counters", () => {
    const result = publicPromotions([base, { ...base, id: "private", code: "VIP_SECRET" }, { ...base, id: "public", code: "SAVE", publicOffer: true }], now);
    expect(result.map(r => r.id)).toEqual(["auto", "public"]);
    expect(JSON.stringify(result)).not.toContain("VIP_SECRET");
    expect(result[0]).not.toHaveProperty("usedCount");
    expect(result[0]).not.toHaveProperty("version");
  });
  it.each([{ active: false }, { expiresAt: new Date(now) }, { usageLimit: 2, usedCount: 2 }])("omits unavailable rules %j", override => {
    expect(publicPromotions([{ ...base, ...override }], now)).toEqual([]);
  });
  it("switches scheduled and expired offers at the exact boundary", () => {
    const scheduled = offer({ startsAt: new Date(now + 1000), expiresAt: new Date(now + 2000) });
    expect(activePromotions([scheduled], now)).toEqual([]);
    expect(activePromotions([scheduled], now + 1000)).toEqual([scheduled]);
    expect(activePromotions([scheduled], now + 2000)).toEqual([]);
  });
});
describe("honest product prices", () => {
  it("keeps payment-restricted discounts conditional on every product surface", () => {
    const restricted = offer({ paymentMethods: ["PAYHERE", "KOKO"], value: 1500 });
    expect(productPromotion([restricted], line)).toMatchObject({ price: 2000, originalPrice: null, exact: false, paymentOffers: [restricted] });
    expect(promotionHeadline(restricted)).toContain("15% off full-price items with PayHere or Koko");
    expect(promotionTerms(restricted)).toContain("Eligible payment methods: PayHere or Koko");
    expect(automaticPriceOffer([offer(), restricted])).toBeNull();
    expect(productPromotion([restricted], { ...line, originalPrice: 2500 }).paymentOffers).toEqual([]);
  });
  it("keeps restricted public coupon conditions discoverable alongside an automatic offer", () => {
    const coupon = offer({ id: "coupon", code: "SAVE", publicOffer: true, paymentMethods: ["KOKO"] });
    expect(productPromotion([offer(), coupon], line)).toMatchObject({ price: 1800, exact: true, paymentOffers: [coupon] });
    expect(publicPromotions([{ ...base, paymentMethods: ["COD"] }], now)[0].paymentMethods).toEqual(["COD"]);
  });
  it("shows the original and reduced price for a store-wide automatic percentage", () => {
    expect(productPromotion([offer()], line)).toMatchObject({ price: 1800, originalPrice: 2000, exact: true });
    const current = productPromotion([offer()], line);
    expect((line.price - current.price) * 100).toBe(selectDiscount([base], [line])?.amount);
  });
  it("does not stack a promotion onto an existing sale price", () => {
    expect(productPromotion([offer()], { ...line, originalPrice: 2500 })).toMatchObject({ price: 2000, originalPrice: 2500, exact: false, offer: null });
  });
  it.each([{ minimumOrder: 500000 }, { maximumDiscount: 50000 }, { type: "FIXED", value: 50000 }, { code: "SAVE", publicOffer: true }])("keeps base prices for a conditional offer %j", override => {
    expect(productPromotion([offer(override)], line)).toMatchObject({ price: 2000, originalPrice: null, exact: false, offer: expect.any(Object) });
  });
  it("uses additional collections and excludes nonmatching products", () => {
    const scoped = offer({ scope: "CATEGORIES", categories: [{ designSlug: "extra" }] });
    expect(productPromotion([scoped], line).price).toBe(1800);
    expect(productPromotion([scoped], { ...line, categorySlugs: ["other"] }).offer).toBeNull();
    const targeted = offer({ scope: "PRODUCTS", products: [{ productId: "p" }] });
    expect(productPromotion([targeted], line).price).toBe(1800);
    expect(productPromotion([targeted], { ...line, productId: "other" }).price).toBe(2000);
  });
  it("does not combine per-product winners into an impossible order", () => {
    const first = offer({ id: "one", scope: "PRODUCTS", products: [{ productId: "p" }] });
    const second = offer({ id: "two", scope: "PRODUCTS", products: [{ productId: "q" }], value: 2000 });
    expect(automaticPriceOffer([first, second])).toBeNull();
    expect(productPromotion([first, second], line).price).toBe(2000);
  });
  it("uses the best compatible automatic percentage without suppressing it for public coupons", () => {
    const higher = offer({ id: "higher", value: 2000 });
    expect(productPromotion([offer(), higher, offer({ id: "coupon", code: "SAVE", publicOffer: true })], line).price).toBe(1600);
  });
  it("suppresses automatic price previews when a coupon replaces the automatic offer", () => {
    expect(productPromotion([offer()], line, "PRIVATE")).toMatchObject({ price: 2000, exact: false, offer: null });
    const coupon = offer({ id: "coupon", code: "SAVE", publicOffer: true });
    expect(productPromotion([offer(), coupon], line, "SAVE")).toMatchObject({ price: 2000, exact: false, offer: coupon });
  });
  it("handles fractional percentages and rounds money in cents like checkout", () => {
    const promotion = offer({ value: 1250 });
    const item = { ...line, price: 1999.95 };
    expect(productPromotion([promotion], item).price).toBe(1749.96);
    expect(discountAmount(promotionRule(promotion), [item])).toBe(24999);
  });
});
describe("campaign and cart guidance", () => {
  it("only compares automatic savings for the selected payment method", () => {
    const restricted = offer({ paymentMethods: ["PAYHERE"], value: 1500 });
    expect(cartPromotionAdvice([restricted], [line], 200000, null, "", "COD")).toMatchObject({ automaticSaving: 0, paymentNotice: expect.stringContaining("not applied with Cash on Delivery") });
    expect(cartPromotionAdvice([restricted], [line], 200000, null, "", "PAYHERE")).toMatchObject({ automaticSaving: 30000, paymentNotice: null });
    expect(cartPromotionAdvice([restricted], [line], 200000, { id: "coupon", amount: 10000 }, "SAVE", "COD").automaticSaving).toBe(0);
  });
  it("shows one consistent store-wide campaign and prefers automatic offers", () => {
    const coupon = offer({ id: "a", code: "SAVE", publicOffer: true });
    const scoped = offer({ id: "b", scope: "PRODUCTS", products: [{ productId: "p" }] });
    expect(storeCampaign([coupon, scoped, offer()])?.id).toBe("auto");
    expect(storeCampaign([scoped])).toBeNull();
    expect(storeCampaign([offer(), offer({ id: "higher", value: 2000 })])?.id).toBe("higher");
  });
  it("communicates code, minimum, cap, expiry, fixed order amount, and exclusions", () => {
    const campaign = offer({ code: "SAVE", publicOffer: true, type: "FIXED", value: 50000, minimumOrder: 500000, maximumDiscount: 50000, usageLimit: 10, expiresAt: new Date("2026-10-22T18:30:00Z") });
    expect(promotionHeadline(campaign)).toContain("off eligible orders");
    const terms = promotionTerms(campaign);
    for (const text of ["Use code SAVE", "Minimum order", "Save up to", "per order", "Sale items excluded", "One offer", "While uses remain", "Sri Lanka", "23 Oct 2026"]) expect(terms).toContain(text);
  });
  it("shows a minimum-spend gap then removes it when qualifying", () => {
    const conditional = offer({ minimumOrder: 500000 });
    expect(cartPromotionAdvice([conditional], [line], 200000, null, "")).toMatchObject({ remaining: 300000, suggestion: conditional, automaticSaving: 0 });
    expect(cartPromotionAdvice([conditional], [{ ...line, quantity: 3 }], 600000, { id: conditional.id, amount: 60000 }, "").suggestion).toBeNull();
  });
  it("suggests removing a weaker coupon without silently changing the entered code", () => {
    expect(cartPromotionAdvice([offer()], [line], 200000, { id: "coupon", amount: 5000 }, "PRIVATE")).toMatchObject({ automaticSaving: 20000, suggestion: null });
  });
  it("does not suggest ineligible, sale-only, or weaker offers", () => {
    expect(cartPromotionAdvice([offer()], [{ ...line, originalPrice: 2500 }], 200000, null, "").suggestion).toBeNull();
    expect(cartPromotionAdvice([offer()], [line], 200000, { id: "better", amount: 40000 }, "").suggestion).toBeNull();
  });
});
