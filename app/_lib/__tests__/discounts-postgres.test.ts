import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { DiscountInput } from "../discounts";
import { clearIsolatedStockAudit } from "./clear-isolated-stock-audit";

const shared = vi.hoisted(() => ({ url: process.env.DISCOUNT_TEST_DATABASE_URL, client: null as PrismaClient | null, admin: vi.fn() }));
vi.mock("@/app/_lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  if (shared.url) {
    const url = new URL(shared.url);
    if (!["localhost", "127.0.0.1", "postgres"].includes(url.hostname) || !/^\/catalogue_publishing_[a-f0-9]{10}_test$/.test(url.pathname)) throw new Error("Explicit isolated discount test database required");
  }
  shared.client = new PrismaClient({ datasourceUrl: shared.url ?? "postgresql://unused:unused@127.0.0.1:1/unused_test" });
  return { prisma: shared.client };
});
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin: shared.admin }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/_lib/session-user", () => ({ getVerifiedSessionUser: vi.fn().mockResolvedValue(null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/app/_lib/invalidate-stock", () => ({ invalidateStock: vi.fn() }));
vi.mock("@/app/_lib/store-settings", () => ({ getDeliveryConfig: vi.fn().mockResolvedValue({ colombo: 350, other: 450, freeThreshold: 5000 }) }));
vi.mock("@/app/_lib/order-notifications", () => ({ notifyOrderConfirmed: vi.fn() }));
vi.mock("@/app/_lib/mailer", () => ({ sendPendingPrepaidNotificationEmail: vi.fn(), sendAdminFailureAlertEmail: vi.fn(), logMailerError: vi.fn() }));

import { saveDiscount, setDiscountActive, deleteDiscount } from "@/app/admin/discounts/actions";
import { processOrder } from "@/app/checkout/actions";
import { getDiscountQuote } from "@/app/checkout/discount-actions";
import { claimDiscount, priceDiscount, quoteCart } from "../discount-service";
import { readStorefrontPromotions } from "../storefront-promotion-service";
import type { PaymentMethod } from "../payments/types";

const prefix = `discount-pg-${process.pid}-${Date.now()}`;
const db = () => shared.client!;
const orderIds: string[] = [];
const existingActiveOfferIds: string[] = [];
let serial = 0, productId: string, variantId: string, collection: string, secondary: string, department: string;
let categoryId: string, familyId: string, blankId: string;
const key = () => `${prefix}-${serial++}`;
const items = () => [{ productId, variantId, quantity: 2 }];
async function offer(overrides: Partial<DiscountInput> = {}) {
  const name = key();
  const input: DiscountInput = { name, code: "", type: "PERCENTAGE", scope: "STORE", value: 10, active: true,
    startsAt: null, expiresAt: null, usageLimit: null, minimumOrder: 0, maximumDiscount: null, productIds: [], categorySlugs: [], ...overrides };
  expect(await saveDiscount(null, null, input)).toEqual({ success: true });
  return db().discount.findFirstOrThrow({ where: { name } });
}
function checkout(couponCode?: string, idempotencyKey = randomUUID(), discountExpectation?: { id: string | null; amount: number }, paymentMethod: PaymentMethod = "COD") {
  return processOrder({ items: [{ productId, variantId, name: "Isolated tote", price: 1000, quantity: 2, size: "M" }],
    shippingAddress: { line1: "Isolated discount verification", city: "Colombo", country: "Sri Lanka" },
    contactPhone: "+94770000000", guestInfo: { name: "Isolated shopper", phone: "+94770000000" }, paymentMethod,
    couponCode, idempotencyKey, discountExpectation });
}

