"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { slugify, uniqueSlug } from "@/app/_lib/admin-products";

export type ActionResult = { success: true } | { success: false; error: string };

function revalidate() {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidateTag("catalog", "max"); // bust the storefront unstable_cache readers
}

const PlainStockSchema = z.object({
  color: z.string().trim().min(1),
  colorSlug: z.string().trim().min(1),
  size: z.string().trim().min(1),
  quantity: z.number().int().min(0),
});

export async function upsertPlainTshirtStock(input: {
  id?: string; color: string; colorSlug: string; size: string; quantity: number;
}): Promise<ActionResult> {
  await requireAdmin();
  const parsed = PlainStockSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Color, size and quantity are required" };
  const { color, size, quantity } = parsed.data;
  const colorSlug = slugify(parsed.data.colorSlug || color);
  if (!colorSlug) return { success: false, error: "Color must contain letters or numbers" };
  try {
    if (input.id) {
      await prisma.plainTshirtStock.update({ where: { id: input.id }, data: { color, colorSlug, size, quantity } });
    } else {
      await prisma.plainTshirtStock.create({ data: { color, colorSlug, size, quantity } });
    }
  } catch {
    return { success: false, error: "Could not save — this color+size may already exist." };
  }
  revalidate();
  return { success: true };
}

export async function deletePlainTshirtStock(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await prisma.plainTshirtStock.delete({ where: { id } });
  } catch {
    return { success: false, error: "Could not delete." };
  }
  revalidate();
  return { success: true };
}

const DesignSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().int().min(0),
});

export async function createDtfDesign(input: { name: string; quantity: number }): Promise<ActionResult> {
  await requireAdmin();
  const parsed = DesignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Name and quantity are required" };
  const baseSlug = slugify(parsed.data.name);
  if (!baseSlug) return { success: false, error: "Name must contain letters or numbers" };
  const slug = await uniqueSlug(baseSlug, async (s) => (await prisma.dtfDesign.findUnique({ where: { slug: s } })) !== null);
  try {
    await prisma.dtfDesign.create({ data: { name: parsed.data.name, slug, quantity: parsed.data.quantity } });
  } catch {
    return { success: false, error: "Could not create design." };
  }
  revalidate();
  return { success: true };
}

export async function updateDtfDesign(id: string, input: { name: string; quantity: number }): Promise<ActionResult> {
  await requireAdmin();
  const parsed = DesignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Name and quantity are required" };
  try {
    await prisma.dtfDesign.update({ where: { id }, data: { name: parsed.data.name, quantity: parsed.data.quantity } });
  } catch {
    return { success: false, error: "Could not update design." };
  }
  revalidate();
  return { success: true };
}

export async function deleteDtfDesign(id: string): Promise<ActionResult> {
  await requireAdmin();
  const productCount = await prisma.product.count({ where: { dtfDesignId: id } });
  if (productCount > 0) {
    return { success: false, error: "This design is used by products. Reassign them first." };
  }
  try {
    await prisma.dtfDesign.delete({ where: { id } });
  } catch {
    return { success: false, error: "Could not delete design." };
  }
  revalidate();
  return { success: true };
}
