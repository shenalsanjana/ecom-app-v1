import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { clearIsolatedStockAudit } from "./clear-isolated-stock-audit";

const shared = vi.hoisted(() => ({ url: process.env.STOCK_TEST_DATABASE_URL, client: null as PrismaClient | null,
  admin: vi.fn().mockResolvedValue({ user: { id: "stock-review-admin", role: "ADMIN" } }) }));
vi.mock("@/app/_lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  if (shared.url) {
    const url = new URL(shared.url);
    if (!["localhost", "127.0.0.1", "postgres"].includes(url.hostname) || !/^\/catalogue_publishing_[a-f0-9]{10}_test$/.test(url.pathname)) throw new Error("An isolated local stock test database is required");
  }
  shared.client = new PrismaClient({ datasourceUrl: shared.url ?? "postgresql://unused:unused@127.0.0.1:1/unused_test" });
  return { prisma: shared.client };
});
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin: shared.admin }));
vi.mock("@/app/_lib/session-user", () => ({ getVerifiedSessionUser: vi.fn().mockResolvedValue(null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/app/_lib/invalidate-stock", () => ({ invalidateStock: vi.fn() }));
vi.mock("@/app/_lib/order-notifications", () => ({ notifyOrderConfirmed: vi.fn(), notifyOrderDispatched: vi.fn(), notifyOrderCancelled: vi.fn() }));
vi.mock("@/app/_lib/mailer", () => ({ sendOrderConfirmationEmail: vi.fn(), sendPendingPrepaidNotificationEmail: vi.fn(), sendAdminFailureAlertEmail: vi.fn(), logMailerError: vi.fn() }));

import { createProduct, type ProductInput } from "@/app/admin/products/actions";
import { getProduct } from "@/app/_lib/admin-products";
import { getProductDetail, getProducts } from "@/app/_lib/products";
import { GET as feed } from "@/app/feed/meta-catalog.csv/route";
import { processOrder } from "@/app/checkout/actions";
import { addOrderItem, swapOrderItem, editItems, cancelOrder } from "@/app/admin/orders/actions";
import { createInventoryStock, restockInventoryStock } from "@/app/admin/inventory/structure-actions";
import { upsertPlainTshirtStock, updateDtfDesign, deletePlainTshirtStock } from "@/app/admin/inventory/actions";
import { assertProductsPublished } from "@/app/_lib/product-publication";
import { finalizeFailedPayment } from "@/app/_lib/payments/order-finalization";

const prefix = `stock-modes-${process.pid}-${Date.now()}`;
let serial = 0;
const key = () => `${prefix}-${serial++}`;
const db = () => shared.client!;
let collection: string, parentId: string, blankId: string, printId: string;
async function product(stockMode: "PLAIN" | "PRINTED_TO_ORDER" = "PLAIN") {
  const id = key();
  const input: ProductInput = { name: id, slug: id, status: "PUBLISHED", stockMode, designSlug: collection,
    inventoryProductId: parentId, dtfDesignId: stockMode === "PLAIN" ? null : printId, price: 2000, description: "Isolated stock-mode verification",
    variants: [{ color: "White", colorSlug: "white", cardImages: ["/test/card.jpg"], detailImages: ["/test/detail.jpg"], sizeStocks: [{ size: "M", plainTshirtStockId: blankId }] }] };
  expect(await createProduct(input)).toMatchObject({ success: true });
  return (await getProduct(id))!;
}
async function place(saved: Awaited<ReturnType<typeof product>>, quantity = 1, idempotencyKey = randomUUID()) {
  return processOrder({ items: [{ productId: saved.id, variantId: saved.variants[0].id, name: saved.name, price: 2000, quantity, size: "M" }],
    shippingAddress: { line1: "Isolated test", city: "Colombo", country: "Sri Lanka" }, paymentMethod: "COD", contactPhone: "+94770000000",
    guestInfo: { name: "Isolated shopper", phone: "+94770000000" }, idempotencyKey });
}
async function balances() {
  const blank = await db().plainTshirtStock.findUniqueOrThrow({ where: { id: blankId } });
  const print = await db().dtfDesign.findUniqueOrThrow({ where: { id: printId } });
  return { blank: blank.quantity, print: print.quantity };
}
async function successfulOrder(saved: Awaited<ReturnType<typeof product>>, quantity = 1) {
  const placed = await place(saved, quantity);
  expect(placed.success).toBe(true);
  if (!placed.success) throw new Error(placed.error);
  return db().order.findUniqueOrThrow({ where: { id: placed.orderId }, include: { items: true } });
}

describe.skipIf(!shared.url)("Plain sales and stock movements: PostgreSQL", () => {
  beforeAll(async () => {
    collection = key();
    await db().design.create({ data: { slug: collection, name: collection, departmentSlug: "men", hex: "#ffffff" } });
    parentId = (await db().inventoryProduct.create({ data: { name: prefix, categoryId: "inventory-oversized" } })).id;
    printId = (await db().dtfDesign.create({ data: { name: prefix, slug: key(), quantity: 10 } })).id;
    blankId = (await db().plainTshirtStock.create({ data: { inventoryProductId: parentId, color: "White", colorSlug: "white", size: "M", quantity: 20 } })).id;
  });
  beforeEach(async () => {
    shared.admin.mockReset().mockResolvedValue({ user: { id: "stock-review-admin", role: "ADMIN" } });
    await db().plainTshirtStock.update({ where: { id: blankId }, data: { quantity: 20 } });
    await db().dtfDesign.update({ where: { id: printId }, data: { quantity: 10 } });
  });
  afterAll(async () => {
    await clearIsolatedStockAudit(db(), shared.url);
    const products = await db().product.findMany({ where: { id: { startsWith: prefix } }, select: { id: true } });
    const orders = await db().order.findMany({ where: { items: { some: { productId: { in: products.map(p => p.id) } } } }, select: { id: true } });
    await db().paymentEvent.deleteMany({ where: { orderId: { in: orders.map(order => order.id) } } });
    await db().order.deleteMany({ where: { id: { in: orders.map(order => order.id) } } });
    await db().product.deleteMany({ where: { id: { startsWith: prefix } } });
    await db().plainTshirtStock.deleteMany({ where: { inventoryProductId: parentId } });
    await db().inventoryProduct.delete({ where: { id: parentId } });
    await db().design.delete({ where: { slug: collection } });
    await db().dtfDesign.delete({ where: { id: printId } });
    await db().$disconnect();
  });

  it("keeps legacy products and historical lines printed by default", async () => {
    const existing = await db().product.findFirstOrThrow({ where: { id: { not: { startsWith: prefix } } } });
    expect(existing.stockMode).toBe("PRINTED_TO_ORDER");
    const line = await db().orderItem.findFirstOrThrow({ where: { productId: { not: null } } });
    expect(line.stockMode).toBe("PRINTED_TO_ORDER");
  });
  it("publishes a plain product without any print and exposes correct public availability", async () => {
    const saved = await product();
    const detail = await getProductDetail(saved.id);
    expect(detail?.variants[0]).toMatchObject({ stockMode: "PLAIN", dtfDesignId: null });
    expect((await getProducts({ searchQuery: saved.id })).find(p => p.id === saved.id)?.variants[0].sizes).toContain("M");
    const row = (await (await feed()).text()).split("\n").find(line => line.includes(saved.id));
    expect(row).toContain('"in stock"');
  });
  it("still rejects publishing a printed product without its print", async () => {
    const saved = await product();
    await db().product.update({ where: { id: saved.id }, data: { stockMode: "PRINTED_TO_ORDER" } });
    const { assertReadyToPublish } = await import("@/app/_lib/product-publication");
    await expect(db().$transaction(tx => assertReadyToPublish(tx, saved.id))).rejects.toThrow("DTF print");
  });
  it("plain checkout deducts only its blank, snapshots its rule and records an order movement", async () => {
    const saved = await product(); const order = await successfulOrder(saved, 2);
    expect(await balances()).toEqual({ blank: 18, print: 10 });
    expect(order.items[0]).toMatchObject({ stockMode: "PLAIN", dtfDesignId: null, sku: saved.variants[0].sizeStocks[0].sku });
    const rows = await db().stockMovement.findMany({ where: { orderId: order.id } });
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ plainTshirtStockId: blankId, before: 20, after: 18, delta: -2, reason: "Online order allocation" });
  });
  it("printed checkout continues to deduct both pools", async () => {
    const order = await successfulOrder(await product("PRINTED_TO_ORDER"), 2);
    expect(await balances()).toEqual({ blank: 18, print: 8 });
    expect(order.items[0].stockMode).toBe("PRINTED_TO_ORDER");
    expect(await db().stockMovement.count({ where: { orderId: order.id } })).toBe(2);
  });
  it("checkout retries return the same order without another deduction or movement", async () => {
    const saved = await product(); const intent = randomUUID();
    const first = await place(saved, 1, intent), second = await place(saved, 1, intent);
    expect(first.success && second.success && first.orderId === second.orderId).toBe(true);
    expect(await balances()).toEqual({ blank: 19, print: 10 });
    if (first.success) expect(await db().stockMovement.count({ where: { orderId: first.orderId } })).toBe(1);
  });
  it("edits and cancels a plain historical line using its frozen rule after the product changes", async () => {
    const saved = await product(); const order = await successfulOrder(saved);
    await db().product.update({ where: { id: saved.id }, data: { stockMode: "PRINTED_TO_ORDER", dtfDesignId: printId } });
    expect(await editItems(order.id, [{ id: order.items[0].id, quantity: 3 }])).toMatchObject({ success: true });
    expect(await balances()).toEqual({ blank: 17, print: 10 });
    expect(await cancelOrder(order.id)).toMatchObject({ success: true });
    expect(await balances()).toEqual({ blank: 20, print: 10 });
  });
  it("cancels a historical printed line against both original pools after its product becomes plain", async () => {
    const saved = await product("PRINTED_TO_ORDER"); const order = await successfulOrder(saved);
    await db().product.update({ where: { id: saved.id }, data: { stockMode: "PLAIN", dtfDesignId: null } });
    expect(await cancelOrder(order.id)).toMatchObject({ success: true });
    expect(await balances()).toEqual({ blank: 20, print: 10 });
  });
  it("supports adding and swapping plain lines in admin without a print", async () => {
    const saved = await product(); const order = await successfulOrder(saved);
    expect(await addOrderItem(order.id, { productId: saved.id, variantId: saved.variants[0].id, size: "M", quantity: 2 })).toMatchObject({ success: true });
    expect(await swapOrderItem(order.id, order.items[0].id, { productId: saved.id, variantId: saved.variants[0].id, size: "M", quantity: 2 })).toMatchObject({ success: true });
    expect(await balances()).toEqual({ blank: 16, print: 10 });
  });
  it("does not oversell the last shared blank between plain and printed orders", async () => {
    const plain = await product(), printed = await product("PRINTED_TO_ORDER");
    await db().plainTshirtStock.update({ where: { id: blankId }, data: { quantity: 1 } });
    const outcomes = await Promise.all([place(plain), place(printed)]);
    expect(outcomes.filter(result => result.success)).toHaveLength(1);
    expect((await balances()).blank).toBe(0);
    expect([9, 10]).toContain((await balances()).print);
  });
  it("records an opening balance and receipt with the authenticated staff actor", async () => {
    const color = key();
    expect(await createInventoryStock({ inventoryProductId: parentId, color, size: "L", quantity: 3, operationKey: randomUUID() })).toMatchObject({ success: true });
    const blank = await db().plainTshirtStock.findFirstOrThrow({ where: { inventoryProductId: parentId, color } });
    const opening = await db().stockMovement.findFirstOrThrow({ where: { plainTshirtStockId: blank.id } });
    expect(opening).toMatchObject({ before: 0, after: 3, actorType: "ADMIN", actorId: "stock-review-admin" });
    expect(await restockInventoryStock({ id: blank.id, quantity: 2, operationKey: randomUUID() })).toMatchObject({ success: true });
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: blank.id } })).quantity).toBe(5);
  });
  it("makes a repeated receipt intent idempotent", async () => {
    const operationKey = randomUUID(); const input = { id: blankId, quantity: 3, operationKey };
    expect(await restockInventoryStock(input)).toMatchObject({ success: true });
    expect(await restockInventoryStock(input)).toMatchObject({ success: true });
    expect((await balances()).blank).toBe(23);
    expect(await db().stockMovement.count({ where: { operationKey } })).toBe(1);
    expect((await restockInventoryStock({ ...input, quantity: 4 })).success).toBe(false);
    expect((await balances()).blank).toBe(23);
  });
  it("deduplicates simultaneous receipt retries", async () => {
    const operationKey = randomUUID(); const input = { id: blankId, quantity: 2, operationKey };
    const results = await Promise.all([restockInventoryStock(input), restockInventoryStock(input)]);
    expect(results.every(result => result.success)).toBe(true);
    expect((await balances()).blank).toBe(22);
    expect(await db().stockMovement.count({ where: { operationKey } })).toBe(1);
  });
  it("rolls back every allocation and movement when a multi-line cart exhausts a shared pool", async () => {
    const a = await product(), b = await product();
    await db().plainTshirtStock.update({ where: { id: blankId }, data: { quantity: 1 } });
    const before = await db().stockMovement.count();
    const result = await processOrder({ items: [a, b].map(saved => ({ productId: saved.id, variantId: saved.variants[0].id, name: saved.name, price: 2000, quantity: 1, size: "M" })),
      shippingAddress: { line1: "Isolated test", city: "Colombo", country: "Sri Lanka" }, paymentMethod: "COD", contactPhone: "+94770000000", guestInfo: { name: "Isolated shopper", phone: "+94770000000" }, idempotencyKey: randomUUID() });
    expect(result.success).toBe(false);
    expect((await balances()).blank).toBe(1);
    expect(await db().stockMovement.count()).toBe(before);
  });
  it("requires adjustment reasons and rejects stale counts without creating movements", async () => {
    const blank = await db().plainTshirtStock.findUniqueOrThrow({ where: { id: blankId } });
    const input = { id: blankId, color: blank.color, colorSlug: blank.colorSlug, size: blank.size, quantity: 19, expectedVersion: blank.version };
    expect((await upsertPlainTshirtStock(input)).success).toBe(false);
    await restockInventoryStock({ id: blankId, quantity: 1 });
    expect((await upsertPlainTshirtStock({ ...input, reason: "Count correction" })).success).toBe(false);
    const current = await db().plainTshirtStock.findUniqueOrThrow({ where: { id: blankId } });
    const operationKey = randomUUID();
    expect(await upsertPlainTshirtStock({ ...input, expectedVersion: current.version, reason: "Damaged blank removed", operationKey })).toMatchObject({ success: true });
    expect(await db().stockMovement.findFirstOrThrow({ where: { operationKey } })).toMatchObject({ before: 21, after: 19, reason: "Damaged blank removed", actorId: "stock-review-admin" });
  });
  it("keeps movement rows immutable and retains pools with movement history", async () => {
    const row = await db().stockMovement.findFirstOrThrow({ where: { plainTshirtStockId: blankId } });
    await expect(db().stockMovement.update({ where: { id: row.id }, data: { reason: "Rewrite" } })).rejects.toThrow("immutable");
    await expect(db().stockMovement.delete({ where: { id: row.id } })).rejects.toThrow("immutable");
    const standalone = await db().plainTshirtStock.create({ data: { inventoryProductId: parentId, color: key(), colorSlug: key(), size: "unused", quantity: 1 } });
    await db().plainTshirtStock.update({ where: { id: standalone.id }, data: { quantity: 0 } });
    expect((await deletePlainTshirtStock(standalone.id)).success).toBe(false);
  });
  it("rolls back the quantity write when audit recording fails", async () => {
    await expect(db().$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('app.stock_context', ${JSON.stringify({ actorType: "INVALID", reason: "Invalid audit actor" })}, true)`;
      await tx.plainTshirtStock.update({ where: { id: blankId }, data: { quantity: { decrement: 1 } } });
    })).rejects.toThrow();
    expect((await balances()).blank).toBe(20);
  });
  it("renaming a print does not create a quantity movement", async () => {
    const count = await db().stockMovement.count({ where: { dtfDesignId: printId } });
    expect(await updateDtfDesign(printId, { name: key() })).toMatchObject({ success: true });
    expect(await db().stockMovement.count({ where: { dtfDesignId: printId } })).toBe(count);
  });
  it("rejects a stock-mode change between selection and transactional allocation", async () => {
    const saved = await product();
    await db().product.update({ where: { id: saved.id }, data: { stockMode: "PRINTED_TO_ORDER", dtfDesignId: printId } });
    await expect(db().$transaction(tx => assertProductsPublished(tx, [saved.id], [{ id: saved.id, stockMode: "PLAIN", dtfDesignId: null }]))).rejects.toThrow("Stock setup changed");
    expect(await balances()).toEqual({ blank: 20, print: 10 });
  });
  it("verified payment failure releases a plain allocation only once", async () => {
    const order = await successfulOrder(await product());
    await db().order.update({ where: { id: order.id }, data: { paymentMethod: "PAYHERE", paymentStatus: "PENDING" } });
    await finalizeFailedPayment(order.id, "PAYHERE", "isolated verified failure");
    await finalizeFailedPayment(order.id, "PAYHERE", "isolated verified failure");
    expect(await balances()).toEqual({ blank: 20, print: 10 });
    expect(await db().stockMovement.count({ where: { orderId: order.id } })).toBe(2);
  });
});
