"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { slugify, uniqueSlug } from "@/app/_lib/admin-products";
import { inventoryRoot, inventorySection } from "@/app/_lib/inventory-structure";
import { reconcileSizeStocks, SaleIdentityError } from "@/app/_lib/reconcile-size-stocks";
import { syncAdditionalCollections, CollectionMembershipError } from "@/app/_lib/product-collections";
import { assertReadyToPublish, PublicationError } from "@/app/_lib/product-publication";

export type ActionResult =
  | { success: true; slug?: string; name?: string }
  | { success: false; error: string };

// Product writes rebuild every variant + its images + size cells inside one
// interactive transaction. On a pooled/Accelerate connection each statement is a
// network round-trip, so the default 5s interactive-transaction limit is tight
// for multi-color products — raise it so a valid edit can't be killed mid-flight.
const TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 };

function revalidate(id?: string) {
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/categories");
  revalidatePath("/");
  revalidatePath("/feed/meta-catalog.csv");
  if (id) revalidatePath(`/products/${id}`);
  if (id) revalidatePath(`/admin/products/${id}/edit`);
  revalidateTag("catalog", { expire: 0 }); // bust the storefront unstable_cache readers
}

export async function archiveProduct(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await prisma.product.update({ where: { id }, data: { archived: true } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate(id);
  return { success: true };
}

export async function unarchiveProduct(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await prisma.$transaction(async tx => {
      const product = await tx.product.update({ where: { id }, data: { archived: false } });
      if (product.status === "PUBLISHED") await assertReadyToPublish(tx, id);
    }, TX_OPTIONS);
  } catch (error) {
    return { success: false, error: error instanceof PublicationError ? error.message : "Something went wrong. Please try again." };
  }
  revalidate(id);
  return { success: true };
}

export async function unpublishProduct(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await prisma.product.update({ where: { id }, data: { status: "DRAFT" } });
  } catch {
    return { success: false, error: "Could not unpublish the product. Please try again." };
  }
  revalidate(id);
  return { success: true };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  await requireAdmin();
  // Hard delete is always permitted. Order line items reference the product via
  // an ON DELETE SET NULL FK, so a product with order history can be removed
  // without losing the historical record (the line item keeps its own snapshot).
  try {
    await prisma.product.delete({ where: { id } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate(id);
  return { success: true };
}

const VariantSizeInputSchema = z.object({
  id: z.string().min(1).optional(),
  size: z.string().trim().min(1),
  plainTshirtStockId: z.string().trim().min(1).nullable().optional(),
});

const VariantInputSchema = z.object({
  id: z.string().optional(),
  color: z.string().trim().min(1),
  colorSlug: z.string().trim().min(1),
  swatchHex: z.string().trim().nullable().optional(),
  sku: z.string().trim().nullable().optional(),
  price: z.number().positive().nullable().optional(),
  originalPrice: z.number().positive().nullable().optional(),
  cardImages: z.array(z.string().trim().min(1)),
  detailImages: z.array(z.string().trim().min(1)),
  sizeStocks: z.array(VariantSizeInputSchema),
});

const ProductInputSchema = z.object({
  name: z.string().trim().min(1),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  stockMode: z.enum(["PRINTED_TO_ORDER", "PLAIN"]).optional(),
  isCustomizedDesign: z.boolean().optional(),
  slug: z.string().trim().optional(),
  designSlug: z.string().trim().min(1),
  additionalCollectionSlugs: z.array(z.string().trim().min(1)).max(100).optional(),
  price: z.number().positive(),
  originalPrice: z.number().positive().nullable().optional(),
  description: z.string().trim().default(""),
  dtfDesignId: z.string().trim().min(1).nullable().default(null),
  inventoryProductId: z.string().trim().min(1).nullable().optional(),
  variants: z.array(VariantInputSchema).default([]),
});
export type VariantInput = z.infer<typeof VariantInputSchema>;
export type ProductInput = z.infer<typeof ProductInputSchema>;

class InventoryBindingError extends Error {}

async function bindStock(
  tx: Prisma.TransactionClient, parentId: string | null,
  variants: VariantInput[], existingProductId?: string,
): Promise<VariantInput[]> {
  // Compatibility for legacy callers and fixtures. Unassigned records are the
  // only ones allowed to use the old colour/size lookup during this transition.
  if (!parentId && !variants.some(v => v.sizeStocks.some(s => s.plainTshirtStockId !== undefined))) return variants;
  const categories = await tx.inventoryCategory.findMany();
  let expectedGroup: "ACCESSORY" | "PLAIN_TSHIRT" | null = null;
  let expectedSection: string | null = null;
  if (parentId) {
    const parent = await tx.inventoryProduct.findUnique({ where: { id: parentId } });
    if (!parent) throw new InventoryBindingError("Choose an existing inventory parent product.");
    const root = inventoryRoot(categories, parent.categoryId);
    if (root?.systemKey !== "accessories" && root?.systemKey !== "tshirts") throw new InventoryBindingError("Choose an inventory parent under T-Shirts or Accessories.");
    expectedGroup = root.systemKey === "accessories" ? "ACCESSORY" : "PLAIN_TSHIRT";
    expectedSection = inventorySection(categories, parent.categoryId);
    if (!expectedSection) throw new InventoryBindingError("Choose an inventory parent under a T-shirt style or Accessories.");
  }
  const previous = existingProductId ? await tx.variantSizeStock.findMany({
    where: { variant: { productId: existingProductId } },
    select: { variantId: true, size: true, plainTshirtStockId: true },
  }) : [];
  const ids = [...new Set([
    ...variants.flatMap(v => v.sizeStocks.flatMap(s => s.plainTshirtStockId ? [s.plainTshirtStockId] : [])),
    ...previous.flatMap(s => s.plainTshirtStockId ? [s.plainTshirtStockId] : []),
  ])];
  const stock = await tx.plainTshirtStock.findMany({ where: { OR: [{ inventoryProductId: parentId }, { id: { in: ids } }] }, include: { inventoryProduct: { select: { categoryId: true } } } });
  return variants.map(variant => ({ ...variant, sizeStocks: variant.sizeStocks.map(cell => {
    const colorSlug = slugify(variant.colorSlug || variant.color);
    let id = cell.plainTshirtStockId;
    if (id === undefined) {
      const old = previous.find(s => s.variantId === variant.id && s.size === cell.size);
      const pinned = stock.find(row => row.id === old?.plainTshirtStockId && row.colorSlug === colorSlug && row.size === cell.size);
      id = pinned?.id ?? stock.find(row => row.inventoryProductId === parentId && row.colorSlug === colorSlug && row.size === cell.size)?.id ?? null;
    }
    if (id) {
      const row = stock.find(row => row.id === id);
      if (!row || row.colorSlug !== colorSlug || row.size !== cell.size) throw new InventoryBindingError("Each size must use a blank with the same colour and size.");
      // A design may deliberately use another parent's physical blank, but
      // accessories and apparel must not be bound to each other's stock.
      if (expectedGroup && row.stockGroup !== expectedGroup) throw new InventoryBindingError("The selected blank belongs to a different inventory group.");
      if (expectedSection && row.inventoryProduct && inventorySection(categories, row.inventoryProduct.categoryId) !== expectedSection) throw new InventoryBindingError("Choose a blank from the same T-shirt style as the inventory parent.");
    }
    return { ...cell, plainTshirtStockId: id ?? null };
  }) }));
}

// Product.departmentSlug is denormalised from the product's design so that
// department listings are a single indexed read. The form only picks a design,
// so every write resolves the department from it and keeps the two in step —
// otherwise re-assigning a product to a design in another department would
// leave it filed under the old one.
async function departmentForDesign(designSlug: string): Promise<string | null> {
  const design = await prisma.design.findUnique({
    where: { slug: designSlug },
    select: { departmentSlug: true },
  });
  return design?.departmentSlug ?? null;
}

// Reject duplicate colorSlugs or duplicate non-empty SKUs within one product,
// so the DB unique constraints surface as a friendly message, not a 500.
function variantConflict(d: ProductInput): string | null {
  const slugs = new Set<string>();
  const skus = new Set<string>();
  for (const v of d.variants) {
    const cs = slugify(v.colorSlug || v.color);
    if (!cs) return "Each color needs a name";
    if (slugs.has(cs)) return `Duplicate color "${v.color}"`;
    slugs.add(cs);
    const sku = v.sku?.trim();
    if (sku) {
      if (/^DBV-/i.test(sku)) return "DBV- codes are reserved for automatically generated size SKUs.";
      if (skus.has(sku)) return `Duplicate SKU "${sku}"`;
      skus.add(sku);
    }
    const sizes = v.sizeStocks.map(cell => cell.size);
    if (new Set(sizes).size !== sizes.length) return `Duplicate size in "${v.color}"`;
  }
  return null;
}

// Writes all variants for a product inside an open transaction (delete-and-
// recreate, mirroring the old gallery rebuild). Assumes the Product row exists.
async function writeVariants(
  tx: Prisma.TransactionClient,
  productId: string,
  variants: VariantInput[],
): Promise<void> {
  await tx.productVariant.deleteMany({ where: { productId } });
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const variant = await tx.productVariant.create({
      data: {
        productId,
        color: v.color,
        colorSlug: slugify(v.colorSlug || v.color),
        swatchHex: v.swatchHex?.trim() || null,
        sku: v.sku?.trim() || null,
        price: v.price ?? null,
        originalPrice: v.originalPrice ?? null,
        sortOrder: i,
        archived: false,
      },
    });
    await tx.variantImage.createMany({
      data: [
        ...v.cardImages.map((url, j) => ({ variantId: variant.id, url, role: "CARD", sortOrder: j })),
        ...v.detailImages.map((url, j) => ({ variantId: variant.id, url, role: "DETAIL", sortOrder: j })),
      ],
    });
    await tx.variantSizeStock.createMany({
      data: v.sizeStocks.map((s) => ({ variantId: variant.id, size: s.size, ...(s.plainTshirtStockId !== undefined ? { plainTshirtStockId: s.plainTshirtStockId } : {}) })),
    });
  }
}

// UPDATE path: preserve ProductVariant row identity so OrderItem.variantId
// (onDelete: SetNull) survives edits. Existing variants are updated in place;
// new ones created; removed ones ARCHIVED (not deleted) so historical order
// stock-restore still resolves their (variantId,size) cell. Size identities
// and SKUs are permanent; only gallery images are rebuilt.
async function reconcileVariants(
  tx: Prisma.TransactionClient,
  productId: string,
  variants: VariantInput[],
): Promise<void> {
  // Only ACTIVE variants are managed by the edit form; archived rows are left alone.
  const existing = await tx.productVariant.findMany({
    where: { productId, archived: false },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((v) => v.id));
  if (variants.some(variant => variant.id && !existingIds.has(variant.id))) {
    throw new SaleIdentityError("A colour changed or belongs to another product. Reload the product and try again.");
  }

  // Release every active variant's unique slots first (colorSlug + sku) so the
  // reassignments below can't collide mid-transaction on the immediate unique
  // checks — handles color renames, swaps, and remove+re-add of the same color.
  for (const { id } of existing) {
    await tx.productVariant.update({ where: { id }, data: { colorSlug: `tmp-${id}`, sku: null } });
  }

  const keptIds = new Set<string>();
  const imageRows: Prisma.VariantImageCreateManyInput[] = [];
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const data = {
      color: v.color,
      colorSlug: slugify(v.colorSlug || v.color),
      swatchHex: v.swatchHex?.trim() || null,
      sku: v.sku?.trim() || null,
      price: v.price ?? null,
      originalPrice: v.originalPrice ?? null,
      sortOrder: i,
      archived: false,
    };
    let variantId: string;
    if (v.id && existingIds.has(v.id)) {
      await tx.productVariant.update({ where: { id: v.id }, data });
      variantId = v.id;
    } else {
      const created = await tx.productVariant.create({ data: { productId, ...data } });
      variantId = created.id;
    }
    keptIds.add(variantId);
    v.cardImages.forEach((url, j) => imageRows.push({ variantId, url, role: "CARD", sortOrder: j }));
    v.detailImages.forEach((url, j) => imageRows.push({ variantId, url, role: "DETAIL", sortOrder: j }));
    await reconcileSizeStocks(tx, variantId, v.sizeStocks);
  }

  // Gallery rows can be rebuilt; offered sizes above retain their IDs and SKUs.
  const keptIdList = [...keptIds];
  await tx.variantImage.deleteMany({ where: { variantId: { in: keptIdList } } });
  if (imageRows.length) await tx.variantImage.createMany({ data: imageRows });

  // Archive removed variants; free their unique colorSlug/sku so those values
  // can be reused by a future variant without a unique-constraint collision.
  const removed = [...existingIds].filter((id) => !keptIds.has(id));
  for (const rid of removed) {
    await tx.productVariant.update({
      where: { id: rid },
      data: { archived: true, colorSlug: `archived-${rid}`, sku: null },
    });
  }
}

export async function createProduct(input: ProductInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ProductInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Please complete all required fields." };
  const d = parsed.data;

  const conflict = variantConflict(d);
  if (conflict) return { success: false, error: conflict };

  const baseSlug = slugify(d.slug || d.name);
  if (!baseSlug) return { success: false, error: "Name must contain letters or numbers" };
  const slug = await uniqueSlug(
    baseSlug,
    async (s) => (await prisma.product.findUnique({ where: { id: s } })) !== null,
  );

  const departmentSlug = await departmentForDesign(d.designSlug);
  if (!departmentSlug) return { success: false, error: "Could not create product (unknown category)." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.create({
        data: {
          id: slug, name: d.name, designSlug: d.designSlug, departmentSlug, dtfDesignId: d.dtfDesignId,
          price: d.price, originalPrice: d.originalPrice ?? null,
          description: d.description, archived: false, status: d.status ?? "DRAFT", stockMode: d.stockMode ?? "PRINTED_TO_ORDER",
          isCustomizedDesign: d.isCustomizedDesign ?? false,
          ...(d.inventoryProductId !== undefined ? { inventoryProductId: d.inventoryProductId } : {}),
        },
      });
      await syncAdditionalCollections(tx, slug, d.designSlug, d.additionalCollectionSlugs);
      await writeVariants(tx, slug, await bindStock(tx, d.inventoryProductId ?? null, d.variants));
      if (d.status === "PUBLISHED") await assertReadyToPublish(tx, slug);
    }, TX_OPTIONS);
  } catch (e) {
    if (e instanceof InventoryBindingError || e instanceof SaleIdentityError || e instanceof CollectionMembershipError || e instanceof PublicationError) return { success: false, error: e.message };
    console.error("createProduct failed", { slug, designSlug: d.designSlug, error: e });
    return { success: false, error: "Could not create product (check the category and that SKUs are unique)." };
  }
  revalidate(slug);
  return { success: true, slug };
}

