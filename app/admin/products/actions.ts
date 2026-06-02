"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";

export type ActionResult =
  | { success: true; slug?: string; name?: string }
  | { success: false; error: string };

function revalidate(id?: string) {
  revalidatePath("/admin/products");
  if (id) revalidatePath(`/admin/products/${id}/edit`);
  revalidateTag("catalog"); // bust the storefront unstable_cache readers
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

import { slugify, uniqueSlug } from "@/app/_lib/admin-products";

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
  try {
    const created = await prisma.category.create({
      data: { slug, name: parsed.data.name, image: parsed.data.image },
    });
    revalidateTag("catalog");
    return { success: true, slug: created.slug, name: created.name };
  } catch {
    return { success: false, error: "Could not create category." };
  }
}
