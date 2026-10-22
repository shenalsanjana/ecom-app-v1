"use server";

import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { slugify, uniqueSlug } from "@/app/_lib/admin-products";
import { invalidateStock } from "@/app/_lib/invalidate-stock";
import { writeStaffStock, countReason, StockWriteError, type StockWriteIntent } from "@/app/_lib/stock-movements";
import { listInventoryStockGroups } from "@/app/_lib/admin-inventory";

export type ActionResult = { success: true } | { success: false; error: string };

function revalidate() {
  invalidateStock();
}

const PlainStockSchema = z.object({
  color: z.string().trim().min(1),
  colorSlug: z.string().trim().min(1),
  size: z.string().trim().min(1),
  quantity: z.number().int().min(0).max(2_147_483_647),
});

export async function upsertPlainTshirtStock(input: {
  id?: string; color: string; colorSlug: string; size: string; quantity: number; expectedVersion?: number;
} & StockWriteIntent): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = PlainStockSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Color, size and quantity are required" };
  const { color, size, quantity } = parsed.data;
  const colorSlug = slugify(parsed.data.colorSlug || color);
  if (!colorSlug) return { success: false, error: "Color must contain letters or numbers" };
  if (input.id && (!Number.isInteger(input.expectedVersion) || input.expectedVersion! < 0)) return { success: false, error: "Refresh inventory before changing this quantity." };
  try {
    const reason = input.id ? countReason(input.reason) : "Opening available blank balance";
    await writeStaffStock(session.user!.id!, reason, { action: "blank-count", ...parsed.data, colorSlug, id: input.id, expectedVersion: input.expectedVersion, reason }, input.operationKey, async tx => {
      if (input.id) {
        const result = await tx.plainTshirtStock.updateMany({ where: { id: input.id, version: input.expectedVersion, colorSlug, size }, data: { quantity, version: { increment: 1 } } });
        if (result.count !== 1) throw new StockWriteError("Stock changed. Refresh inventory and enter the count again.");
      } else await tx.plainTshirtStock.create({ data: { color, colorSlug, size, quantity } });
    });
  } catch (error) { return { success: false, error: error instanceof StockWriteError ? error.message : "Could not save — this color+size may already exist." }; }
  revalidate(); return { success: true };
}

const AccessoryStockSchema = z.object({
  color: z.string().trim().min(1).max(120),
  colorSlug: z.string().trim().min(1).max(120).optional(),
  size: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(0).max(2_147_483_647),
});

export async function createAccessoryStock(input: {
  color: string; colorSlug?: string; size: string; quantity: number;
} & StockWriteIntent): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = AccessoryStockSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Enter an item/colour, size and a whole quantity of zero or more." };
  const colorSlug = slugify(parsed.data.colorSlug ?? parsed.data.color);
  if (!colorSlug) return { success: false, error: "Item/colour must contain letters or numbers." };
  try {
    await writeStaffStock(session.user!.id!, "Opening available accessory balance", { action: "accessory-opening", ...parsed.data, colorSlug }, input.operationKey, async tx => {
      await tx.plainTshirtStock.create({ data: { ...parsed.data, colorSlug, stockGroup: "ACCESSORY" } });
    });
  } catch (error) { return { success: false, error: error instanceof StockWriteError ? error.message : "Could not add stock. This item/colour and size may already exist; update its existing quantity instead." }; }
  revalidate(); return { success: true };
}

const AccessoryRestockSchema = z.object({
  id: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(2_147_483_647),
});

export async function restockAccessoryStock(input: { id: string; quantity: number } & StockWriteIntent): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = AccessoryRestockSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Select an accessory and enter a whole quantity of one or more." };
  const { id, quantity } = parsed.data;
  try {
    const groups = await listInventoryStockGroups();
    if (!groups.accessories.some(row => row.id === id)) return { success: false, error: "This accessory is no longer available to restock. Refresh inventory." };
    await writeStaffStock(session.user!.id!, "Accessory stock received", { action: "accessory-receipt", ...parsed.data }, input.operationKey, async tx => {
      const result = await tx.plainTshirtStock.updateMany({ where: { id, quantity: { lte: 2_147_483_647 - quantity } }, data: { quantity: { increment: quantity }, version: { increment: 1 } } });
      if (result.count !== 1) throw new StockWriteError("Could not add this quantity. Refresh inventory and check the stock limit.");
    });
  } catch (error) { return { success: false, error: error instanceof StockWriteError ? error.message : "Could not restock this accessory. Please try again." }; }
  revalidate(); return { success: true };
}