describe.skipIf(!shared.url)("discount management and checkout: PostgreSQL", () => {
  beforeAll(async () => {
    const actual = await db().$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    expect(actual[0].name).toMatch(/^catalogue_publishing_[a-f0-9]{10}_test$/);
    // A restored live database can contain campaigns. Keep this suite's
    // automatic-offer assertions independent, and restore those rules afterward.
    existingActiveOfferIds.push(...(await db().discount.findMany({ where: { active: true }, select: { id: true } })).map(row => row.id));
    await db().discount.updateMany({ where: { id: { in: existingActiveOfferIds } }, data: { active: false } });
    department = key(); collection = key(); secondary = key(); productId = key();
    await db().department.create({ data: { slug: department, name: prefix, navLabel: prefix, tileName: prefix, hex: "#ffffff" } });
    for (const slug of [collection, secondary]) await db().design.create({ data: { slug, name: slug, departmentSlug: department, hex: "#ffffff" } });
    categoryId = (await db().inventoryCategory.create({ data: { name: prefix } })).id;
    familyId = (await db().inventoryProduct.create({ data: { name: prefix, categoryId } })).id;
    blankId = (await db().plainTshirtStock.create({ data: { inventoryProductId: familyId, color: "White", colorSlug: "white", size: "M", quantity: 20 } })).id;
    const product = await db().product.create({ data: { id: productId, name: prefix, description: "Isolated discount verification", price: 1000,
      status: "PUBLISHED", stockMode: "PLAIN", designSlug: collection, departmentSlug: department, inventoryProductId: familyId,
      additionalCollections: { create: { designSlug: secondary } },
      variants: { create: { color: "White", colorSlug: "white", sizeStocks: { create: { size: "M", plainTshirtStockId: blankId } } } },
    }, include: { variants: true } });
    variantId = product.variants[0].id;
  });
  beforeEach(async () => {
    shared.admin.mockReset().mockResolvedValue({ user: { id: "isolated-discount-admin", role: "ADMIN" } });
    await db().discount.updateMany({ where: { name: { startsWith: prefix } }, data: { active: false, version: { increment: 1 } } });
    await db().product.update({ where: { id: productId }, data: { archived: false, originalPrice: null } });
    await db().plainTshirtStock.update({ where: { id: blankId }, data: { quantity: 20 } });
  });
  afterAll(async () => {
    await clearIsolatedStockAudit(db(), shared.url);
    await db().discountRedemption.deleteMany({ where: { orderId: { in: orderIds } } });
    await db().order.deleteMany({ where: { id: { in: orderIds } } });
    await db().discount.deleteMany({ where: { name: { startsWith: prefix } } });
    await db().product.deleteMany({ where: { id: productId } });
    await db().plainTshirtStock.deleteMany({ where: { id: blankId } });
    await db().inventoryProduct.deleteMany({ where: { id: familyId } });
    await db().inventoryCategory.deleteMany({ where: { id: categoryId } });
    await db().design.deleteMany({ where: { slug: { in: [collection, secondary] } } });
    await db().department.deleteMany({ where: { slug: department } });
    await db().discount.updateMany({ where: { id: { in: existingActiveOfferIds } }, data: { active: true } });
    await db().$disconnect();
  });

  it("normalizes coupon codes and rejects duplicates atomically", async () => {
    const code = `PG-${process.pid}-${serial}`;
    const saved = await offer({ code: ` ${code.toLowerCase()} `, value: 12.5 });
    expect(saved).toMatchObject({ code, value: 1250, usedCount: 0 });
    expect(await saveDiscount(null, null, { name: key(), code, type: "FIXED", scope: "STORE", value: 100, active: true,
      startsAt: null, expiresAt: null, usageLimit: null, minimumOrder: 0, maximumDiscount: null, productIds: [], categorySlugs: [] })).toEqual({ success: false, error: "That coupon code is already in use." });
  });
  it("publishes selected coupons without leaking private codes or exhausted offers", async () => {
    const privateOffer = await offer({ code: `PRIVATE-${serial}` });
    const publicOffer = await offer({ code: `PUBLIC-${serial}`, publicOffer: true });
    const automatic = await offer();
    const exhausted = await offer({ usageLimit: 1 });
    await db().discount.update({ where: { id: exhausted.id }, data: { usedCount: 1 } });
    expect(privateOffer.publicOffer).toBe(false);
    const snapshot = await readStorefrontPromotions();
    expect(snapshot.offers.map(r => r.id)).toEqual(expect.arrayContaining([publicOffer.id, automatic.id]));
    expect(snapshot.offers.map(r => r.id)).not.toContain(privateOffer.id);
    expect(snapshot.offers.map(r => r.id)).not.toContain(exhausted.id);
    expect(JSON.stringify(snapshot)).not.toContain(privateOffer.code);
  });
  it("persists deduplicated product targets and authoritative prices", async () => {
    const saved = await offer({ scope: "PRODUCTS", productIds: [productId, productId], value: 12.5 });
    expect(await db().discountProduct.count({ where: { discountId: saved.id } })).toBe(1);
    expect(await quoteCart(items())).toMatchObject({ subtotal: 200000, discount: { id: saved.id, amount: 25000 } });
  });
  it("matches additional storefront collections", async () => {
    const saved = await offer({ scope: "CATEGORIES", categorySlugs: [secondary] });
    expect((await quoteCart(items())).discount).toMatchObject({ id: saved.id, amount: 20000 });
  });
  it("excludes existing sale prices from automatic and coupon offers", async () => {
    await offer();
    const coupon = await offer({ code: `SALE-${process.pid}` });
    await db().product.update({ where: { id: productId }, data: { originalPrice: 1500 } });
    expect((await quoteCart(items())).discount).toBeNull();
    expect(await getDiscountQuote(items(), coupon.code!)).toMatchObject({ success: false, error: expect.stringContaining("Sale items are excluded") });
  });
  it("enforces optimistic activation, edits and deletion", async () => {
    const saved = await offer();
    expect(await setDiscountActive(saved.id, saved.version, false)).toEqual({ success: true });
    expect(await setDiscountActive(saved.id, saved.version, true)).toMatchObject({ success: false });
    expect(await deleteDiscount(saved.id, saved.version)).toMatchObject({ success: false });
    expect(await deleteDiscount(saved.id, saved.version + 1)).toEqual({ success: true });
  });
  it("allows only one concurrent claimant to take the final use", async () => {
    const saved = await offer({ usageLimit: 1 });
    const applied = (await quoteCart(items())).discount!;
    const results = await Promise.allSettled([db().$transaction(tx => claimDiscount(tx, applied)), db().$transaction(tx => claimDiscount(tx, applied))]);
    expect(results.map(r => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await db().discount.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({ usedCount: 1, version: 1 });
  });
  it("rolls back the usage claim with a failed order transaction", async () => {
    const saved = await offer({ usageLimit: 1 });
    const applied = (await quoteCart(items())).discount!;
    await expect(db().$transaction(async tx => { await claimDiscount(tx, applied); throw new Error("later order failure"); })).rejects.toThrow("later order failure");
    expect(await db().discount.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({ usedCount: 0, version: 0 });
  });
  it("rejects a claim invalidated by an admin change", async () => {
    const saved = await offer();
    const applied = (await quoteCart(items())).discount!;
    await setDiscountActive(saved.id, saved.version, false);
    await expect(db().$transaction(tx => claimDiscount(tx, applied))).rejects.toThrow("offer changed");
    expect((await db().discount.findUniqueOrThrow({ where: { id: saved.id } })).usedCount).toBe(0);
  });
  it("persists COD savings and keeps order history after deleting the offer", async () => {
    const saved = await offer({ code: `COD-${process.pid}`, value: 12.5 });
    const result = await checkout(saved.code!);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    orderIds.push(result.orderId);
    const order = await db().order.findUniqueOrThrow({ where: { id: result.orderId }, include: { adjustments: true, discountRedemption: true } });
    expect(order).toMatchObject({ subtotal: 2000, shippingCost: 350, total: 2100, discountRedemption: { discountId: saved.id, amount: 25000, code: saved.code } });
    expect(order.adjustments).toEqual([expect.objectContaining({ amount: -250, promotion: true })]);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: blankId } })).quantity).toBe(18);
    expect(await deleteDiscount(saved.id, saved.version + 1)).toEqual({ success: true });
    expect(await db().discountRedemption.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({ discountId: null, amount: 25000, code: saved.code });
    expect((await db().order.findUniqueOrThrow({ where: { id: order.id } })).total).toBe(2100);
  });
  it("does not consume another use or stock when retrying an order", async () => {
    const saved = await offer({ code: `RETRY-${process.pid}` });
    const idempotencyKey = randomUUID();
    const first = await checkout(saved.code!, idempotencyKey);
    expect(first.success).toBe(true);
    if (!first.success) throw new Error(first.error);
    orderIds.push(first.orderId);
    expect(await checkout(saved.code!, idempotencyKey)).toMatchObject({ success: true, orderId: first.orderId });
    expect((await db().discount.findUniqueOrThrow({ where: { id: saved.id } })).usedCount).toBe(1);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: blankId } })).quantity).toBe(18);
    expect(await db().discountRedemption.count({ where: { orderId: first.orderId } })).toBe(1);
  });
  it("rejects a stale confirmed total before claiming usage or stock", async () => {
    const saved = await offer({ code: `STALE-${process.pid}` });
    expect(await checkout(saved.code!, randomUUID(), { id: saved.id, amount: 1 })).toMatchObject({ success: false, error: expect.stringContaining("offer changed") });
    expect((await db().discount.findUniqueOrThrow({ where: { id: saved.id } })).usedCount).toBe(0);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: blankId } })).quantity).toBe(20);
  });
  it("database constraints reject invalid percentages outside admin validation", async () => {
    await expect(db().discount.create({ data: { name: key(), type: "PERCENTAGE", scope: "STORE", value: 10001 } })).rejects.toThrow();
  });
  it("persists multiple methods and recalculates quotes for all supported methods", async () => {
    const saved = await offer({ paymentMethods: ["PAYHERE", "KOKO"], value: 15 });
    expect(saved.paymentMethods).toEqual(["PAYHERE", "KOKO"]);
    for (const method of ["COD", "PAYHERE", "KOKO", "MINTPAY"] as const) {
      const quote = await quoteCart(items(), "", method);
      expect(quote.discount?.amount ?? 0).toBe(["PAYHERE", "KOKO"].includes(method) ? 30000 : 0);
      if (method === "COD" || method === "MINTPAY") expect(quote.notice).toContain("Choose PayHere or Koko");
    }
    expect((await readStorefrontPromotions()).offers.find(r => r.id === saved.id)?.paymentMethods).toEqual(["PAYHERE", "KOKO"]);
    expect((await quoteCart(items())).discount).toBeNull();
  });
  it("validates restricted coupon totals again before claiming uses or stock", async () => {
    const saved = await offer({ code: `METHOD-${serial}`, paymentMethods: ["KOKO"] });
    const key = randomUUID();
    expect(await checkout(saved.code!, key, { id: saved.id, amount: 20000 }, "COD")).toMatchObject({ success: false, error: expect.stringContaining("offer changed") });
    expect((await db().discount.findUniqueOrThrow({ where: { id: saved.id } })).usedCount).toBe(0);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: blankId } })).quantity).toBe(20);
    const result = await checkout(saved.code!, key, { id: null, amount: 0 }, "COD");
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    orderIds.push(result.orderId);
    expect(await db().order.findUniqueOrThrow({ where: { id: result.orderId } })).toMatchObject({ total: 2350, paymentMethod: "COD" });
    expect(await db().discountRedemption.count({ where: { orderId: result.orderId } })).toBe(0);
    expect((await db().discount.findUniqueOrThrow({ where: { id: saved.id } })).usedCount).toBe(0);
  });
  it("keeps the payment method immutable when retrying an accepted discounted order", async () => {
    const saved = await offer({ code: `RETRY-METHOD-${serial}`, paymentMethods: ["KOKO"] });
    const key = randomUUID();
    const result = await checkout(saved.code!, key, { id: saved.id, amount: 20000 }, "KOKO");
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    orderIds.push(result.orderId);
    expect(await checkout(saved.code!, key, undefined, "COD")).toMatchObject({ success: false, error: expect.stringContaining("different payment method") });
    expect(await db().order.findUniqueOrThrow({ where: { id: result.orderId } })).toMatchObject({ total: 2150, paymentMethod: "KOKO" });
    expect((await db().discount.findUniqueOrThrow({ where: { id: saved.id } })).usedCount).toBe(1);
  });
  it("defaults legacy offers to all methods and rejects invalid persisted method names", async () => {
    const saved = await offer();
    expect(saved.paymentMethods).toEqual([]);
    expect((await quoteCart(items(), "", "MINTPAY")).discount?.id).toBe(saved.id);
    await expect(db().discount.create({ data: { name: key(), type: "PERCENTAGE", scope: "STORE", value: 1000, paymentMethods: ["VISA"] } })).rejects.toThrow();
  });
  it("requires admin access before mutating real discount records", async () => {
    const saved = await offer();
    shared.admin.mockRejectedValue(new Error("denied"));
    await expect(setDiscountActive(saved.id, saved.version, false)).rejects.toThrow("denied");
    expect((await db().discount.findUniqueOrThrow({ where: { id: saved.id } })).active).toBe(true);
  });
  it("uses the transaction's offer state while repricing", async () => {
    const saved = await offer();
    await db().$transaction(async tx => {
      await tx.discount.update({ where: { id: saved.id }, data: { value: 2000, version: { increment: 1 } } });
      const lines = [{ productId, price: 1000, originalPrice: null, quantity: 2, categorySlugs: [collection] }];
      expect(await priceDiscount(tx, lines)).toMatchObject({ id: saved.id, amount: 40000, version: 1 });
    });
  });
});
