import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { PosSale } from "../pos";

const shared = vi.hoisted(() => ({ url: process.env.POS_TEST_DATABASE_URL, client: null as PrismaClient | null }));
vi.mock("@/app/_lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  if (shared.url) {
    const url = new URL(shared.url);
    if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/pos_test") {
      throw new Error("POS tests require the isolated local pos_test database on port 55432.");
    }
  }
  shared.client = new PrismaClient({ datasourceUrl: shared.url ?? "postgresql://unused:unused@127.0.0.1:1/unused_test" });
  return { prisma: shared.client };
});
vi.mock("@/app/_lib/session-user", () => ({ getVerifiedSessionUser: vi.fn().mockResolvedValue(null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/app/_lib/invalidate-stock", () => ({ invalidateStock: vi.fn() }));
vi.mock("@/app/_lib/order-notifications", () => ({ notifyOrderConfirmed: vi.fn() }));
vi.mock("@/app/_lib/mailer", () => ({ sendPendingPrepaidNotificationEmail: vi.fn(), sendAdminFailureAlertEmail: vi.fn(), logMailerError: vi.fn() }));

import { getPosProducts, savePosSale } from "../pos-service";
import { processOrder } from "@/app/checkout/actions";

const db = () => shared.client!;
const prefix = `pos-${randomUUID()}`;
let family: string, blank: string, print: string, collection: string;
let product: Awaited<ReturnType<typeof makeProduct>>;

async function makeProduct(stockMode: "PLAIN" | "PRINTED_TO_ORDER" = "PRINTED_TO_ORDER") {
  return db().product.create({ data: {
    id: randomUUID(), name: `${prefix} shirt`, description: "POS test", price: 1999.99,
    status: "PUBLISHED", stockMode, designSlug: collection, departmentSlug: prefix,
    inventoryProductId: family, dtfDesignId: print,
    variants: { create: { color: "White", colorSlug: "white", images: { create: { url: "/test.jpg", role: "CARD" } },
      sizeStocks: { create: { size: "M", plainTshirtStockId: blank } } } },
  }, include: { variants: { include: { sizeStocks: true } } } });
}
function sale(overrides: Partial<PosSale> = {}): PosSale {
  return { operationKey: randomUUID(), items: [{ sizeStockId: product.variants[0].sizeStocks[0].id, quantity: 2, expectedPrice: 199999 }],
    paymentMethod: "CASH", tendered: 400000, customerName: "", paymentReference: "", ...overrides };
}
async function balances() {
  return { blank: (await db().plainTshirtStock.findUniqueOrThrow({ where: { id: blank } })).quantity,
    print: (await db().dtfDesign.findUniqueOrThrow({ where: { id: print } })).quantity };
}

describe.skipIf(!shared.url)("POS with PostgreSQL", () => {
  beforeAll(async () => {
    await db().department.create({ data: { slug: prefix, name: prefix, navLabel: prefix, tileName: prefix, hex: "#fff" } });
    collection = `${prefix}-collection`;
    await db().design.create({ data: { slug: collection, name: prefix, departmentSlug: prefix, hex: "#fff" } });
    const category = await db().inventoryCategory.create({ data: { name: prefix } });
    family = (await db().inventoryProduct.create({ data: { name: prefix, categoryId: category.id } })).id;
    blank = (await db().plainTshirtStock.create({ data: { inventoryProductId: family, color: "White", colorSlug: "white", size: "M", quantity: 10 } })).id;
    print = (await db().dtfDesign.create({ data: { name: prefix, slug: prefix, quantity: 10 } })).id;
  });
  beforeEach(async () => {
    await db().plainTshirtStock.update({ where: { id: blank }, data: { quantity: 10 } });
    await db().dtfDesign.update({ where: { id: print }, data: { quantity: 10 } });
    await db().storeSettings.upsert({ where: { id: "singleton" },
      create: { id: "singleton", storeName: "POS Test", supportEmail: "pos@example.test", supportPhone: "0771234567", businessAddress: "Test", colomboDeliveryCost: 350, otherDeliveryCost: 450, freeDeliveryThreshold: 5000 },
      update: { colomboDeliveryCost: 350, otherDeliveryCost: 450, freeDeliveryThreshold: 5000 } });
    product = await makeProduct();
  });
  afterAll(async () => { await db().$disconnect(); });

  it.each([["Colombo", 35000], ["Kandy", 45000]] as const)("creates a COD delivery to %s with authoritative zone pricing and one stock deduction", async (city, expectedCharge) => {
    const input = sale({ paymentMethod: "COD", tendered: 0, customerName: "Delivery Customer",
      delivery: { carrier: "ROYAL_EXPRESS", phone: "0771234567", line1: "12 Test Road", line2: "Unit 3", city, expectedCharge } });
    const result = await savePosSale(input, "cashier-one");
    expect(await savePosSale(input, "cashier-one")).toEqual(result);
    expect(await db().order.findUniqueOrThrow({ where: { id: result.orderId } })).toMatchObject({
      status: "CONFIRMED", paymentStatus: "COD_PENDING", paymentMethod: "COD", shippingCost: expectedCharge / 100,
      total: 3999.98 + expectedCharge / 100, subtotal: 3999.98, posTendered: null,
      customerPhone: "0771234567", shippingLine1: "12 Test Road", shippingLine2: "Unit 3", shippingCity: city,
      deliveryCompany: "Royal Express", courierBookedAt: null, posPaymentReference: null,
    });
    expect(await balances()).toEqual({ blank: 8, print: 8 });
  });
  it("rejects stale delivery fees without creating an order or reserving stock", async () => {
    const input = sale({ paymentMethod: "COD", tendered: 0, customerName: "Delivery Customer",
      delivery: { carrier: "ROYAL_EXPRESS", phone: "0771234567", line1: "12 Test Road", line2: "", city: "Kandy", expectedCharge: 35000 } });
    await expect(savePosSale(input, "cashier-one")).rejects.toThrow("Delivery charges changed");
    expect(await balances()).toEqual({ blank: 10, print: 10 });
    expect(await db().order.count({ where: { idempotencyKey: `pos:${input.operationKey}` } })).toBe(0);
  });
  it("records a fully paid bank delivery with its reference and shared free delivery policy", async () => {
    const input = sale({ paymentMethod: "BANK_TRANSFER", tendered: 599997, paymentReference: "BANK-123", customerName: "Bank Customer",
      items: [{ sizeStockId: product.variants[0].sizeStocks[0].id, quantity: 3, expectedPrice: 199999 }],
      delivery: { carrier: "ROYAL_EXPRESS", phone: "0771234567", line1: "12 Test Road", line2: "", city: "Kandy", expectedCharge: 0 } });
    const result = await savePosSale(input, "cashier-one");
    expect(await db().order.findUniqueOrThrow({ where: { id: result.orderId } })).toMatchObject({
      paymentMethod: "BANK_TRANSFER", paymentStatus: "PAID", status: "CONFIRMED", shippingCost: 0,
      total: 5999.97, posPaymentReference: "BANK-123", paymentStartedAt: null,
    });
  });
  it("lists live prices, exact SKUs and the limiting stock pool", async () => {
    await db().dtfDesign.update({ where: { id: print }, data: { quantity: 3 } });
    const products = await getPosProducts(product.variants[0].sizeStocks[0].sku);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ productId: product.id, categoryName: prefix,
      price: 199999, available: 3, color: "White", size: "M" });
    await db().product.update({ where: { id: product.id }, data: { status: "DRAFT" } });
    expect(await getPosProducts(product.variants[0].sizeStocks[0].sku)).toEqual([]);
  });
  it("returns the complete catalogue when there are more than 60 size options", async () => {
    await db().variantSizeStock.createMany({ data: Array.from({ length: 65 }, (_, index) => ({
      variantId: product.variants[0].id, size: `extra-${index}`,
    })) });
    const products = await getPosProducts(prefix);
    expect(products.filter(option => option.productId === product.id)).toHaveLength(66);
  });
  it("records a paid, collected sale, frozen SKU and staff stock audit atomically", async () => {
    const input = sale();
    const result = await savePosSale(input, "cashier-one");
    expect(result.posNumber).toMatch(/^POS\d{4,}$/);
    const order = await db().order.findUniqueOrThrow({ where: { id: result.orderId }, include: { items: true } });
    expect(order).toMatchObject({ salesChannel: "POS", status: "DELIVERED", paymentStatus: "PAID", paymentMethod: "CASH",
      total: 3999.98, subtotal: 3999.98, shippingCost: 0, posTendered: 4000, cashierId: "cashier-one", courierBookedAt: null });
    expect(order.items[0]).toMatchObject({ sku: product.variants[0].sizeStocks[0].sku, stockMode: "PRINTED_TO_ORDER", quantity: 2 });
    expect(await balances()).toEqual({ blank: 8, print: 8 });
    const movements = await db().stockMovement.findMany({ where: { orderId: order.id } });
    expect(movements).toHaveLength(2);
    expect(movements.every(row => row.actorId === "cashier-one" && row.operationKey === input.operationKey && row.reason === "Shop POS sale")).toBe(true);
  });
  it("plain products consume only physical stock", async () => {
    product = await makeProduct("PLAIN");
    await savePosSale(sale(), "cashier-one");
    expect(await balances()).toEqual({ blank: 8, print: 10 });
  });
  it("retries and simultaneous duplicate submissions allocate stock once", async () => {
    const input = sale();
    const first = await savePosSale(input, "cashier-one");
    expect(await savePosSale(input, "cashier-one")).toEqual(first);
    const concurrent = sale();
    const [a, b] = await Promise.all([savePosSale(concurrent, "cashier-one"), savePosSale(concurrent, "cashier-one")]);
    expect(a).toEqual(b);
    expect(await balances()).toEqual({ blank: 6, print: 6 });
    expect(await db().stockMovement.count({ where: { operationKey: concurrent.operationKey } })).toBe(2);
  });
  it("rejects a reused key for changed details or a different cashier", async () => {
    const input = sale(); await savePosSale(input, "cashier-one");
    await expect(savePosSale({ ...input, customerName: "Changed" }, "cashier-one")).rejects.toThrow("different details");
    await expect(savePosSale(input, "cashier-two")).rejects.toThrow("different details");
    expect(await balances()).toEqual({ blank: 8, print: 8 });
  });
  it("rejects stale prices, underpayment and missing stock configuration", async () => {
    const input = sale();
    await expect(savePosSale({ ...input, items: [{ ...input.items[0], expectedPrice: 1 }] }, "cashier-one")).rejects.toThrow("price");
    await expect(savePosSale(sale({ tendered: 1 }), "cashier-one")).rejects.toThrow("cover");
    await db().variantSizeStock.update({ where: { id: input.items[0].sizeStockId }, data: { plainTshirtStockId: null } });
    await expect(savePosSale(sale(), "cashier-one")).rejects.toThrow("not configured");
    expect(await balances()).toEqual({ blank: 10, print: 10 });
  });
  it.each(["KOKO", "MINTPAY"] as const)("records %s approval and safely retries the same sale", async paymentMethod => {
    const input = sale({ paymentMethod, tendered: 399998, paymentReference: "PROVIDER-123" });
    const result = await savePosSale(input, "cashier-one");
    expect(await savePosSale(input, "cashier-one")).toEqual(result);
    expect(await db().order.findUniqueOrThrow({ where: { id: result.orderId } })).toMatchObject({
      paymentMethod, paymentMethodDisplay: `${paymentMethod === "KOKO" ? "Koko" : "Mintpay"} (in store)`,
      paymentStatus: "PAID", salesChannel: "POS", posPaymentReference: "PROVIDER-123", paymentStartedAt: null,
    });
    expect(await balances()).toEqual({ blank: 8, print: 8 });
    await expect(savePosSale(sale({ paymentMethod, tendered: 400000, paymentReference: "OTHER" }), "cashier-one")).rejects.toThrow("match");
  });
  it("records external card approval without starting a gateway payment", async () => {
    const result = await savePosSale(sale({ paymentMethod: "CARD", tendered: 399998, paymentReference: "AUTH-123" }), "cashier-one");
    expect(await db().order.findUniqueOrThrow({ where: { id: result.orderId } })).toMatchObject({
      paymentMethod: "CARD", paymentStatus: "PAID", posPaymentReference: "AUTH-123", paymentStartedAt: null,
    });
    await expect(savePosSale(sale({ paymentMethod: "CARD", tendered: 400000, paymentReference: "AUTH-456" }), "cashier-one")).rejects.toThrow("match");
  });
  it("rolls back every line and movement if a shared pool is exhausted", async () => {
    const second = await makeProduct();
    await db().plainTshirtStock.update({ where: { id: blank }, data: { quantity: 3 } });
    const input = sale();
    input.items.push({ sizeStockId: second.variants[0].sizeStocks[0].id, quantity: 2, expectedPrice: 199999 });
    input.tendered = 800000;
    await expect(savePosSale(input, "cashier-one")).rejects.toThrow("Insufficient stock");
    expect(await balances()).toEqual({ blank: 3, print: 10 });
    expect(await db().stockMovement.count({ where: { operationKey: input.operationKey } })).toBe(0);
    expect(await db().order.count({ where: { idempotencyKey: `pos:${input.operationKey}` } })).toBe(0);
  });
  it("does not oversell the last unit when a shop and online checkout race", async () => {
    await db().plainTshirtStock.update({ where: { id: blank }, data: { quantity: 1 } });
    const input = sale(); input.items[0].quantity = 1;
    const [shop, online] = await Promise.allSettled([
      savePosSale(input, "cashier-one"),
      processOrder({ items: [{ productId: product.id, variantId: product.variants[0].id, name: product.name, price: 1999.99, quantity: 1, size: "M" }],
        shippingAddress: { line1: "Test", city: "Colombo", country: "Sri Lanka" }, paymentMethod: "COD", contactPhone: "+94770000000",
        guestInfo: { name: "Test customer", phone: "+94770000000" }, idempotencyKey: randomUUID() }),
    ]);
    const successes = Number(shop.status === "fulfilled") + Number(online.status === "fulfilled" && online.value.success);
    expect(successes).toBe(1);
    expect(await balances()).toEqual({ blank: 0, print: 9 });
  });
});
