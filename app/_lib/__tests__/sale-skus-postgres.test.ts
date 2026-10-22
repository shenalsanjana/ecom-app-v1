import { clearIsolatedStockAudit } from "./clear-isolated-stock-audit";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const shared = vi.hoisted(() => ({ url: process.env.SALE_SKU_TEST_DATABASE_URL, client: null as PrismaClient | null }));
vi.mock("@/app/_lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  if (shared.url) {
    const url = new URL(shared.url);
    if (!["localhost", "127.0.0.1", "postgres"].includes(url.hostname) || !url.pathname.endsWith("_test")) throw new Error("An isolated local *_test database is required");
  }
  shared.client = new PrismaClient({ datasourceUrl: shared.url ?? "postgresql://unused:unused@127.0.0.1:1/unused_test" });
  return { prisma: shared.client };
});
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin: vi.fn().mockResolvedValue({ user: { role: "ADMIN" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/app/_lib/invalidate-stock", () => ({ invalidateStock: vi.fn() }));

import { createProduct, updateProduct, type ProductInput } from "@/app/admin/products/actions";
import { getProduct, listProducts } from "@/app/_lib/admin-products";
import { listInventoryHierarchy } from "@/app/_lib/admin-inventory";
import { getProductDetail } from "@/app/_lib/products";
import { acquireItemPools } from "@/app/_lib/inventory-pools";
import { addOrderItem, swapOrderItem, editItems } from "@/app/admin/orders/actions";

const prefix = `sale-skus-${process.pid}-${Date.now()}`;
let count = 0;
const key = () => `${prefix}-${count++}`;
const db = () => shared.client!;
let parentId: string, designSlug: string, printId: string, m: string, l: string;

function input(): ProductInput {
  const name = key();
  return { name, slug: name, status: "PUBLISHED", designSlug, inventoryProductId: parentId, dtfDesignId: printId, price: 2000, description: "Isolated SKU verification",
    variants: [{ color: "White", colorSlug: "white", cardImages: ["/test/card.jpg"], detailImages: ["/test/detail.jpg"], sizeStocks: [{ size: "M", plainTshirtStockId: m }, { size: "L", plainTshirtStockId: l }] }] };
}
async function product() {
  const form = input();
  expect((await createProduct(form)).success).toBe(true);
  const saved = await db().product.findUniqueOrThrow({ where: { id: form.slug! }, include: { variants: { include: { sizeStocks: { orderBy: { size: "asc" } } } } } });
  return { saved, form: { ...form, variants: [{ ...form.variants[0], id: saved.variants[0].id, sizeStocks: saved.variants[0].sizeStocks.map(cell => ({ id: cell.id, size: cell.size, plainTshirtStockId: cell.plainTshirtStockId })) }] } };
}

describe.skipIf(!shared.url)("Permanent size SKUs: PostgreSQL", () => {
  beforeAll(async () => {
    designSlug = (await db().design.create({ data: { slug: key(), name: prefix, departmentSlug: "men", hex: "#ffffff" } })).slug;
    parentId = (await db().inventoryProduct.create({ data: { name: prefix, categoryId: "inventory-oversized" } })).id;
    printId = (await db().dtfDesign.create({ data: { name: prefix, slug: key(), quantity: 100 } })).id;
    m = (await db().plainTshirtStock.create({ data: { inventoryProductId: parentId, color: "White", colorSlug: "white", size: "M", quantity: 20 } })).id;
    l = (await db().plainTshirtStock.create({ data: { inventoryProductId: parentId, color: "White", colorSlug: "white", size: "L", quantity: 20 } })).id;
  });
  beforeEach(async () => {
    await db().plainTshirtStock.updateMany({ where: { id: { in: [m, l] } }, data: { quantity: 20 } });
    await db().dtfDesign.update({ where: { id: printId }, data: { quantity: 100 } });
  });
  afterAll(async () => {
    await clearIsolatedStockAudit(db(), shared.url);
    await db().order.deleteMany({ where: { id: { startsWith: prefix } } });
    await db().product.deleteMany({ where: { id: { startsWith: prefix } } });
    await db().plainTshirtStock.deleteMany({ where: { inventoryProductId: parentId } });
    await db().inventoryProduct.delete({ where: { id: parentId } });
    await db().design.delete({ where: { slug: designSlug } });
    await db().dtfDesign.delete({ where: { id: printId } });
    await db().$disconnect();
  });

  it("preserves size IDs, SKUs, mappings and balances through a product edit and URL change", async () => {
    const { saved, form } = await product();
    const before = saved.variants[0].sizeStocks;
    expect(before.every(cell => /^DBV-\d{6,}$/.test(cell.sku))).toBe(true);
    const balances = await db().plainTshirtStock.findMany({ where: { inventoryProductId: parentId } });
    const renamed = `${saved.id}-renamed`;
    expect((await updateProduct(saved.id, { ...form, name: "Updated name", slug: renamed, price: 2100 })).success).toBe(true);
    const after = await db().variantSizeStock.findMany({ where: { variantId: saved.variants[0].id }, orderBy: { size: "asc" } });
    expect(after).toEqual(before);
    expect(await db().plainTshirtStock.findMany({ where: { inventoryProductId: parentId } })).toEqual(balances);
    expect(await db().productSlugHistory.findUnique({ where: { oldSlug: saved.id } })).toMatchObject({ currentId: renamed });
  });

  it("archives removed sizes, excludes them from actual readers, and restores their identity", async () => {
    const { saved, form } = await product();
    const removed = saved.variants[0].sizeStocks.find(cell => cell.size === "L")!;
    const keepM = { ...form, variants: [{ ...form.variants[0], sizeStocks: form.variants[0].sizeStocks.filter(cell => cell.size === "M") }] };
    expect((await updateProduct(saved.id, keepM)).success).toBe(true);
    expect(await db().variantSizeStock.findUnique({ where: { id: removed.id } })).toMatchObject({ sku: removed.sku, archived: true });
    expect((await getProduct(saved.id))!.variants[0].sizeStocks.map(cell => cell.size)).toEqual(["M"]);
    expect((await getProductDetail(saved.id))!.variants[0].sizeStocks.map(cell => cell.size)).toEqual(["M"]);
    const hierarchy = await listInventoryHierarchy();
    expect(hierarchy.products.find(parent => parent.id === parentId)!.designs.find(design => design.id === saved.id)!.variants[0].sizeStocks.map(cell => cell.size)).toEqual(["M"]);
    expect((await listProducts({ q: removed.sku })).total).toBe(0);
    expect((await updateProduct(saved.id, form)).success).toBe(true);
    expect(await db().variantSizeStock.findUnique({ where: { id: removed.id } })).toEqual(removed);
    expect((await listProducts({ q: removed.sku })).rows.map(row => row.id)).toContain(saved.id);
  });

  it("keeps different sale SKUs on two designs sharing one physical blank", async () => {
    const a = await product(), b = await product();
    const first = a.saved.variants[0].sizeStocks.find(cell => cell.size === "M")!;
    const second = b.saved.variants[0].sizeStocks.find(cell => cell.size === "M")!;
    expect(first.sku).not.toBe(second.sku);
    expect(first.plainTshirtStockId).toBe(second.plainTshirtStockId);
    await db().plainTshirtStock.update({ where: { id: m }, data: { quantity: 1 } });
    const sell = () => db().$transaction(tx => acquireItemPools(tx, { plainTshirtStockId: m, dtfDesignId: printId, quantity: 1, name: "Last shared blank" }));
    const attempts = await Promise.allSettled([sell(), sell()]);
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: m } })).quantity).toBe(0);
    expect((await db().dtfDesign.findUniqueOrThrow({ where: { id: printId } })).quantity).toBe(99);
  });

  it("rejects another product's colour and size IDs without changing existing rows", async () => {
    const a = await product(), b = await product();
    const foreign = b.saved.variants[0];
    expect((await updateProduct(a.saved.id, { ...a.form, variants: [{ ...a.form.variants[0], id: foreign.id }] })).success).toBe(false);
    expect((await updateProduct(a.saved.id, { ...a.form, variants: [{ ...a.form.variants[0], sizeStocks: [{ ...a.form.variants[0].sizeStocks[0], id: foreign.sizeStocks[0].id }] }] })).success).toBe(false);
    expect(await db().variantSizeStock.findMany({ where: { variantId: a.saved.variants[0].id }, orderBy: { size: "asc" } })).toEqual(a.saved.variants[0].sizeStocks);
  });

  it("snapshots the selected sale SKU for admin additions, swaps and size changes", async () => {
    const { saved, form } = await product();
    const variant = saved.variants[0];
    const small = variant.sizeStocks.find(cell => cell.size === "M")!;
    const large = variant.sizeStocks.find(cell => cell.size === "L")!;
    const order = await db().order.create({ data: {
      id: key(), customerPhone: "+94700000000", shippingLine1: "Isolated test", shippingCity: "Colombo", shippingCountry: "Sri Lanka",
      subtotal: 0, shippingCost: 0, total: 0, paymentMethod: "COD", paymentMethodDisplay: "Cash on delivery", paymentStatus: "PENDING",
    } });
    expect((await addOrderItem(order.id, { productId: saved.id, variantId: variant.id, size: "M", quantity: 1 })).success).toBe(true);
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect(line).toMatchObject({ sku: small.sku, plainTshirtStockId: m });
    expect((await swapOrderItem(order.id, line.id, { productId: saved.id, variantId: variant.id, size: "L", quantity: 1 })).success).toBe(true);
    expect(await db().orderItem.findUnique({ where: { id: line.id } })).toMatchObject({ sku: large.sku, plainTshirtStockId: l });
    expect((await editItems(order.id, [{ id: line.id, size: "M" }])).success).toBe(true);
    expect(await db().orderItem.findUnique({ where: { id: line.id } })).toMatchObject({ sku: small.sku, plainTshirtStockId: m });
    expect((await updateProduct(saved.id, { ...form, variants: [{ ...form.variants[0], sizeStocks: form.variants[0].sizeStocks.filter(cell => cell.size === "L") }] })).success).toBe(true);
    expect((await addOrderItem(order.id, { productId: saved.id, variantId: variant.id, size: "M", quantity: 1 })).success).toBe(false);
    // A quantity-only historical edit must not replace the saved SKU.
    expect((await editItems(order.id, [{ id: line.id, quantity: 2 }])).success).toBe(true);
    expect(await db().orderItem.findUnique({ where: { id: line.id } })).toMatchObject({ sku: small.sku, plainTshirtStockId: m, quantity: 2 });
  });

  it("prevents direct identity rewrites and old-style size deletion", async () => {
    const { saved } = await product();
    const cell = saved.variants[0].sizeStocks[0];
    await expect(db().variantSizeStock.update({ where: { id: cell.id }, data: { sku: "DBV-999999" } })).rejects.toThrow();
    await expect(db().variantSizeStock.delete({ where: { id: cell.id } })).rejects.toThrow();
    expect(await db().variantSizeStock.findUnique({ where: { id: cell.id } })).toEqual(cell);
  });

  it("rejects reserved legacy colour codes and duplicate sizes atomically", async () => {
    const a = input();
    expect((await createProduct({ ...a, variants: [{ ...a.variants[0], sku: "dbv-123456" }] })).success).toBe(false);
    expect((await createProduct({ ...a, variants: [{ ...a.variants[0], sizeStocks: [a.variants[0].sizeStocks[0], a.variants[0].sizeStocks[0]] }] })).success).toBe(false);
    expect(await db().product.findUnique({ where: { id: a.slug! } })).toBeNull();
  });

  it("uses a concurrency-safe sequence and does not truncate seven-digit codes", async () => {
    await db().$executeRawUnsafe("SELECT setval('public.sale_sku_seq', 999999)");
    const results = await Promise.all([db().$queryRaw<{ sku: string }[]>`SELECT next_sale_sku() AS sku`, db().$queryRaw<{ sku: string }[]>`SELECT next_sale_sku() AS sku`]);
    expect(new Set(results.map(rows => rows[0].sku)).size).toBe(2);
    expect(results.flat().every(row => /^DBV-100000[01]$/.test(row.sku))).toBe(true);
  });
});
