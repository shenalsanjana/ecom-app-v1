import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import type { DiscountRule } from "../discounts";
const mock = vi.hoisted(() => ({ rules: vi.fn(), claim: vi.fn(), variants: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => ({ prisma: { discount: { findMany: mock.rules, updateMany: mock.claim, fields: { usageLimit: "usageLimit" } }, productVariant: { findMany: mock.variants } } }));
import { prisma } from "../prisma";
import { priceDiscount, claimDiscount, quoteCart } from "../discount-service";
const rule: DiscountRule = { id: "d", name: "Offer", code: "SAVE", type: "FIXED", scope: "CATEGORIES", value: 50000, active: true, startsAt: null, expiresAt: null, usageLimit: 1, usedCount: 0, minimumOrder: 0, maximumDiscount: null, version: 0, products: [], categories: [{ designSlug: "extra" }] };
beforeEach(() => {
  vi.resetAllMocks(); mock.rules.mockResolvedValue([rule]); mock.claim.mockResolvedValue({ count: 1 });
  mock.variants.mockResolvedValue([{ id: "v", productId: "p", price: null, originalPrice: null, product: { price: 1500, originalPrice: null, designSlug: "primary", additionalCollections: [{ designSlug: "extra" }] } }]);
});
describe("authoritative promotion service", () => {
  it("removes and restores a coupon saving when the selected method changes", async () => {
    mock.rules.mockResolvedValue([{ ...rule, paymentMethods: ["PAYHERE", "KOKO"] }]);
    const input = [{ productId: "p", variantId: "v", quantity: 2 }];
    expect(await quoteCart(input, "SAVE", "PAYHERE")).toMatchObject({ discount: { amount: 50000 }, notice: null, paymentMethod: "PAYHERE" });
    expect(await quoteCart(input, "SAVE", "COD")).toMatchObject({ discount: null, notice: expect.stringContaining("PayHere or Koko"), paymentMethod: "COD" });
    expect(await quoteCart(input, "SAVE", "KOKO")).toMatchObject({ discount: { amount: 50000 }, notice: null });
    expect(await priceDiscount(prisma, [{ productId: "p", price: 1500, originalPrice: null, quantity: 2, categorySlugs: ["extra"] }], "SAVE", "MINTPAY")).toBeNull();
  });
  it("explains unavailable automatic savings from authoritative rules", async () => {
    mock.rules.mockResolvedValue([{ ...rule, code: null, paymentMethods: ["PAYHERE"] }]);
    const input = [{ productId: "p", variantId: "v", quantity: 2 }];
    expect(await quoteCart(input, "", "COD")).toMatchObject({ discount: null, notice: expect.stringContaining("not applied with Cash on Delivery") });
    expect(await quoteCart(input)).toMatchObject({ discount: null, notice: expect.stringContaining("at checkout") });
    expect(await quoteCart(input, "", "PAYHERE")).toMatchObject({ discount: { amount: 50000 }, notice: null });
    mock.rules.mockResolvedValue([{ ...rule, code: null, paymentMethods: ["PAYHERE"], minimumOrder: 900000 }]);
    expect(await quoteCart(input, "", "COD")).toMatchObject({ discount: null, notice: null });
  });
  it("quotes current DB prices and additional collection eligibility", async () => {
    const quote = await quoteCart([{ productId: "p", variantId: "v", quantity: 2 }], " save ");
    expect(quote).toMatchObject({ subtotal: 300000, originalSubtotal: 300000, discount: { amount: 50000 }, prices: [{ variantId: "v", price: 1500 }] });
    expect(mock.rules).toHaveBeenCalledWith(expect.objectContaining({ where: { code: "SAVE" } }));
  });
  it("rejects product/variant substitution and unavailable variants", async () => {
    await expect(quoteCart([{ productId: "forged", variantId: "v", quantity: 1 }])).rejects.toThrow("no longer available");
    mock.variants.mockResolvedValue([]);
    await expect(quoteCart([{ productId: "p", variantId: "v", quantity: 1 }])).rejects.toThrow("no longer available");
  });
  it("filters automatic rules independently of entered coupons", async () => {
    mock.rules.mockResolvedValue([]);
    expect(await priceDiscount(prisma, [], " ")).toBeNull();
    expect(mock.rules).toHaveBeenCalledWith(expect.objectContaining({ where: { code: null, active: true } }));
  });
  it("claims with live expiry, version, activity and field-to-field usage guards", async () => {
    await claimDiscount(prisma, { id: "d", name: "Offer", code: "SAVE", amount: 50000, version: 7 });
    expect(mock.claim).toHaveBeenCalledWith({ where: expect.objectContaining({ id: "d", version: 7, active: true, AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: expect.any(Date) } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] },
      { OR: [{ usageLimit: null }, { usedCount: { lt: "usageLimit" } }] },
    ] }), data: { usedCount: { increment: 1 }, version: { increment: 1 } } });
  });
  it("only lets one request claim the final available use", async () => {
    let used = false;
    mock.claim.mockImplementation(async () => { if (used) return { count: 0 }; used = true; return { count: 1 }; });
    const applied = { id: "d", name: "Offer", code: "SAVE", amount: 50000, version: 0 };
    // Two async requests use a lightweight in-memory guard, never the live DB.
    const results = await Promise.allSettled([claimDiscount(prisma, applied), claimDiscount(prisma, applied)]);
    expect(results.map(r => r.status).sort()).toEqual(["fulfilled", "rejected"]);
  });
  it("uses the transaction's delegate when claiming an offer", async () => {
    const txClaim = vi.fn().mockResolvedValue({ count: 0 });
    const tx = { discount: { updateMany: txClaim, fields: { usageLimit: "usageLimit" } } } as unknown as Pick<Prisma.TransactionClient, "discount">;
    await expect(claimDiscount(tx, { id: "d", name: "Offer", code: "SAVE", amount: 1, version: 0 })).rejects.toThrow("usage limit");
    expect(mock.claim).not.toHaveBeenCalled();
  });
});


it("supplies authoritative custom product names for restored-cart reminders without duplicate variants", async () => {
  mock.rules.mockResolvedValue([]);
  const product = { name: "Custom Tote", isCustomizedDesign: true, price: 1790, originalPrice: null, designSlug: "bags", additionalCollections: [] };
  mock.variants.mockResolvedValue([{ id: "v1", productId: "p", price: null, originalPrice: null, product }, { id: "v2", productId: "p", price: null, originalPrice: null, product }]);
  const quote = await quoteCart([{ productId: "p", variantId: "v1", quantity: 1 }, { productId: "p", variantId: "v2", quantity: 1 }]);
  expect(quote.customizedProducts).toEqual([{ productId: "p", name: "Custom Tote" }]);
  expect(quote.subtotal).toBe(358000);
});