export async function updateProduct(id: string, input: ProductInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ProductInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Please complete all required fields." };
  const d = parsed.data;

  const conflict = variantConflict(d);
  if (conflict) return { success: false, error: conflict };

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return { success: false, error: "Product not found" };

  const candidateSlug = slugify(d.slug || d.name);
  if (!candidateSlug) return { success: false, error: "Name must contain letters or numbers" };

  const departmentSlug = await departmentForDesign(d.designSlug);
  if (!departmentSlug) return { success: false, error: "Could not save the product (unknown category)." };

  // Field-only edit (slug unchanged): update scalars + rebuild variants.
  if (candidateSlug === id) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data: {
            name: d.name, designSlug: d.designSlug, departmentSlug, dtfDesignId: d.dtfDesignId,
            price: d.price, originalPrice: d.originalPrice ?? null,
            description: d.description,
            ...(d.status !== undefined ? { status: d.status } : {}),
            ...(d.stockMode !== undefined ? { stockMode: d.stockMode } : {}),
            ...(d.isCustomizedDesign !== undefined ? { isCustomizedDesign: d.isCustomizedDesign } : {}),
            ...(d.inventoryProductId !== undefined ? { inventoryProductId: d.inventoryProductId } : {}),
          },
        });
        await syncAdditionalCollections(tx, id, d.designSlug, d.additionalCollectionSlugs);
        await reconcileVariants(tx, id, await bindStock(tx, d.inventoryProductId === undefined ? existing.inventoryProductId ?? null : d.inventoryProductId, d.variants, d.inventoryProductId === undefined || d.inventoryProductId === existing.inventoryProductId ? id : undefined));
        if ((d.status ?? existing.status) === "PUBLISHED") await assertReadyToPublish(tx, id);
      }, TX_OPTIONS);
    } catch (e) {
      if (e instanceof InventoryBindingError || e instanceof SaleIdentityError || e instanceof CollectionMembershipError || e instanceof PublicationError) return { success: false, error: e.message };
      console.error("updateProduct failed (field-only)", { id, designSlug: d.designSlug, error: e });
      return { success: false, error: "Could not save the product. Please try again — if you changed a SKU, make sure it isn't already used by another product." };
    }
    revalidate(id);
    return { success: true, slug: id };
  }

  // Rename branch: resolve a unique new slug, excluding this product.
  const newSlug = await uniqueSlug(
    candidateSlug,
    async (s) => (await prisma.product.findFirst({ where: { id: s, NOT: { id } } })) !== null,
  );
  try {
    await prisma.$transaction(async (tx) => {
      // ON UPDATE CASCADE moves child rows (variants/reviews/wishlist/order items) to newSlug.
      await tx.product.update({
        where: { id },
        data: {
          id: newSlug, name: d.name, designSlug: d.designSlug, departmentSlug, dtfDesignId: d.dtfDesignId,
          price: d.price, originalPrice: d.originalPrice ?? null,
          description: d.description,
          ...(d.status !== undefined ? { status: d.status } : {}),
            ...(d.stockMode !== undefined ? { stockMode: d.stockMode } : {}),
            ...(d.isCustomizedDesign !== undefined ? { isCustomizedDesign: d.isCustomizedDesign } : {}),
          ...(d.inventoryProductId !== undefined ? { inventoryProductId: d.inventoryProductId } : {}),
        },
      });
      await syncAdditionalCollections(tx, newSlug, d.designSlug, d.additionalCollectionSlugs);
      await reconcileVariants(tx, newSlug, await bindStock(tx, d.inventoryProductId === undefined ? existing.inventoryProductId ?? null : d.inventoryProductId, d.variants, d.inventoryProductId === undefined || d.inventoryProductId === existing.inventoryProductId ? newSlug : undefined));
      if ((d.status ?? existing.status) === "PUBLISHED") await assertReadyToPublish(tx, newSlug);
      await tx.productSlugHistory.upsert({
        where: { oldSlug: id },
        update: { currentId: newSlug },
        create: { oldSlug: id, currentId: newSlug },
      });
      await tx.productSlugHistory.deleteMany({ where: { oldSlug: newSlug } });
    }, TX_OPTIONS);
  } catch (e) {
    if (e instanceof InventoryBindingError || e instanceof SaleIdentityError || e instanceof CollectionMembershipError || e instanceof PublicationError) return { success: false, error: e.message };
    console.error("updateProduct failed (rename)", { id, newSlug, designSlug: d.designSlug, error: e });
    return { success: false, error: "Could not save the product. Please try again — if you changed a SKU, make sure it isn't already used by another product." };
  }
  revalidatePath(`/admin/products/${id}/edit`);
  revalidate(newSlug);
  return { success: true, slug: newSlug };
}