export async function deletePlainTshirtStock(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    const result = await prisma.plainTshirtStock.deleteMany({ where: { id, quantity: 0, movements: { none: {} }, orderItems: { none: {} }, variantSizes: { none: {} } } });
    if (result.count !== 1) return { success: false, error: "Only unlinked empty stock with no order or stock history can be deleted." };
  } catch {
    return { success: false, error: "Could not delete." };
  }
  revalidate();
  return { success: true };
}

const DesignSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().int().min(0).max(2_147_483_647),
});

export async function createDtfDesign(input: { name: string; quantity: number } & StockWriteIntent): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = DesignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Name and quantity are required" };
  const baseSlug = slugify(parsed.data.name);
  if (!baseSlug) return { success: false, error: "Name must contain letters or numbers" };
  const slug = await uniqueSlug(baseSlug, async value => (await prisma.dtfDesign.findUnique({ where: { slug: value } })) !== null);
  try {
    await writeStaffStock(session.user!.id!, "Opening available print balance", { action: "print-opening", ...parsed.data }, input.operationKey, async tx => {
      await tx.dtfDesign.create({ data: { name: parsed.data.name, slug, quantity: parsed.data.quantity } });
    });
  } catch (error) { return { success: false, error: error instanceof StockWriteError ? error.message : "Could not create design." }; }
  revalidate(); return { success: true };
}

const DesignUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  quantity: z.number().int().min(0).max(2_147_483_647).optional(),
  expectedVersion: z.number().int().min(0).max(2_147_483_647).optional(),
}).refine((value) => value.name !== undefined || value.quantity !== undefined);

export async function updateDtfDesign(id: string, input: { name?: string; quantity?: number; expectedVersion?: number } & StockWriteIntent): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = DesignUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Name and quantity are required" };
  const { name, quantity, expectedVersion } = parsed.data;
  if (quantity !== undefined && expectedVersion === undefined) return { success: false, error: "Refresh inventory before changing this quantity." };
  try {
    if (quantity === undefined) {
      const result = await prisma.dtfDesign.updateMany({ where: { id }, data: { name } });
      if (result.count !== 1) throw new StockWriteError("Stock changed. Refresh inventory and enter the count again.");
    } else {
      const reason = countReason(input.reason);
      await writeStaffStock(session.user!.id!, reason, { action: "print-count", id, ...parsed.data, reason }, input.operationKey, async tx => {
        const result = await tx.dtfDesign.updateMany({ where: { id, version: expectedVersion }, data: { ...(name !== undefined ? { name } : {}), quantity, version: { increment: 1 } } });
        if (result.count !== 1) throw new StockWriteError("Stock changed. Refresh inventory and enter the count again.");
      });
    }
  } catch (error) { return { success: false, error: error instanceof StockWriteError ? error.message : "Could not update design." }; }
  revalidate(); return { success: true };
}

export async function deleteDtfDesign(id: string): Promise<ActionResult> {
  await requireAdmin();
  const productCount = await prisma.product.count({ where: { dtfDesignId: id } });
  if (productCount > 0) {
    return { success: false, error: "This design is used by products. Reassign them first." };
  }
  try {
    const result = await prisma.dtfDesign.deleteMany({
      where: { id, quantity: 0, products: { none: {} }, designs: { none: {} }, movements: { none: {} }, orderItems: { none: {} } },
    });
    if (result.count !== 1) return { success: false, error: "Only unused designs with zero stock and no order or stock history can be deleted." };
  } catch {
    return { success: false, error: "Could not delete design." };
  }
  revalidate();
  return { success: true };
}
