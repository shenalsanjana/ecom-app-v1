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

// Design.image is optional — a tint-tiled design carries no photo. Empty,
// whitespace, null and absent all persist as NULL rather than "", so the
// null-checks that pick the placeholder swatch stay honest.
const categoryFields = {
  name: z.string().trim().min(1),
  image: z.string().trim().nullish().transform((v) => v || null),
};

// Create: an absent department means "women". The quick-create inside the
// product form's category dropdown carries no department field, and every
// design predating this form did belong to Women.
const CategoryCreateSchema = z.object({
  ...categoryFields,
  departmentSlug: z.string().trim().min(1).default("women"),
});

// Update: the department must be explicit. Defaulting it here would silently
// re-file a men's design under Women whenever a caller omitted the field.
const CategoryUpdateSchema = z.object({
  ...categoryFields,
  departmentSlug: z.string().trim().min(1),
});

function revalidate() {
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products"); // product form's category dropdown
  revalidateTag("catalog", "max"); // bust storefront category caches (catalog/categories tags)
}

export async function createCategory(
  input: { name: string; image?: string | null; departmentSlug?: string },
): Promise<CategoryActionResult> {
  await requireAdmin();
  const parsed = CategoryCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Name is required" };

  const baseSlug = slugify(parsed.data.name);
  if (!baseSlug) return { success: false, error: "Name must contain letters or numbers" };
  const slug = await uniqueSlug(
    baseSlug,
    async (s) => (await prisma.design.findUnique({ where: { slug: s } })) !== null,
  );
  let created;
  try {
    // `hex` is not collected by the form: tintForSlug returns the canonical tint
    // for a known slug and a stable palette colour for any other, so a newly
    // created design never renders as a blank tile.
    created = await prisma.design.create({
      data: {
        slug,
        name: parsed.data.name,
        image: parsed.data.image,
        departmentSlug: parsed.data.departmentSlug,
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
  input: { name: string; image?: string | null; departmentSlug: string },
): Promise<CategoryActionResult> {
  await requireAdmin();
  const parsed = CategoryUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Name and department are required" };
  const { name, image, departmentSlug } = parsed.data;

  const candidateSlug = slugify(name);
  if (!candidateSlug) return { success: false, error: "Name must contain letters or numbers" };

  // Field-only update — slug is unchanged, so no rename + no history row.
  if (candidateSlug === currentSlug) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.design.update({
          where: { slug: currentSlug },
          data: { name, image, departmentSlug },
        });
        // Product.departmentSlug is denormalised from Design.departmentSlug.
        // This action is the other write path to that invariant (the first is
        // departmentForDesign in app/admin/products/actions.ts), so re-stamp
        // every product under the design — otherwise moving a design from
        // Women to Men leaves its products filed under Women forever.
        await tx.product.updateMany({
          where: { designSlug: currentSlug },
          data: { departmentSlug },
        });
      });
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
      await tx.design.update({
        where: { slug: currentSlug },
        data: { slug: newSlug, name, image, departmentSlug },
      });
      // Same denormalisation invariant as the field-only branch above. The
      // cascade has already moved Product.designSlug to newSlug by now, so
      // match on the NEW slug — `currentSlug` would select nothing.
      await tx.product.updateMany({
        where: { designSlug: newSlug },
        data: { departmentSlug },
      });
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
