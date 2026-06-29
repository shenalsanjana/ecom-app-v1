"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { slugify, uniqueSlug } from "@/app/_lib/admin-products";

export type CategoryActionResult =
  | { success: true; slug?: string; name?: string }
  | { success: false; error: string };

const CategorySchema = z.object({
  name: z.string().trim().min(1),
  image: z.string().trim().min(1),
});

function revalidate() {
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products"); // product form's category dropdown
  revalidateTag("catalog", "max"); // bust storefront category caches (catalog/categories tags)
}

export async function createCategory(input: { name: string; image: string }): Promise<CategoryActionResult> {
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

export async function updateCategory(
  currentSlug: string,
  input: { name: string; image: string },
): Promise<CategoryActionResult> {
  await requireAdmin();
  const parsed = CategorySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Name and image are required" };
  const { name, image } = parsed.data;

  const candidateSlug = slugify(name);

  // Name/image-only update — slug is unchanged, so no rename + no history row.
  if (candidateSlug === currentSlug) {
    try {
      await prisma.category.update({ where: { slug: currentSlug }, data: { name, image } });
    } catch {
      return { success: false, error: "Could not update category." };
    }
    revalidate();
    return { success: true, slug: currentSlug, name };
  }

  // Rename: resolve a unique new slug, excluding the current category itself.
  const newSlug = await uniqueSlug(
    candidateSlug,
    async (s) =>
      (await prisma.category.findFirst({ where: { slug: s, NOT: { slug: currentSlug } } })) !== null,
  );

  try {
    await prisma.$transaction(async (tx) => {
      // ON UPDATE CASCADE moves Product.categorySlug and existing
      // CategorySlugHistory.currentSlug rows to newSlug automatically.
      await tx.category.update({ where: { slug: currentSlug }, data: { slug: newSlug, name, image } });
      await tx.categorySlugHistory.upsert({
        where: { oldSlug: currentSlug },
        update: { currentSlug: newSlug },
        create: { oldSlug: currentSlug, currentSlug: newSlug },
      });
      // If newSlug was itself a previously-retired slug, drop that row to avoid a self-redirect loop.
      await tx.categorySlugHistory.deleteMany({ where: { oldSlug: newSlug } });
    });
  } catch {
    return { success: false, error: "Could not update category." };
  }
  revalidate();
  return { success: true, slug: newSlug, name };
}

export async function deleteCategory(slug: string): Promise<CategoryActionResult> {
  await requireAdmin();
  const productCount = await prisma.product.count({ where: { categorySlug: slug } });
  if (productCount > 0) {
    return { success: false, error: "This category has products. Reassign or remove them first." };
  }
  try {
    await prisma.category.delete({ where: { slug } });
  } catch {
    return { success: false, error: "Could not delete category." };
  }
  revalidate();
  return { success: true };
}
