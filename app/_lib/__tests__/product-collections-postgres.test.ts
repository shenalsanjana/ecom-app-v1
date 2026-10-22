import { clearIsolatedStockAudit } from "./clear-isolated-stock-audit";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const shared = vi.hoisted(() => ({ url: process.env.COLLECTIONS_TEST_DATABASE_URL, client: null as PrismaClient | null }));
vi.mock("@/app/_lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  if (shared.url) {
    const url = new URL(shared.url);
    if (!["localhost", "127.0.0.1", "postgres"].includes(url.hostname) || !/^\/catalogue_(collections|publishing)_[a-f0-9]+_test$/.test(url.pathname)) throw new Error("An isolated local collection test database is required");
  }
  shared.client = new PrismaClient({ datasourceUrl: shared.url ?? "postgresql://unused:unused@127.0.0.1:1/unused_test" });
  return { prisma: shared.client };
});
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin: vi.fn().mockResolvedValue({ user: { role: "ADMIN" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

import { createProduct, updateProduct, archiveProduct, deleteProduct, type ProductInput } from "@/app/admin/products/actions";
import { deleteCategory, updateCategory } from "@/app/admin/categories/actions";
import { getProducts, getProductDetail } from "@/app/_lib/products";
import { getProduct, listProducts } from "@/app/_lib/admin-products";
import { getDesignMedia } from "@/app/_lib/taxonomy-media";
import { countsByDesign, countsByDepartment } from "@/app/_lib/taxonomy-counts";

const prefix = `collections-${process.pid}-${Date.now()}`;
let serial = 0;
const key = () => `${prefix}-${serial++}`;
const db = () => shared.client!;
let primary: string, extra: string, cross: string, parentId: string, printId: string, blankId: string;
const categorySlugs = new Set<string>();

async function product(additionalCollectionSlugs?: string[]) {
  const slug = key();
  const form: ProductInput = { name: slug, slug, status: "PUBLISHED", designSlug: primary, additionalCollectionSlugs,
    inventoryProductId: parentId, dtfDesignId: printId, price: 2000, description: "Isolated collection verification",
    variants: [{ color: "White", colorSlug: "white", cardImages: ["/test/card.jpg"], detailImages: ["/test/detail.jpg"], sizeStocks: [{ size: "M", plainTshirtStockId: blankId }] }] };
  expect(await createProduct(form)).toMatchObject({ success: true });
  const saved = await getProduct(slug);
  return { saved: saved!, form: { ...form, variants: saved!.variants.map(variant => ({ ...form.variants[0], id: variant.id, sizeStocks: variant.sizeStocks.map(cell => ({ id: cell.id, size: cell.size, plainTshirtStockId: cell.plainTshirtStockId })) })) } };
}

describe.skipIf(!shared.url)("Additional collections: PostgreSQL", () => {
  beforeAll(async () => {
    for (const departmentSlug of ["men", "men", "women"]) {
      const slug = key(); categorySlugs.add(slug);
      await db().design.create({ data: { slug, name: slug, departmentSlug, hex: "#ffffff" } });
    }
    [primary, extra, cross] = [...categorySlugs];
    parentId = (await db().inventoryProduct.create({ data: { name: prefix, categoryId: "inventory-oversized" } })).id;
    printId = (await db().dtfDesign.create({ data: { name: prefix, slug: key(), quantity: 100 } })).id;
    blankId = (await db().plainTshirtStock.create({ data: { inventoryProductId: parentId, color: "White", colorSlug: "white", size: "M", quantity: 20 } })).id;
  });
  afterAll(async () => {
    await clearIsolatedStockAudit(db(), shared.url);
    await db().product.deleteMany({ where: { id: { startsWith: prefix } } });
    await db().plainTshirtStock.delete({ where: { id: blankId } });
    await db().inventoryProduct.delete({ where: { id: parentId } });
    await db().design.deleteMany({ where: { slug: { in: [...categorySlugs] } } });
    await db().dtfDesign.delete({ where: { id: printId } });
    await db().$disconnect();
  });

  it("creates primary and additional placements without duplicate product, variant or stock records", async () => {
    const { saved } = await product([primary, extra, extra, cross]);
    expect(saved.designSlug).toBe(primary); expect(saved.departmentSlug).toBe("men");
    expect(saved.additionalCollections.map(link => link.designSlug).sort()).toEqual([extra, cross].sort());
    expect(saved.variants).toHaveLength(1); expect(saved.variants[0].sizeStocks[0].plainTshirtStockId).toBe(blankId);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: blankId } })).quantity).toBe(20);
  });

  it("includes memberships in store/admin filters and intersects search, archive and price constraints", async () => {
    const { saved } = await product([extra, cross]);
    expect((await getProducts({ designSlug: extra, searchQuery: saved.id })).map(row => row.id)).toEqual([saved.id]);
    expect((await getProducts({ designSlugs: [primary, extra, cross], searchQuery: saved.id })).map(row => row.id)).toEqual([saved.id]);
    expect((await getProducts({ designSlug: extra, searchQuery: saved.id, minPrice: 3000 }))).toEqual([]);
    expect((await listProducts({ category: cross, q: saved.id })).rows.map(row => row.id)).toEqual([saved.id]);
    expect((await listProducts({ category: extra, q: saved.variants[0].sizeStocks[0].sku })).rows.map(row => row.id)).toEqual([saved.id]);
    expect((await getProductDetail(saved.id))!.product.designSlug).toBe(primary);
    await archiveProduct(saved.id);
    expect(await getProducts({ designSlug: extra, searchQuery: saved.id })).toEqual([]);
    expect((await listProducts({ tab: "archived", category: extra, q: saved.id })).total).toBe(1);
  });

  it("counts each product once per collection and department, and uses its photo in extra tiles", async () => {
    const { saved } = await product([extra, cross]);
    const rows = await getProducts({ searchQuery: saved.id });
    expect(countsByDesign(rows).get(extra)).toBe(1);
    expect(countsByDepartment([{ slug: "men", designs: [{ slug: primary }, { slug: extra }] }, { slug: "women", designs: [{ slug: cross }] }], rows)).toEqual(new Map([["men", 1], ["women", 1]]));
    expect((await getDesignMedia()).get(cross)!.photos).toContain("/test/card.jpg");
  });

  it("preserves omitted memberships and removes a promoted primary in the same edit", async () => {
    const { saved, form } = await product([extra, cross]);
    const { additionalCollectionSlugs: _drop, ...legacy } = form; void _drop;
    expect((await updateProduct(saved.id, { ...legacy, designSlug: extra })).success).toBe(true);
    const after = await getProduct(saved.id);
    expect(after!.additionalCollections.map(link => link.designSlug)).toEqual([cross]);
    expect(after!.variants[0].sizeStocks).toEqual(saved.variants[0].sizeStocks);
    expect((await updateProduct(saved.id, { ...legacy, designSlug: extra, additionalCollectionSlugs: [] })).success).toBe(true);
    expect((await getProduct(saved.id))!.additionalCollections).toEqual([]);
  });

  it("rolls back the whole product edit for missing collection IDs", async () => {
    const { saved, form } = await product([extra]);
    const result = await updateProduct(saved.id, { ...form, name: "Rejected name", additionalCollectionSlugs: ["missing-collection"] });
    expect(result).toMatchObject({ success: false });
    expect(await getProduct(saved.id)).toEqual(saved);
  });

  it("cascades product URL changes while preserving sale identities and stock balances", async () => {
    const { saved, form } = await product([extra, cross]);
    const balances = await db().plainTshirtStock.findUniqueOrThrow({ where: { id: blankId } });
    const renamed = `${saved.id}-renamed`;
    expect((await updateProduct(saved.id, { ...form, slug: renamed })).success).toBe(true);
    expect((await getProduct(renamed))!.additionalCollections).toEqual(saved.additionalCollections);
    expect((await getProduct(renamed))!.variants[0].sizeStocks).toEqual(saved.variants[0].sizeStocks);
    expect(await db().plainTshirtStock.findUniqueOrThrow({ where: { id: blankId } })).toEqual(balances);
    expect(await db().productSlugHistory.findUnique({ where: { oldSlug: saved.id } })).toMatchObject({ currentId: renamed });
  });

  it("blocks deletion used only as an additional collection and names affected products", async () => {
    const slug = key(); categorySlugs.add(slug);
    await db().design.create({ data: { slug, name: slug, departmentSlug: "women", hex: "#fff" } });
    const { saved, form } = await product([slug]);
    const denied = await deleteCategory(slug);
    expect(denied.success).toBe(false);
    if (!denied.success) expect(denied.error).toContain(saved.name);
    await expect(db().design.delete({ where: { slug } })).rejects.toThrow();
    expect((await updateProduct(saved.id, { ...form, additionalCollectionSlugs: [] })).success).toBe(true);
    expect((await deleteCategory(slug)).success).toBe(true);
  });

  it("preserves membership through collection renames and department moves, without moving the primary", async () => {
    const slug = key(); categorySlugs.add(slug);
    await db().design.create({ data: { slug, name: slug, departmentSlug: "men", hex: "#fff" } });
    const { saved } = await product([slug]);
    const renamed = `${slug}-renamed`; categorySlugs.add(renamed);
    expect((await updateCategory(slug, { name: renamed, departmentSlug: "women" })).success).toBe(true);
    expect((await getProduct(saved.id))!).toMatchObject({ designSlug: primary, departmentSlug: "men", additionalCollections: [{ designSlug: renamed }] });
    expect((await getProducts({ designSlug: renamed, searchQuery: saved.id })).map(row => row.id)).toEqual([saved.id]);
    expect(await db().designSlugHistory.findUnique({ where: { oldSlug: slug } })).toMatchObject({ currentSlug: renamed });
  });

  it("cascades membership removal when a product is deleted while retaining its blank", async () => {
    const { saved } = await product([extra]);
    expect((await deleteProduct(saved.id)).success).toBe(true);
    expect(await db().productCollection.count({ where: { productId: saved.id } })).toBe(0);
    expect(await db().plainTshirtStock.findUnique({ where: { id: blankId } })).not.toBeNull();
  });
});
