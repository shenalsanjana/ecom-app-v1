"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { slugify, uniqueSlug, serializeSizes } from "@/app/_lib/admin-products";

export type ActionResult =
  | { success: true; slug?: string; name?: string }
  | { success: false; error: string };

function revalidate(id?: string) {
  revalidatePath("/admin/products");
  if (id) revalidatePath(`/admin/products/${id}/edit`);
  revalidateTag("catalog", "max"); // bust the storefront unstable_cache readers
}

export async function updateStock(id: string, stock: number): Promise<ActionResult> {
  await requireAdmin();
  if (!Number.isInteger(stock) || stock < 0) return { success: false, error: "Stock must be 0 or more" };
  try {
    await prisma.product.update({ where: { id }, data: { stock } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate(id);
  return { success: true };
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

const ProductInputSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  categorySlug: z.string().trim().min(1),
  price: z.number().positive(),
  originalPrice: z.number().positive().nullable().optional(),
  stock: z.number().int().min(0),
  sizes: z.array(z.string()),
  description: z.string().trim().min(1),
  image: z.string().trim().min(1),
  gallery: z.array(z.string().trim().min(1)),
});
export type ProductInput = z.infer<typeof ProductInputSchema>;

export async function createProduct(input: ProductInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ProductInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Please complete all required fields." };
  const d = parsed.data;

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
          price: d.price, originalPrice: d.originalPrice ?? null, stock: d.stock,
          sizes: serializeSizes(d.sizes), description: d.description, image: d.image,
          archived: false,
        },
      });
      if (d.gallery.length > 0) {
        await tx.productImage.createMany({
          data: d.gallery.map((url, i) => ({ productId: slug, url, sortOrder: i })),
        });
      }
    });
  } catch {
    return { success: false, error: "Could not create product (check the category exists)." };
  }
  revalidate(slug);
  return { success: true, slug };
}

export async function updateProduct(id: string, input: ProductInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ProductInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Please complete all required fields." };
  const d = parsed.data;

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return { success: false, error: "Product not found" };

  const candidateSlug = slugify(d.slug || d.name);
  if (!candidateSlug) return { success: false, error: "Name must contain letters or numbers" };

  // Field-only edit (slug unchanged): update scalars + rebuild gallery, no rename, no history row.
  if (candidateSlug === id) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data: {
            name: d.name, categorySlug: d.categorySlug,
            price: d.price, originalPrice: d.originalPrice ?? null, stock: d.stock,
            sizes: serializeSizes(d.sizes), description: d.description, image: d.image,
          },
        });
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (d.gallery.length > 0) {
          await tx.productImage.createMany({
            data: d.gallery.map((url, i) => ({ productId: id, url, sortOrder: i })),
          });
        }
      });
    } catch {
      return { success: false, error: "Could not save product (check the category exists)." };
    }
    revalidate(id);
    return { success: true, slug: id };
  }

  // Rename: resolve a unique new slug, excluding the current product itself.
  const newSlug = await uniqueSlug(
    candidateSlug,
    async (s) => (await prisma.product.findFirst({ where: { id: s, NOT: { id } } })) !== null,
  );

  try {
    await prisma.$transaction(async (tx) => {
      // ON UPDATE CASCADE moves child rows (images/reviews/wishlist/order items)
      // and existing ProductSlugHistory.currentId rows to newSlug automatically.
      await tx.product.update({
        where: { id },
        data: {
          id: newSlug, name: d.name, categorySlug: d.categorySlug,
          price: d.price, originalPrice: d.originalPrice ?? null, stock: d.stock,
          sizes: serializeSizes(d.sizes), description: d.description, image: d.image,
        },
      });
      // Cascade already moved existing gallery rows to newSlug; rebuild under newSlug.
      await tx.productImage.deleteMany({ where: { productId: newSlug } });
      if (d.gallery.length > 0) {
        await tx.productImage.createMany({
          data: d.gallery.map((url, i) => ({ productId: newSlug, url, sortOrder: i })),
        });
      }
      await tx.productSlugHistory.upsert({
        where: { oldSlug: id },
        update: { currentId: newSlug },
        create: { oldSlug: id, currentId: newSlug },
      });
      // If newSlug was itself a previously-retired slug, drop that row to avoid a self-redirect loop.
      await tx.productSlugHistory.deleteMany({ where: { oldSlug: newSlug } });
    });
  } catch {
    return { success: false, error: "Could not save product (check the category exists)." };
  }
  revalidatePath(`/admin/products/${id}/edit`); // bust the old edit URL too
  revalidate(newSlug);
  return { success: true, slug: newSlug };
}
