// Opt-in real PostgreSQL checks. Never use DATABASE_URL or an existing live DB.
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const shared = vi.hoisted(() => ({ url: process.env.STAGE1_TEST_DATABASE_URL, client: null as PrismaClient | null }));
vi.mock("@/app/_lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  if (shared.url) {
    const url = new URL(shared.url);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.endsWith("_test") || !url.searchParams.get("schema")?.startsWith("stage1_test")) {
      throw new Error("Integration tests require a local *_test database and an isolated stage1_test* schema.");
    }
  }
  shared.client = new PrismaClient({ datasourceUrl: shared.url ?? "postgresql://unused:unused@127.0.0.1:1/ecom_stage1_test" });
  return { prisma: shared.client };
});
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin: vi.fn(async () => ({ user: { id: "integration-admin" } })) }));
vi.mock("@/app/_lib/invalidate-stock", () => ({ invalidateStock: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/order-notifications", () => ({ notifyOrderConfirmed: vi.fn(), notifyOrderCancelled: vi.fn(), notifyOrderDispatched: vi.fn() }));
vi.mock("@/app/_lib/mailer", () => ({ sendOrderConfirmationEmail: vi.fn(), logMailerError: vi.fn() }));
vi.mock("@/app/checkout/book-courier", () => ({ bookCourierAndNotify: vi.fn() }));

import { cancelOrder } from "@/app/admin/orders/actions";
import { upsertPlainTshirtStock } from "@/app/admin/inventory/actions";
import { acquireItemPools } from "@/app/_lib/inventory-pools";
import { finalizePaidPayment, finalizeFailedPayment } from "@/app/_lib/payments/order-finalization";

const prefix = `stage1-${process.pid}-${Date.now()}`;
let sequence = 0;
const db = () => shared.client!;

async function fixture(quantity = 1, designQuantity = quantity) {
  const key = `${prefix}-${sequence++}`;
  const plain = await db().plainTshirtStock.create({ data: { color: key, colorSlug: key, size: "M", quantity } });
  const design = await db().dtfDesign.create({ data: { name: key, slug: key, quantity: designQuantity } });
  return { plainTshirtStockId: plain.id, dtfDesignId: design.id, quantity: 1, name: "Integration Tee" };
}

async function makeOrder() {
  const item = await fixture();
  await db().$transaction((tx) => acquireItemPools(tx, item));
  return db().order.create({ data: {
    id: `${prefix}-order-${sequence++}`, customerPhone: "+94770000000", guestName: "Integration",
    shippingLine1: "Test", shippingCity: "Colombo", shippingCountry: "Sri Lanka",
    subtotal: 2000, shippingCost: 350, total: 2350, paymentMethod: "KOKO", paymentMethodDisplay: "Koko", paymentStatus: "PENDING",
    items: { create: { name: item.name, size: "M", price: 2000, quantity: 1, plainTshirtStockId: item.plainTshirtStockId, dtfDesignId: item.dtfDesignId } },
  }, include: { items: true } });
}

describe.skipIf(!shared.url)("Stage 01 real PostgreSQL transactions", () => {
  afterEach(async () => {
    await db().paymentEvent.deleteMany({ where: { orderId: { startsWith: prefix } } });
    await db().order.deleteMany({ where: { id: { startsWith: prefix } } });
    await db().plainTshirtStock.deleteMany({ where: { colorSlug: { startsWith: prefix } } });
    await db().dtfDesign.deleteMany({ where: { slug: { startsWith: prefix } } });
  });
  afterAll(async () => { await db().$disconnect(); });

  it("allows only one cancellation to restore stock", async () => {
    const order = await makeOrder();
    // Concurrent requests inside ONE test exercise the actual row lock/CAS.
    const results = await Promise.all([cancelOrder(order.id), cancelOrder(order.id)]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: order.items[0].plainTshirtStockId! } })).quantity).toBe(1);
    expect((await db().dtfDesign.findUniqueOrThrow({ where: { id: order.items[0].dtfDesignId! } })).quantity).toBe(1);
  });
  it("does not leave an automatically failed order paid with released stock", async () => {
    const order = await makeOrder();
    await Promise.all([finalizePaidPayment(order.id, "KOKO"), finalizeFailedPayment(order.id, "KOKO", "failed")]);
    const updated = await db().order.findUniqueOrThrow({ where: { id: order.id } });
    const stock = await db().plainTshirtStock.findUniqueOrThrow({ where: { id: order.items[0].plainTshirtStockId! } });
    if (updated.paymentStatus === "PAID") {
      expect(updated.status).toBe("PENDING");
      expect(stock.quantity).toBe(0);
    } else {
      expect(updated.status).toBe("CANCELLED");
      expect(updated.paymentReviewRequired).toBe(true);
      expect(stock.quantity).toBe(1);
    }
  });
  it("does not oversell a last unit shared by two purchases", async () => {
    const item = await fixture();
    const results = await Promise.allSettled([
      db().$transaction((tx) => acquireItemPools(tx, item)), db().$transaction((tx) => acquireItemPools(tx, item)),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: item.plainTshirtStockId } })).quantity).toBe(0);
  });
  it("rejects a physical count based on a version preceding a sale", async () => {
    const item = await fixture(3);
    const before = await db().plainTshirtStock.findUniqueOrThrow({ where: { id: item.plainTshirtStockId } });
    await db().$transaction((tx) => acquireItemPools(tx, item));
    const result = await upsertPlainTshirtStock({ id: before.id, color: before.color, colorSlug: before.colorSlug, size: before.size, quantity: 3, expectedVersion: before.version });
    expect(result.success).toBe(false);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: before.id } })).quantity).toBe(2);
  });
  it("rolls back the first pool and its version if the second pool cannot supply an item", async () => {
    const item = await fixture(1, 0);
    await expect(db().$transaction((tx) => acquireItemPools(tx, item))).rejects.toThrow(/Insufficient stock/);
    expect(await db().plainTshirtStock.findUniqueOrThrow({ where: { id: item.plainTshirtStockId } })).toMatchObject({ quantity: 1, version: 0 });
  });
  it("protects restoration references at the database boundary", async () => {
    const order = await makeOrder();
    await expect(db().plainTshirtStock.delete({ where: { id: order.items[0].plainTshirtStockId! } })).rejects.toMatchObject({ code: "P2003" });
    await expect(db().dtfDesign.delete({ where: { id: order.items[0].dtfDesignId! } })).rejects.toMatchObject({ code: "P2003" });
  });
});
