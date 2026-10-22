import { clearIsolatedStockAudit } from "./clear-isolated-stock-audit";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const shared = vi.hoisted(() => ({ url: process.env.PUBLICATION_TEST_DATABASE_URL, client: null as PrismaClient | null }));
vi.mock("@/app/_lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  if (shared.url) {
    const url = new URL(shared.url);
    if (!["localhost", "127.0.0.1", "postgres"].includes(url.hostname) || !/^\/catalogue_publishing_[a-f0-9]+_test$/.test(url.pathname)) throw new Error("An isolated local publication test database is required");
  }
  shared.client = new PrismaClient({ datasourceUrl: shared.url ?? "postgresql://unused:unused@127.0.0.1:1/unused_test" });
  return { prisma: shared.client };
});
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin: vi.fn().mockResolvedValue({ user: { role: "ADMIN" } }) }));
vi.mock("@/app/_lib/session-user", () => ({ getVerifiedSessionUser: vi.fn().mockResolvedValue(null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/app/_lib/invalidate-stock", () => ({ invalidateStock: vi.fn() }));
vi.mock("@/app/_lib/order-notifications", () => ({ notifyOrderConfirmed: vi.fn(), notifyOrderDispatched: vi.fn(), notifyOrderCancelled: vi.fn() }));
vi.mock("@/app/_lib/mailer", () => ({ sendOrderConfirmationEmail: vi.fn(), sendPendingPrepaidNotificationEmail: vi.fn(), sendAdminFailureAlertEmail: vi.fn(), logMailerError: vi.fn() }));

import { createProduct, updateProduct, unpublishProduct, archiveProduct, unarchiveProduct, type ProductInput } from "@/app/admin/products/actions";
import { getProduct, listProducts } from "@/app/_lib/admin-products";
import { getProducts, getProductById, getProductDetail, getFeaturedProducts, getDealsProducts, searchProducts, getWishlistProductCards, getProductReviews, getReviewHistogram, getProductSlugRedirect } from "@/app/_lib/products";
import { getDesignMedia } from "@/app/_lib/taxonomy-media";
import { getWishlistCount, getWishlistProductIds } from "@/app/_lib/wishlist";
import { searchProductsForOrder, addOrderItem, swapOrderItem, editItems } from "@/app/admin/orders/actions";
import { processOrder } from "@/app/checkout/actions";
import { assertProductsPublished } from "@/app/_lib/product-publication";
import { GET as feed } from "@/app/feed/meta-catalog.csv/route";

const prefix = `publication-${process.pid}-${Date.now()}`;
let serial = 0;
const key = () => `${prefix}-${serial++}`;
const db = () => shared.client!;
let primary: string, extra: string, parentId: string, printId: string, blankId: string, userId: string;

function input(): ProductInput {
  const name = key();
  return { name, slug: name, designSlug: primary, additionalCollectionSlugs: [extra], inventoryProductId: parentId, dtfDesignId: printId, price: 2000, originalPrice: 2200, description: "Isolated publication verification",
    variants: [{ color: "White", colorSlug: "white", cardImages: ["/test/card.jpg"], detailImages: ["/test/detail.jpg"], sizeStocks: [{ size: "M", plainTshirtStockId: blankId }] }] };
}
async function product(status?: "DRAFT" | "PUBLISHED") {
  const form = { ...input(), status };
  expect(await createProduct(form)).toMatchObject({ success: true });
  const saved = (await getProduct(form.slug!))!;
  return { saved, form: { ...form, variants: saved.variants.map(variant => ({ ...form.variants[0], id: variant.id, sizeStocks: variant.sizeStocks.map(cell => ({ id: cell.id, size: cell.size, plainTshirtStockId: cell.plainTshirtStockId })) })) } };
}
async function order() {
  return db().order.create({ data: { id: key(), customerPhone: "+94700000000", shippingLine1: "Isolated check", shippingCity: "Colombo", shippingCountry: "Sri Lanka", subtotal: 0, shippingCost: 0, total: 0, paymentMethod: "COD", paymentMethodDisplay: "Cash on delivery", paymentStatus: "COD_PENDING" } });
}
async function balances() {
  return { blank: await db().plainTshirtStock.findUniqueOrThrow({ where: { id: blankId } }), print: await db().dtfDesign.findUniqueOrThrow({ where: { id: printId } }) };
}

describe.skipIf(!shared.url)("Product publication: PostgreSQL", () => {
  beforeAll(async () => {
    primary = key(); extra = key();
    await db().design.create({ data: { slug: primary, name: primary, departmentSlug: "men", hex: "#ffffff" } });
    await db().design.create({ data: { slug: extra, name: extra, departmentSlug: "women", hex: "#ffffff" } });
    parentId = (await db().inventoryProduct.create({ data: { name: prefix, categoryId: "inventory-oversized" } })).id;
    printId = (await db().dtfDesign.create({ data: { name: prefix, slug: key(), quantity: 20 } })).id;
    blankId = (await db().plainTshirtStock.create({ data: { inventoryProductId: parentId, color: "White", colorSlug: "white", size: "M", quantity: 20 } })).id;
    userId = (await db().user.create({ data: { name: prefix } })).id;
  });
  beforeEach(async () => {
    await db().plainTshirtStock.update({ where: { id: blankId }, data: { quantity: 20 } });
    await db().dtfDesign.update({ where: { id: printId }, data: { quantity: 20 } });
  });
  afterAll(async () => {
    await clearIsolatedStockAudit(db(), shared.url);
    await db().order.deleteMany({ where: { id: { startsWith: prefix } } });
    await db().product.deleteMany({ where: { id: { startsWith: prefix } } });
    await db().user.delete({ where: { id: userId } });
    await db().plainTshirtStock.delete({ where: { id: blankId } });
    await db().inventoryProduct.delete({ where: { id: parentId } });
    await db().design.deleteMany({ where: { slug: { in: [primary, extra] } } });
    await db().dtfDesign.delete({ where: { id: printId } });
    await db().$disconnect();
  });

  it("saves a minimal draft and defaults direct database inserts to draft", async () => {
    const form = { ...input(), description: "", dtfDesignId: null, inventoryProductId: null, variants: [] };
    expect((await createProduct(form)).success).toBe(true);
    expect(await getProduct(form.slug!)).toMatchObject({ status: "DRAFT", variants: [], dtfDesignId: null });
    const id = key();
    expect(await db().product.create({ data: { id, name: id, designSlug: primary, departmentSlug: "men", price: 2000, description: "" } })).toMatchObject({ status: "DRAFT" });
  });

  it("rejects missing draft basics without creating rows", async () => {
    for (const changes of [{ name: "" }, { price: 0 }, { designSlug: "" }]) {
      const form = { ...input(), ...changes };
      expect((await createProduct(form)).success).toBe(false);
      expect(await getProduct(form.slug!)).toBeNull();
    }
  });

  it("hides drafts from direct/public readers, extra collections, tiles, feeds, reviews and wishlists", async () => {
    const { saved } = await product();
    await db().review.create({ data: { productId: saved.id, authorName: "Isolated reviewer", rating: 5, body: "Review verification", approved: true } });
    await db().wishlistItem.create({ data: { productId: saved.id, userId } });
    expect(await getProductById(saved.id)).toBeNull(); expect(await getProductDetail(saved.id)).toBeNull();
    for (const read of [() => getProducts({ designSlug: extra }), () => searchProducts(saved.id), () => getFeaturedProducts(1000), () => getDealsProducts(1000), () => getWishlistProductCards([saved.id])]) expect((await read()).map(row => row.id)).not.toContain(saved.id);
    expect(await getProductReviews(saved.id, 5)).toEqual([]);
    expect(Object.values(await getReviewHistogram(saved.id)).every(count => count === 0)).toBe(true);
    const media = await getDesignMedia();
    expect(media.has(primary)).toBe(false); expect(media.has(extra)).toBe(false);
    expect((await (await feed()).text()).includes(saved.id)).toBe(false);
    expect(await getWishlistCount(userId)).toBe(0); expect((await getWishlistProductIds(userId)).has(saved.id)).toBe(false);
    expect((await listProducts({ tab: "draft", q: saved.id })).rows.map(row => row.id)).toEqual([saved.id]);
  });

  it.each(["description", "family", "print", "colours", "card", "detail", "sizes", "blank"])("blocks publishing incomplete %s and rolls back the whole edit", async missing => {
    const { saved, form } = await product();
    const incomplete: ProductInput = { ...form, status: "PUBLISHED", name: "Rejected name" };
    if (missing === "description") incomplete.description = "";
    if (missing === "family") incomplete.inventoryProductId = null;
    if (missing === "print") incomplete.dtfDesignId = null;
    if (missing === "colours") incomplete.variants = [];
    if (missing === "card") incomplete.variants = [{ ...form.variants[0], cardImages: [] }];
    if (missing === "detail") incomplete.variants = [{ ...form.variants[0], detailImages: [] }];
    if (missing === "sizes") incomplete.variants = [{ ...form.variants[0], sizeStocks: [] }];
    if (missing === "blank") incomplete.variants = [{ ...form.variants[0], sizeStocks: [{ ...form.variants[0].sizeStocks[0], plainTshirtStockId: null }] }];
    const before = await balances();
    expect((await updateProduct(saved.id, incomplete)).success).toBe(false);
    expect(await getProduct(saved.id)).toEqual(saved);
    expect(await balances()).toEqual(before);
  });

  it("publishes complete products even at zero stock, retaining size identity and collections", async () => {
    const { saved, form } = await product();
    await db().plainTshirtStock.update({ where: { id: blankId }, data: { quantity: 0 } });
    await db().dtfDesign.update({ where: { id: printId }, data: { quantity: 0 } });
    const before = await balances();
    expect((await updateProduct(saved.id, { ...form, status: "PUBLISHED" })).success).toBe(true);
    const after = (await getProduct(saved.id))!;
    expect(after.status).toBe("PUBLISHED"); expect(after.variants[0].sizeStocks).toEqual(saved.variants[0].sizeStocks);
    expect(after.additionalCollections).toEqual(saved.additionalCollections);
    expect((await getProducts({ designSlug: extra })).map(row => row.id)).toContain(saved.id);
    expect((await getProductDetail(saved.id))!.variants[0].sizeStocks).toHaveLength(1);
    expect(await balances()).toEqual(before);
  });

  it("preserves publication when an older caller omits status and rejects incomplete published edits", async () => {
    const { saved, form } = await product("PUBLISHED");
    const { status: _drop, ...legacy } = form; void _drop;
    expect((await updateProduct(saved.id, { ...legacy, name: "Updated published name" })).success).toBe(true);
    expect((await getProduct(saved.id))!.status).toBe("PUBLISHED");
    expect((await updateProduct(saved.id, { ...legacy, variants: [] })).success).toBe(false);
    expect((await getProduct(saved.id))!.variants[0].sizeStocks).toEqual(saved.variants[0].sizeStocks);
  });

  it("unpublishes without changing stock, size SKUs, collection links or order snapshots", async () => {
    const { saved } = await product("PUBLISHED"); const current = await order();
    const choice = { productId: saved.id, variantId: saved.variants[0].id, size: "M", quantity: 1 };
    expect((await addOrderItem(current.id, choice)).success).toBe(true);
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: current.id } });
    const before = await balances();
    expect((await unpublishProduct(saved.id)).success).toBe(true);
    expect(await balances()).toEqual(before);
    expect(await db().orderItem.findUnique({ where: { id: line.id } })).toEqual(line);
    expect((await getProduct(saved.id))!.variants[0].sizeStocks).toEqual(saved.variants[0].sizeStocks);
    expect(await searchProductsForOrder(saved.name)).toEqual([]);
    expect((await addOrderItem(current.id, choice)).success).toBe(false);
    expect((await swapOrderItem(current.id, line.id, choice)).success).toBe(false);
    // Existing order fulfilment and stock correction use saved references.
    expect((await editItems(current.id, [{ id: line.id, quantity: 2 }])).success).toBe(true);
    expect((await db().orderItem.findUniqueOrThrow({ where: { id: line.id } })).sku).toBe(line.sku);
  });

  it("rejects old carts and direct variant IDs for a draft without allocating stock", async () => {
    const { saved } = await product(); const before = await balances();
    const result = await processOrder({ items: [{ productId: saved.id, variantId: saved.variants[0].id, name: saved.name, price: saved.price, size: "M", quantity: 1 }], shippingAddress: { line1: "Isolated check", city: "Colombo", country: "Sri Lanka" }, paymentMethod: "COD", contactPhone: "+94770000000", guestInfo: { name: "Isolated shopper", phone: "+94770000000" } });
    expect(result.success).toBe(false); expect(await balances()).toEqual(before);
    await expect(db().$transaction(tx => assertProductsPublished(tx, [saved.id]))).rejects.toThrow(/no longer available/);
  });

  it("serializes new-sale publication checks with an in-flight unpublish", async () => {
    const { saved } = await product("PUBLISHED");
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const hiding = db().$transaction(async tx => { await tx.product.update({ where: { id: saved.id }, data: { status: "DRAFT" } }); entered(); await gate; }, { timeout: 5000 });
    await ready;
    try {
      await expect(db().$transaction(async tx => { await tx.$executeRaw`SET LOCAL lock_timeout = '150ms'`; await assertProductsPublished(tx, [saved.id]); })).rejects.toThrow(/lock timeout/);
    } finally { release(); await hiding; }
    await expect(db().$transaction(tx => assertProductsPublished(tx, [saved.id]))).rejects.toThrow(/no longer available/);
  });

  it("keeps archiving independent from publication and retains redirects only for public products", async () => {
    const { saved, form } = await product("PUBLISHED");
    expect((await archiveProduct(saved.id)).success).toBe(true);
    expect((await getProduct(saved.id))!.status).toBe("PUBLISHED"); expect(await getProductDetail(saved.id)).toBeNull();
    expect((await unarchiveProduct(saved.id)).success).toBe(true);
    expect(await getProductDetail(saved.id)).not.toBeNull();
    await unpublishProduct(saved.id); await archiveProduct(saved.id); await unarchiveProduct(saved.id);
    expect((await getProduct(saved.id))!.status).toBe("DRAFT"); expect(await getProductDetail(saved.id)).toBeNull();
    const renamed = saved.id + "-renamed";
    expect((await updateProduct(saved.id, { ...form, status: "DRAFT", slug: renamed })).success).toBe(true);
    expect(await getProductSlugRedirect(saved.id)).toBeNull();
    expect((await updateProduct(renamed, { ...form, slug: renamed, status: "PUBLISHED" })).success).toBe(true);
    expect(await getProductSlugRedirect(saved.id)).toBe(renamed);
  });
});
