"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { slugify, uniqueSlug } from "@/app/_lib/admin-products";

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
  if (id) revalidatePath(`/admin/products/${id}/edit`);
  revalidateTag("catalog", "max"); // bust the storefront unstable_cache readers
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
    await prisma.product.update({ where: { id }, data: { archived: false } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
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
  size: z.string().trim().min(1),
  stock: z.number().int().min(0),
});

const VariantInputSchema = z.object({
  id: z.string().optional(),
  color: z.string().trim().min(1),
  colorSlug: z.string().trim().min(1),
  swatchHex: z.string().trim().nullable().optional(),
  sku: z.string().trim().nullable().optional(),
  price: z.number().positive().nullable().optional(),
  originalPrice: z.number().positive().nullable().optional(),
  cardImages: z.array(z.string().trim().min(1)).min(1, "Each color needs at least one card image"),
  detailImages: z.array(z.string().trim().min(1)).min(1, "Each color needs at least one detail image"),
  sizeStocks: z.array(VariantSizeInputSchema).min(1, "Each color needs at least one size"),
});

const ProductInputSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  categorySlug: z.string().trim().min(1),
  price: z.number().positive(),
  originalPrice: z.number().positive().nullable().optional(),
  description: z.string().trim().min(1),
  variants: z.array(VariantInputSchema).min(1, "Add at least one color variant"),
});
export type VariantInput = z.infer<typeof VariantInputSchema>;
export type ProductInput = z.infer<typeof ProductInputSchema>;

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
      if (skus.has(sku)) return `Duplicate SKU "${sku}"`;
      skus.add(sku);
    }
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
      data: v.sizeStocks.map((s) => ({ variantId: variant.id, size: s.size, stock: s.stock })),
    });
  }
}

// UPDATE path: preserve ProductVariant row identity so OrderItem.variantId
// (onDelete: SetNull) survives edits. Existing variants are updated in place;
// new ones created; removed ones ARCHIVED (not deleted) so historical order
// stock-restore still resolves their (variantId,size) cell. Images and size
// cells have no incoming order FK, so they're safe to rebuild.
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

  // Release every active variant's unique slots first (colorSlug + sku) so the
  // reassignments below can't collide mid-transaction on the immediate unique
  // checks — handles color renames, swaps, and remove+re-add of the same color.
  for (const { id } of existing) {
    await tx.productVariant.update({ where: { id }, data: { colorSlug: `tmp-${id}`, sku: null } });
  }

  const keptIds = new Set<string>();
  const imageRows: Prisma.VariantImageCreateManyInput[] = [];
  const sizeRows: Prisma.VariantSizeStockCreateManyInput[] = [];
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
    v.sizeStocks.forEach((s) => sizeRows.push({ variantId, size: s.size, stock: s.stock }));
  }

  // Rebuild every kept variant's images + size cells with one delete + one insert
  // apiece, rather than two writes per variant. This keeps the interactive
  // transaction short: a product with N colors dropped from ~4N round-trips to 4,
  // so edits no longer risk exceeding the interactive-transaction time limit.
  const keptIdList = [...keptIds];
  await tx.variantImage.deleteMany({ where: { variantId: { in: keptIdList } } });
  await tx.variantSizeStock.deleteMany({ where: { variantId: { in: keptIdList } } });
  if (imageRows.length) await tx.variantImage.createMany({ data: imageRows });
  if (sizeRows.length) await tx.variantSizeStock.createMany({ data: sizeRows });

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

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.create({
        data: {
          id: slug, name: d.name, categorySlug: d.categorySlug,
          price: d.price, originalPrice: d.originalPrice ?? null,
          description: d.description, archived: false,
        },
      });
      await writeVariants(tx, slug, d.variants);
    }, TX_OPTIONS);
  } catch (e) {
    console.error("createProduct failed", { slug, categorySlug: d.categorySlug, error: e });
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

  // Field-only edit (slug unchanged): update scalars + rebuild variants.
  if (candidateSlug === id) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data: {
            name: d.name, categorySlug: d.categorySlug,
            price: d.price, originalPrice: d.originalPrice ?? null,
            description: d.description,
          },
        });
        await reconcileVariants(tx, id, d.variants);
      }, TX_OPTIONS);
    } catch (e) {
      console.error("updateProduct failed (field-only)", { id, categorySlug: d.categorySlug, error: e });
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
          id: newSlug, name: d.name, categorySlug: d.categorySlug,
          price: d.price, originalPrice: d.originalPrice ?? null,
          description: d.description,
        },
      });
      await reconcileVariants(tx, newSlug, d.variants);
      await tx.productSlugHistory.upsert({
        where: { oldSlug: id },
        update: { currentId: newSlug },
        create: { oldSlug: id, currentId: newSlug },
      });
      await tx.productSlugHistory.deleteMany({ where: { oldSlug: newSlug } });
    }, TX_OPTIONS);
  } catch (e) {
    console.error("updateProduct failed (rename)", { id, newSlug, categorySlug: d.categorySlug, error: e });
    return { success: false, error: "Could not save the product. Please try again — if you changed a SKU, make sure it isn't already used by another product." };
  }
  revalidatePath(`/admin/products/${id}/edit`);
  revalidate(newSlug);
  return { success: true, slug: newSlug };
}
