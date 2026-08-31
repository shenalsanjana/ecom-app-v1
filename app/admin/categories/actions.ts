"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { slugify, uniqueSlug } from "@/app/_lib/admin-products";
import { tintForSlug } from "@/app/_lib/taxonomy-tint";

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

  const baseSlug = slugify(parsed.data.name);
  if (!baseSlug) return { success: false, error: "Name must contain letters or numbers" };
  const slug = await uniqueSlug(
    baseSlug,
    async (s) => (await prisma.design.findUnique({ where: { slug: s } })) !== null,
  );
  let created;
  try {
    // `Design` gained two required columns that this form does not yet collect.
    // `departmentSlug` defaults to "women" — every design in the catalog today
    // is a women's graphic tee. `hex` comes from tintForSlug, which returns the
    // canonical tint for a known slug and a stable palette colour for any other,
    // so a newly created design never renders as a blank tile.
    created = await prisma.design.create({
      data: {
        slug,
        name: parsed.data.name,
        image: parsed.data.image,
        departmentSlug: "women",
        hex: tintForSlug(slug),
      },
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
  if (!candidateSlug) return { success: false, error: "Name must contain letters or numbers" };

  // Name/image-only update — slug is unchanged, so no rename + no history row.
  if (candidateSlug === currentSlug) {
    try {
      await prisma.design.update({ where: { slug: currentSlug }, data: { name, image } });
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
      (await prisma.design.findFirst({ where: { slug: s, NOT: { slug: currentSlug } } })) !== null,
  );

  try {
    await prisma.$transaction(async (tx) => {
      // ON UPDATE CASCADE moves Product.designSlug and existing
      // DesignSlugHistory.currentSlug rows to newSlug automatically.
      await tx.design.update({ where: { slug: currentSlug }, data: { slug: newSlug, name, image } });
      await tx.designSlugHistory.upsert({
        where: { oldSlug: currentSlug },
        update: { currentSlug: newSlug },
        create: { oldSlug: currentSlug, currentSlug: newSlug },
      });
      // If newSlug was itself a previously-retired slug, drop that row to avoid a self-redirect loop.
      await tx.designSlugHistory.deleteMany({ where: { oldSlug: newSlug } });
    });
  } catch {
    return { success: false, error: "Could not update category." };
  }
  revalidate();
  return { success: true, slug: newSlug, name };
}

export async function deleteCategory(slug: string): Promise<CategoryActionResult> {
  await requireAdmin();
  const productCount = await prisma.product.count({ where: { designSlug: slug } });
  if (productCount > 0) {
    return { success: false, error: "This category has products. Reassign or remove them first." };
  }
  try {
    await prisma.design.delete({ where: { slug } });
  } catch {
    return { success: false, error: "Could not delete category." };
  }
  revalidate();
  return { success: true };
}
