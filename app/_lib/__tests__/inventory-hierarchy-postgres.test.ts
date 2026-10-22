import { clearIsolatedStockAudit } from "./clear-isolated-stock-audit";
// Explicit opt-in only. Never use the application's default database for tests.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const shared = vi.hoisted(() => ({ url: process.env.INVENTORY_TEST_DATABASE_URL, client: null as PrismaClient | null, requireAdmin: vi.fn() }));
vi.mock("@/app/_lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  if (shared.url) {
    const url = new URL(shared.url);
    if (!["localhost", "127.0.0.1", "postgres"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
      throw new Error("Inventory checks require a local or Docker *_test database.");
    }
  }
  shared.client = new PrismaClient({ datasourceUrl: shared.url ?? "postgresql://unused:unused@127.0.0.1:1/inventory_unused_test" });
  return { prisma: shared.client };
});
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin: shared.requireAdmin }));
vi.mock("@/app/_lib/invalidate-stock", () => ({ invalidateStock: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { assignStockParent, createInventoryStock, restockInventoryStock, saveInventoryCategory, saveInventoryProduct, deleteInventoryCategory } from "@/app/admin/inventory/structure-actions";
import { createProduct, updateProduct, type ProductInput } from "@/app/admin/products/actions";
import { upsertPlainTshirtStock } from "@/app/admin/inventory/actions";
import { acquireItemPools, restoreItemPools } from "@/app/_lib/inventory-pools";
import { buildPlainStockMap, buildDesignStockMap, stockForSize } from "@/app/_lib/variants";
import { physicalStockTotals } from "@/app/_lib/inventory-structure";

const prefix = `hierarchy-${process.pid}-${Date.now()}`;
let sequence = 0;
const key = () => `${prefix}-${sequence++}`;
const db = () => shared.client!;
let regular: string, oversized: string, sibling: string, accessoryParent: string, printId: string, designSlug: string, accessoryDesignSlug: string;

async function blank(parent: string, quantity: number, color = key()) {
  expect(await createInventoryStock({ inventoryProductId: parent, color, size: "M", quantity })).toEqual({ success: true });
  return db().plainTshirtStock.findFirstOrThrow({ where: { inventoryProductId: parent, color, size: "M" } });
}

function productInput(parent: string, color: string, colorSlug: string, stockId?: string | null): ProductInput {
  const id = key();
  return { name: id, slug: id, designSlug, inventoryProductId: parent, dtfDesignId: printId, price: 2000, description: "Isolated inventory verification",
    variants: [{ color, colorSlug, cardImages: ["/test/card.jpg"], detailImages: ["/test/detail.jpg"], sizeStocks: [{ size: "M", ...(stockId !== undefined ? { plainTshirtStockId: stockId } : {}) }] }],
  };
}

describe.skipIf(!shared.url)("Inventory hierarchy: real PostgreSQL", () => {
  beforeAll(async () => {
    const department = await db().department.create({ data: { slug: `${prefix}-department`, name: prefix, navLabel: prefix, tileName: prefix, hex: "#ffffff" } });
    const design = await db().design.create({ data: { slug: `${prefix}-category`, name: prefix, departmentSlug: department.slug, hex: "#ffffff" } });
    designSlug = design.slug;
    const accessory = await db().design.create({ data: { slug: `${prefix}-accessory`, name: prefix, departmentSlug: "accessories", hex: "#ffffff" } });
    accessoryDesignSlug = accessory.slug;
    regular = (await db().inventoryProduct.create({ data: { name: `${prefix}-regular`, categoryId: "inventory-regular" } })).id;
    oversized = (await db().inventoryProduct.create({ data: { name: `${prefix}-oversized`, categoryId: "inventory-oversized" } })).id;
    sibling = (await db().inventoryProduct.create({ data: { name: `${prefix}-shared-oversized`, categoryId: "inventory-oversized" } })).id;
    accessoryParent = (await db().inventoryProduct.create({ data: { name: `${prefix}-tote`, categoryId: "inventory-bags" } })).id;
    printId = (await db().dtfDesign.create({ data: { name: prefix, slug: prefix, quantity: 100 } })).id;
  });
  beforeEach(() => shared.requireAdmin.mockReset().mockResolvedValue({ user: { id: "isolated-admin", role: "ADMIN" } }));
  afterAll(async () => {
    await clearIsolatedStockAudit(db(), shared.url);
    await db().product.deleteMany({ where: { id: { startsWith: prefix } } });
    await db().plainTshirtStock.deleteMany({ where: { colorSlug: { startsWith: prefix } } });
    await db().inventoryProduct.deleteMany({ where: { name: { startsWith: prefix } } });
    for (let depth = 0; depth < 8; depth++) {
      const deleted = await db().inventoryCategory.deleteMany({ where: { name: { startsWith: prefix }, children: { none: {} }, products: { none: {} } } });
      if (deleted.count === 0) break;
    }
    await db().design.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db().department.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db().dtfDesign.deleteMany({ where: { slug: prefix } });
    await db().$disconnect();
  });

  it("stores identical colours/sizes separately for regular and oversized blanks", async () => {
    const color = key();
    const a = await blank(regular, 2, color);
    const b = await blank(oversized, 7, color);
    const stock = buildPlainStockMap([a, b]);
    const prints = buildDesignStockMap([{ id: printId, quantity: 100 }]);
    expect(stockForSize(a.colorSlug, "M", printId, stock, prints, a.id)).toBe(2);
    expect(stockForSize(b.colorSlug, "M", printId, stock, prints, b.id)).toBe(7);
    expect(stockForSize(a.colorSlug, "M", printId, stock, prints, null)).toBe(0);
  });

  it("links two design products to one physical balance without duplicating stock", async () => {
    const stock = await blank(oversized, 5);
    const a = productInput(oversized, stock.color, stock.colorSlug, stock.id);
    const b = productInput(oversized, stock.color, stock.colorSlug, stock.id);
    expect((await createProduct(a)).success).toBe(true);
    expect((await createProduct(b)).success).toBe(true);
    const cells = await db().variantSizeStock.findMany({ where: { variant: { productId: { in: [a.slug!, b.slug!] } } } });
    expect(cells).toHaveLength(2);
    expect(cells.every(cell => cell.plainTshirtStockId === stock.id)).toBe(true);
    const balances = await db().plainTshirtStock.findMany({ where: { id: stock.id } });
    expect(physicalStockTotals(balances)).toEqual({ entries: 1, units: 5 });
  });

  it("preserves a deliberately shared blank link when an older edit omits the binding", async () => {
    const color = key();
    await blank(oversized, 3, color);
    const sharedStock = await blank(sibling, 8, color);
    const input = productInput(oversized, color, sharedStock.colorSlug, sharedStock.id);
    expect((await createProduct(input)).success).toBe(true);
    const product = await db().product.findUniqueOrThrow({ where: { id: input.slug! }, include: { variants: true } });
    const edited = { ...input, variants: [{ ...input.variants[0], id: product.variants[0].id, sizeStocks: [{ size: "M" }] }] };
    expect((await updateProduct(product.id, edited)).success).toBe(true);
    const cell = await db().variantSizeStock.findFirstOrThrow({ where: { variantId: product.variants[0].id } });
    expect(cell.plainTshirtStockId).toBe(sharedStock.id);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: sharedStock.id } })).quantity).toBe(8);
  });

  it("rebinds to the new parent instead of retaining the old style on a parent change", async () => {
    const color = key();
    const a = await blank(regular, 3, color);
    const b = await blank(oversized, 8, color);
    const input = productInput(regular, color, a.colorSlug, a.id);
    expect((await createProduct(input)).success).toBe(true);
    const product = await db().product.findUniqueOrThrow({ where: { id: input.slug! }, include: { variants: true } });
    expect((await updateProduct(product.id, { ...input, inventoryProductId: oversized, variants: [{ ...input.variants[0], id: product.variants[0].id, sizeStocks: [{ size: "M" }] }] })).success).toBe(true);
    expect((await db().variantSizeStock.findFirstOrThrow({ where: { variantId: product.variants[0].id } })).plainTshirtStockId).toBe(b.id);
  });

  it("rejects mismatched colour/size bindings and rolls back product creation", async () => {
    const stock = await blank(oversized, 5);
    const input = productInput(oversized, "Wrong colour", "wrong-colour", stock.id);
    expect((await createProduct(input)).success).toBe(false);
    expect(await db().product.findUnique({ where: { id: input.slug! } })).toBeNull();
  });

  it("rejects a shirt blank assigned to an accessory parent", async () => {
    const stock = await blank(oversized, 5);
    const input = { ...productInput(accessoryParent, stock.color, stock.colorSlug, stock.id), designSlug: accessoryDesignSlug };
    expect((await createProduct(input)).success).toBe(false);
    expect(await db().product.findUnique({ where: { id: input.slug! } })).toBeNull();
  });

  it("preserves independent storefront categories while tracking a tote as an accessory", async () => {
    const stock = await blank(accessoryParent, 5);
    expect(stock.stockGroup).toBe("ACCESSORY");
    const input = productInput(accessoryParent, stock.color, stock.colorSlug, stock.id);
    expect((await createProduct(input)).success).toBe(true);
    expect(await db().product.findUniqueOrThrow({ where: { id: input.slug! } })).toMatchObject({ designSlug, inventoryProductId: accessoryParent });
  });

  it("rejects a regular product bound to an oversized blank of the same colour and size", async () => {
    const stock = await blank(oversized, 5);
    const input = productInput(regular, stock.color, stock.colorSlug, stock.id);
    expect((await createProduct(input)).success).toBe(false);
    expect(await db().product.findUnique({ where: { id: input.slug! } })).toBeNull();
  });

  it("requires T-shirt categories and physical products to be placed under a named style", async () => {
    expect((await saveInventoryCategory({ name: key(), parentId: "inventory-tshirts" })).success).toBe(false);
    expect((await saveInventoryProduct({ name: key(), categoryId: "inventory-tshirts" })).success).toBe(false);
  });

  it("configures a missing blank when stock is first added under its physical parent", async () => {
    const color = key();
    const input = productInput(regular, color, color, null);
    expect((await createProduct(input)).success).toBe(true);
    const row = await blank(regular, 4, color);
    const cell = await db().variantSizeStock.findFirstOrThrow({ where: { variant: { productId: input.slug! } } });
    expect(cell.plainTshirtStockId).toBe(row.id);
  });

  it("adds restock to the latest balance and rejects a stale physical count", async () => {
    const stock = await blank(regular, 5);
    await db().$transaction(tx => acquireItemPools(tx, { plainTshirtStockId: stock.id, dtfDesignId: printId, quantity: 2, name: "Test" }));
    expect(await restockInventoryStock({ id: stock.id, quantity: 4 })).toEqual({ success: true });
    expect((await upsertPlainTshirtStock({ id: stock.id, expectedVersion: stock.version, color: stock.color, colorSlug: stock.colorSlug, size: stock.size, quantity: 99, reason: "Count correction" })).success).toBe(false);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: stock.id } })).quantity).toBe(7);
  });

  it("keeps shared sales and restoration on the exact stock ID", async () => {
    const color = key();
    const a = await blank(regular, 1, color);
    const b = await blank(oversized, 2, color);
    const item = { plainTshirtStockId: a.id, dtfDesignId: printId, quantity: 1, name: "Regular" };
    await db().$transaction(tx => acquireItemPools(tx, item));
    await expect(db().$transaction(tx => acquireItemPools(tx, item))).rejects.toThrow(/Insufficient stock/);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: b.id } })).quantity).toBe(2);
    await db().$transaction(tx => restoreItemPools(tx, item));
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: a.id } })).quantity).toBe(1);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: b.id } })).quantity).toBe(2);
  });

  it("rejects category cycles, stale category edits and deletion of nonempty categories", async () => {
    const name = key();
    expect((await saveInventoryCategory({ name, parentId: "inventory-bags" })).success).toBe(true);
    const a = await db().inventoryCategory.findFirstOrThrow({ where: { name } });
    expect((await saveInventoryCategory({ name: name + "-child", parentId: a.id })).success).toBe(true);
    const b = await db().inventoryCategory.findFirstOrThrow({ where: { parentId: a.id } });
    expect((await saveInventoryCategory({ id: a.id, name, parentId: b.id, expectedVersion: 0 })).success).toBe(false);
    expect((await deleteInventoryCategory(a.id, 0)).success).toBe(false);
    expect((await saveInventoryCategory({ id: b.id, name: name + "-renamed", parentId: a.id, expectedVersion: 0 })).success).toBe(true);
    expect((await saveInventoryCategory({ id: b.id, name: name + "-stale", parentId: a.id, expectedVersion: 0 })).success).toBe(false);
  });

  it("assigns an orphan without changing its quantity and refuses duplicate-balance merging", async () => {
    const orphan = await db().plainTshirtStock.create({ data: { color: key(), colorSlug: key(), size: "M", quantity: 6 } });
    expect((await assignStockParent({ id: orphan.id, inventoryProductId: regular, expectedVersion: orphan.version })).success).toBe(true);
    expect(await db().plainTshirtStock.findUniqueOrThrow({ where: { id: orphan.id } })).toMatchObject({ id: orphan.id, quantity: 6, inventoryProductId: regular });
    const duplicate = await db().plainTshirtStock.create({ data: { color: orphan.color, colorSlug: orphan.colorSlug, size: "M", quantity: 9 } });
    expect((await assignStockParent({ id: duplicate.id, inventoryProductId: regular, expectedVersion: duplicate.version })).success).toBe(false);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: duplicate.id } })).quantity).toBe(9);
  });

  it("rejects invalid restock quantities and protects built-in category names", async () => {
    const stock = await blank(regular, 5);
    expect((await restockInventoryStock({ id: stock.id, quantity: -1 })).success).toBe(false);
    expect((await saveInventoryCategory({ id: "inventory-regular", name: "Changed", parentId: "inventory-tshirts", expectedVersion: 0 })).success).toBe(false);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: stock.id } })).quantity).toBe(5);
  });

  it("requires admin authorization before creating or changing stock and structure", async () => {
    shared.requireAdmin.mockRejectedValueOnce(new Error("Unauthorized"));
    await expect(createInventoryStock({ inventoryProductId: regular, color: key(), size: "M", quantity: 1 })).rejects.toThrow("Unauthorized");
    shared.requireAdmin.mockRejectedValueOnce(new Error("Unauthorized"));
    await expect(saveInventoryProduct({ name: key(), categoryId: "inventory-bags" })).rejects.toThrow("Unauthorized");
  });
});
