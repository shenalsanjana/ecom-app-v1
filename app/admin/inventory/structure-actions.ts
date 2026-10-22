"use server";

import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { invalidateStock } from "@/app/_lib/invalidate-stock";
import { categoryMoveError, inventoryRoot, inventorySection } from "@/app/_lib/inventory-structure";
import { slugify } from "@/app/_lib/product-helpers";
import { writeStaffStock, StockWriteError, type StockWriteIntent } from "@/app/_lib/stock-movements";
import type { ActionResult } from "./actions";

const CategorySchema = z.object({
  id: z.string().min(1).optional(), name: z.string().trim().min(1).max(120),
  parentId: z.string().min(1), expectedVersion: z.number().int().nonnegative().optional(),
});
const ParentSchema = z.object({
  id: z.string().min(1).optional(), name: z.string().trim().min(1).max(160),
  categoryId: z.string().min(1), expectedVersion: z.number().int().nonnegative().optional(),
});

export async function saveInventoryCategory(input: z.infer<typeof CategorySchema>): Promise<ActionResult> {
  await requireAdmin();
  const parsed = CategorySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Enter a name and choose a parent category." };
  const data = parsed.data;
  try {
    await prisma.$transaction(async tx => {
      const categories = await tx.inventoryCategory.findMany();
      if (!inventoryRoot(categories, data.parentId)) throw new Error("Choose an existing parent category.");
      if (!inventorySection(categories, data.parentId)) throw new Error("Choose Regular, Oversized or Oversized Raglan as the T-shirt parent category.");
      if (data.id) {
        const error = categoryMoveError(categories, data.id, data.parentId);
        if (error) throw new Error(error);
        if (data.expectedVersion === undefined) throw new Error("Refresh inventory before editing this category.");
        const saved = await tx.inventoryCategory.updateMany({
          where: { id: data.id, version: data.expectedVersion, systemKey: null },
          data: { name: data.name, parentId: data.parentId, version: { increment: 1 } },
        });
        if (saved.count !== 1) throw new Error("Category changed. Refresh inventory and try again.");
      } else {
        await tx.inventoryCategory.create({ data: { name: data.name, parentId: data.parentId } });
      }
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const code = (error as { code?: string }).code;
    return { success: false, error: code ? "Could not save. The name may already exist or the structure changed; refresh and try again." : (error as Error).message };
  }
  invalidateStock();
  return { success: true };
}

export async function deleteInventoryCategory(id: string, expectedVersion: number): Promise<ActionResult> {
  await requireAdmin();
  if (!id || !Number.isInteger(expectedVersion) || expectedVersion < 0) return { success: false, error: "Refresh inventory before deleting this category." };
  try {
    const deleted = await prisma.inventoryCategory.deleteMany({ where: {
      id, version: expectedVersion, systemKey: null, children: { none: {} }, products: { none: {} },
    } });
    if (deleted.count !== 1) return { success: false, error: "Only empty custom categories can be deleted. Refresh if the category changed." };
  } catch { return { success: false, error: "Could not delete this category." }; }
  invalidateStock();
  return { success: true };
}

export async function saveInventoryProduct(input: z.infer<typeof ParentSchema>): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ParentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Enter a physical product name and choose a category." };
  const data = parsed.data;
  try {
    await prisma.$transaction(async tx => {
      const categories = await tx.inventoryCategory.findMany();
      const root = inventoryRoot(categories, data.categoryId);
      if (!root) throw new Error("Choose an existing category.");
      if (!inventorySection(categories, data.categoryId)) throw new Error("Choose Regular, Oversized or Oversized Raglan as the T-shirt category.");
      if (data.id) {
        const existing = await tx.inventoryProduct.findUnique({ where: { id: data.id } });
        if (!existing || data.expectedVersion === undefined) throw new Error("Refresh inventory before editing this physical product.");
        if (inventoryRoot(categories, existing.categoryId)?.id !== root.id) throw new Error("Move physical products within the same T-Shirts or Accessories group.");
        const saved = await tx.inventoryProduct.updateMany({ where: { id: data.id, version: data.expectedVersion }, data: {
          name: data.name, categoryId: data.categoryId, version: { increment: 1 },
        } });
        if (saved.count !== 1) throw new Error("Physical product changed. Refresh inventory and try again.");
      } else {
        await tx.inventoryProduct.create({ data: { name: data.name, categoryId: data.categoryId } });
      }
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    return { success: false, error: (error as { code?: string }).code ? "Could not save. The name may already exist or the structure changed; refresh and try again." : (error as Error).message };
  }
  invalidateStock();
  return { success: true };
}

export async function deleteInventoryProduct(id: string, expectedVersion: number): Promise<ActionResult> {
  await requireAdmin();
  if (!id || !Number.isInteger(expectedVersion) || expectedVersion < 0) return { success: false, error: "Refresh inventory before deleting this physical product." };
  try {
    const deleted = await prisma.inventoryProduct.deleteMany({ where: {
      id, version: expectedVersion, designs: { none: {} }, stock: { none: {} },
    } });
    if (deleted.count !== 1) return { success: false, error: "Remove or reassign its designs and stock before deleting this physical product." };
  } catch { return { success: false, error: "Could not delete this physical product." }; }
  invalidateStock();
  return { success: true };
}

export async function assignStockParent(input: { id: string; inventoryProductId: string; expectedVersion: number }): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z.object({ id: z.string().min(1), inventoryProductId: z.string().min(1), expectedVersion: z.number().int().nonnegative() }).safeParse(input);
  if (!parsed.success) return { success: false, error: "Choose a physical product and refresh the stock entry." };
  try {
    await prisma.$transaction(async tx => {
      const parent = await tx.inventoryProduct.findUnique({ where: { id: input.inventoryProductId } });
      const categories = await tx.inventoryCategory.findMany();
      if (!parent) throw new Error("Physical product not found.");
      if (!inventorySection(categories, parent.categoryId)) throw new Error("Choose a physical product under a T-shirt style or Accessories.");
      const root = inventoryRoot(categories, parent.categoryId);
      const stockGroup = root?.systemKey === "accessories" ? "ACCESSORY" : root?.systemKey === "tshirts" ? "PLAIN_TSHIRT" : null;
      if (!stockGroup) throw new Error("Choose a physical product under T-Shirts or Accessories.");
      const saved = await tx.plainTshirtStock.updateMany({
        where: { id: input.id, version: input.expectedVersion, inventoryProductId: null, stockGroup },
        data: { inventoryProductId: input.inventoryProductId, version: { increment: 1 } },
      });
      if (saved.count !== 1) throw new Error("Stock changed or belongs to another group. Refresh and try again.");
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    return { success: false, error: (error as { code?: string }).code ? "A stock entry with this colour and size may already exist under that parent. No balances were merged." : (error as Error).message };
  }
  invalidateStock();
  return { success: true };
}

export async function createInventoryStock(input: { inventoryProductId: string; color: string; size: string; quantity: number } & StockWriteIntent): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = z.object({
    inventoryProductId: z.string().min(1), color: z.string().trim().min(1).max(120),
    size: z.string().trim().min(1).max(80), quantity: z.number().int().min(0).max(2_147_483_647),
  }).safeParse(input);
  if (!parsed.success) return { success: false, error: "Enter a colour, size and a whole opening quantity of zero or more." };
  const colorSlug = slugify(parsed.data.color);
  if (!colorSlug) return { success: false, error: "Colour must contain letters or numbers." };
  try {
    await writeStaffStock(session.user!.id!, "Opening available blank balance", { action: "family-opening", ...parsed.data }, input.operationKey, async tx => {
      const parent = await tx.inventoryProduct.findUnique({ where: { id: parsed.data.inventoryProductId } });
      if (!parent) throw new Error("Physical product not found. Refresh inventory.");
      const categories = await tx.inventoryCategory.findMany();
      const root = inventoryRoot(categories, parent.categoryId);
      if (!inventorySection(categories, parent.categoryId)) throw new Error("Choose a physical product under a T-shirt style or Accessories.");
      const stockGroup = root?.systemKey === "accessories" ? "ACCESSORY" : root?.systemKey === "tshirts" ? "PLAIN_TSHIRT" : null;
      if (!stockGroup) throw new Error("Choose a physical product under T-Shirts or Accessories.");
      const stock = await tx.plainTshirtStock.create({ data: { ...parsed.data, colorSlug, stockGroup } });
      await tx.variantSizeStock.updateMany({
        where: { plainTshirtStockId: null, size: stock.size, variant: { colorSlug, product: { inventoryProductId: parent.id } } },
        data: { plainTshirtStockId: stock.id },
      });
    });
  } catch (error) {
    return { success: false, error: error instanceof StockWriteError ? error.message : (error as { code?: string }).code ? "This colour and size may already exist for this physical product. Use Restock existing to add units." : (error as Error).message };
  }
  invalidateStock();
  return { success: true };
}

export async function restockInventoryStock(input: { id: string; quantity: number } & StockWriteIntent): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = z.object({ id: z.string().min(1), quantity: z.number().int().min(1).max(2_147_483_647) }).safeParse(input);
  if (!parsed.success) return { success: false, error: "Select stock and enter a whole quantity of one or more." };
  try {
    await writeStaffStock(session.user!.id!, "Blank stock received", { action: "family-receipt", ...parsed.data }, input.operationKey, async tx => {
      const saved = await tx.plainTshirtStock.updateMany({ where: { id: parsed.data.id, quantity: { lte: 2_147_483_647 - parsed.data.quantity } }, data: { quantity: { increment: parsed.data.quantity }, version: { increment: 1 } } });
      if (saved.count !== 1) throw new StockWriteError("Stock was removed or the quantity exceeds the stock limit. Refresh inventory.");
    });
  } catch (error) { return { success: false, error: error instanceof StockWriteError ? error.message : "Could not restock. Please try again." }; }
  invalidateStock(); return { success: true };
}
