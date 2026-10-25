import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { PosSaleSchema, type PosSale } from "../pos";

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
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin: vi.fn().mockResolvedValue({ user: { id: "design-admin", email: "admin@example.test", role: "ADMIN" } }) }));
vi.mock("@/app/_lib/session-user", () => ({ getVerifiedSessionUser: vi.fn().mockResolvedValue(null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/app/_lib/invalidate-stock", () => ({ invalidateStock: vi.fn() }));
vi.mock("@/app/_lib/order-notifications", () => ({ notifyOrderConfirmed: vi.fn() }));
vi.mock("@/app/_lib/mailer", () => ({ sendPendingPrepaidNotificationEmail: vi.fn(), sendAdminFailureAlertEmail: vi.fn(), logMailerError: vi.fn() }));

import { getPosProducts, savePosSale } from "../pos-service";
import { setCustomDesignReceived } from "@/app/admin/orders/custom-design-actions";
import { customDesignSummary } from "../custom-design";
import { markCodCollected } from "@/app/admin/orders/actions";
import { finalizePaidPayment } from "@/app/_lib/payments/order-finalization";
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

  it("snapshots costs and original prices in POS and online orders and timestamps collected COD", async () => {
    await db().product.update({ where: { id: product.id }, data: { costPriceCents: 40000, originalPrice: 2200 } });
    const shop = await savePosSale(sale(), "cashier-one");
    const paid = await db().order.findUniqueOrThrow({ where: { id: shop.orderId }, include: { items: true } });
    expect(paid.salesPaidAt).toBeInstanceOf(Date); expect(paid.salesDateEstimated).toBe(false);
    expect(paid.items[0]).toMatchObject({ unitCostCents: 40000, salesListPriceCents: 220000, salesCategoryKey: collection, salesProductKey: product.id });
    await db().product.update({ where: { id: product.id }, data: { costPriceCents: 60000 } });
    const online = await processOrder({ items: [{ productId: product.id, variantId: product.variants[0].id, name: product.name, price: 1999.99, quantity: 1, size: "M" }],
      shippingAddress: { line1: "12 Test Road", city: "Colombo", country: "Sri Lanka" }, paymentMethod: "COD", contactPhone: "0771234567", guestInfo: { name: "Cost Customer", phone: "0771234567" }, idempotencyKey: randomUUID() });
    expect(online.success).toBe(true); if (!online.success) return;
    const pending = await db().order.findUniqueOrThrow({ where: { id: online.orderId }, include: { items: true } });
    expect(pending.salesPaidAt).toBeNull(); expect(pending.items[0].unitCostCents).toBe(60000);
    expect((await markCodCollected(online.orderId)).success).toBe(true);
    expect((await db().order.findUniqueOrThrow({ where: { id: online.orderId } })).salesPaidAt).toBeInstanceOf(Date);
    expect((await db().orderItem.findUniqueOrThrow({ where: { id: paid.items[0].id } })).unitCostCents).toBe(40000);
  });
  it("records the first verified payment date once despite repeated gateway callbacks", async () => {
    const result = await processOrder({ items: [{ productId: product.id, variantId: product.variants[0].id, name: product.name, price: 1999.99, quantity: 1, size: "M" }],
      shippingAddress: { line1: "12 Test Road", city: "Colombo", country: "Sri Lanka" }, paymentMethod: "PAYHERE", contactPhone: "0771234567", guestInfo: { name: "Paid Date", phone: "0771234567" }, idempotencyKey: randomUUID() });
    expect(result.success).toBe(true); if (!result.success) return;
    const original = await db().order.findUniqueOrThrow({ where: { id: result.orderId } }); const before = await balances();
    const evidence = { reference: randomUUID(), amount: original.total, currency: "LKR" };
    expect((await finalizePaidPayment(result.orderId, "PAYHERE", evidence)).status).toBe("success");
    const settled = await db().order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(settled.salesPaidAt).toBeInstanceOf(Date);
    expect((await finalizePaidPayment(result.orderId, "PAYHERE", evidence)).status).toBe("already_processed");
    expect((await db().order.findUniqueOrThrow({ where: { id: result.orderId } })).salesPaidAt).toEqual(settled.salesPaidAt);
    expect(await db().paymentEvent.count({ where: { orderId: result.orderId } })).toBe(1); expect(await balances()).toEqual(before);
  });
  it.each([["Colombo", 35000], ["Kandy", 45000]] as const)("creates a COD delivery to %s with authoritative zone pricing and one stock deduction", async (city, expectedCharge) => {
    const input = sale({ paymentMethod: "COD", tendered: 0, customerName: "Delivery Customer",
      delivery: { carrier: "ROYAL_EXPRESS", phone: "0771234567", line1: "12 Test Road", line2: "Unit 3", city, expectedCharge } });
    const result = await savePosSale(input, "cashier-one");
    expect(await savePosSale(input, "cashier-one")).toEqual(result);
    expect(await db().order.findUniqueOrThrow({ where: { id: result.orderId } })).toMatchObject({
      status: "CONFIRMED", paymentStatus: "COD_PENDING", paymentMethod: "COD", shippingCost: expectedCharge / 100,
      total: 3999.98 + expectedCharge / 100, subtotal: 3999.98, posTendered: null,
      customerPhone: "0771234567", alternatePhone: null, shippingLine1: "12 Test Road", shippingLine2: "Unit 3", shippingCity: city,
      deliveryCompany: "Royal Express", courierBookedAt: null, posPaymentReference: null,
    });
    expect(await balances()).toEqual({ blank: 8, print: 8 });
  });
  it("persists the secondary delivery contact and rejects changed-contact retries without deducting stock twice", async () => {
    const input = PosSaleSchema.parse(sale({ paymentMethod: "COD", tendered: 0, customerName: "Secondary Contact Customer",
      delivery: { carrier: "ROYAL_EXPRESS", phone: "0771234567", alternatePhone: "(071) 222-3333", line1: "12 Test Road", line2: "", city: "Colombo", expectedCharge: 35000 } }));
    const result = await savePosSale(input, "cashier-one");
    expect(await savePosSale(input, "cashier-one")).toEqual(result);
    expect(await db().order.findUniqueOrThrow({ where: { id: result.orderId } })).toMatchObject({
      customerPhone: "0771234567", alternatePhone: "0712223333", total: 4349.98, shippingCost: 350, paymentStatus: "COD_PENDING",
    });
    await expect(savePosSale({ ...input, delivery: { ...input.delivery!, alternatePhone: "0722223333" } }, "cashier-one")).rejects.toThrow("different details");
    expect(await balances()).toEqual({ blank: 8, print: 8 });
    expect(await db().order.count({ where: { idempotencyKey: `pos:${input.operationKey}` } })).toBe(1);
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
  it("saves item and bill adjustment snapshots atomically and retries without duplicating them", async () => {
    const input = sale({ tendered: 400000,
      items: [{ sizeStockId: product.variants[0].sizeStocks[0].id, quantity: 2, expectedPrice: 199999,
        adjustments: { charge: { mode: "FIXED", value: 10000 }, discount: { mode: "PERCENT", value: 1000 } } }],
      adjustments: { charge: { mode: "PERCENT", value: 500 }, discount: { mode: "FIXED", value: 10000 } } });
    const result = await savePosSale(input, "cashier-one");
    expect(await savePosSale(input, "cashier-one")).toEqual(result);
    const order = await db().order.findUniqueOrThrow({ where: { id: result.orderId }, include: { items: true, adjustments: true } });
    expect(order).toMatchObject({ subtotal: 3999.98, total: 3774.48, posTendered: 4000 });
    expect(order.items[0]).toMatchObject({ price: 1999.99, quantity: 2 });
    expect(order.adjustments).toHaveLength(4);
    expect(order.adjustments.map(entry => entry.amount).sort((a,b) => a-b)).toEqual([-410, -100, 100, 184.5]);
    expect(order.adjustments.some(entry => entry.label.includes(product.variants[0].sizeStocks[0].sku))).toBe(true);
    expect(await balances()).toEqual({ blank: 8, print: 8 });
    await expect(savePosSale({ ...input, adjustments: { discount: { mode: "FIXED", value: 1 } } }, "cashier-one")).rejects.toThrow("different details");
  });
  it("excludes delivery from bill percentages and retains the original free-delivery basis", async () => {
    const input = sale({ paymentMethod: "COD", tendered: 0, customerName: "Discount customer",
      adjustments: { discount: { mode: "PERCENT", value: 1000 } },
      delivery: { carrier: "ROYAL_EXPRESS", phone: "0771234567", line1: "12 Test Road", line2: "", city: "Colombo", expectedCharge: 35000 } });
    const result = await savePosSale(input, "cashier-one");
    expect(await db().order.findUniqueOrThrow({ where: { id: result.orderId } })).toMatchObject({ subtotal: 3999.98, shippingCost: 350, total: 3949.98, paymentStatus: "COD_PENDING" });
  });
  it("rejects over-discounting without stock changes, and supports zero-payment cash sales", async () => {
    await expect(savePosSale(sale({ adjustments: { discount: { mode: "FIXED", value: 999999 } } }), "cashier-one")).rejects.toThrow("discount exceeds");
    expect(await balances()).toEqual({ blank: 10, print: 10 });
    const input = sale({ tendered: 0, adjustments: { discount: { mode: "PERCENT", value: 10000 } } });
    const result = await savePosSale(input, "cashier-one");
    expect(await db().order.findUniqueOrThrow({ where: { id: result.orderId } })).toMatchObject({ total: 0, posTendered: 0, paymentStatus: "PAID" });
    await expect(savePosSale(sale({ paymentMethod: "CARD", tendered: 0, paymentReference: "INVALID-ZERO", adjustments: input.adjustments }), "cashier-one")).rejects.toThrow("zero received");
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
  it.each(["COD", "PAYHERE"] as const)("preserves custom requirements on %s orders and tracks receipt without changing stock or payment", async paymentMethod => {
    await db().product.update({ where: { id: product.id }, data: { isCustomizedDesign: true } });
    const result = await processOrder({ items: [{ productId: product.id, variantId: product.variants[0].id, name: "Untrusted name", price: 1999.99, quantity: 1, size: "M" }],
      shippingAddress: { line1: "Test", city: "Colombo 01", country: "Sri Lanka" }, paymentMethod, contactPhone: "+94770000000",
      guestInfo: { name: "Custom guest", phone: "+94770000000" }, idempotencyKey: randomUUID() });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    const saved = await db().order.findUniqueOrThrow({ where: { id: result.orderId }, include: { items: true } });
    expect(saved.items[0]).toMatchObject({ name: product.name, isCustomizedDesign: true, designReceivedAt: null });
    const stock = await balances();
    await db().product.update({ where: { id: product.id }, data: { isCustomizedDesign: false } });
    expect(await setCustomDesignReceived(saved.id, saved.items[0].id, true)).toEqual({ success: true });
    const received = await db().order.findUniqueOrThrow({ where: { id: saved.id }, include: { items: true, notesLog: true } });
    expect(received.items[0].isCustomizedDesign).toBe(true);
    expect(customDesignSummary(received.items).pending).toHaveLength(0);
    expect(received.items[0].designReceivedAt).toBeInstanceOf(Date);
    expect(received.notesLog[0].body).toContain("received via WhatsApp");
    expect(received.total).toBe(saved.total);
    expect(received.paymentStatus).toBe(saved.paymentStatus);
    expect(await balances()).toEqual(stock);
    expect(await setCustomDesignReceived(saved.id, saved.items[0].id, false)).toEqual({ success: true });
    const reset = await db().orderItem.findUniqueOrThrow({ where: { id: saved.items[0].id } });
    expect(customDesignSummary([reset]).pending).toHaveLength(1);
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
