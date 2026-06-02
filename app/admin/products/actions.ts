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

const CategorySchema = z.object({
  name: z.string().trim().min(1),
  image: z.string().trim().min(1),
});

export async function createCategory(input: { name: string; image: string }): Promise<ActionResult> {
  await requireAdmin();
  const parsed = CategorySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Name and image are required" };

  const slug = await uniqueSlug(
    slugify(parsed.data.name),
    async (s) => (await prisma.category.findUnique({ where: { slug: s } })) !== null,
  );
  let created;
  try {
    created = await prisma.category.create({
      data: { slug, name: parsed.data.name, image: parsed.data.image },
    });
  } catch {
    return { success: false, error: "Could not create category." };
  }
  revalidate();
  return { success: true, slug: created.slug, name: created.name };
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

  const slug = await uniqueSlug(
    slugify(d.slug || d.name),
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

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: d.name, categorySlug: d.categorySlug,
          price: d.price, originalPrice: d.originalPrice ?? null, stock: d.stock,
          sizes: serializeSizes(d.sizes), description: d.description, image: d.image,
          // id/slug intentionally NOT updated
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
  return { success: true };
}
