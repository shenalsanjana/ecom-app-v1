"use server";

import { requiresPrint, effectivePrintId, type StockMode } from "@/app/_lib/stock-policy";
import { setStockMovementContext } from "@/app/_lib/stock-movements";
import { saleSkuForSize } from "@/app/_lib/sale-skus";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { nextStatuses, applyItemChanges, recomputeTotals, canEdit, canConfirm, financialEditsLocked, courierBookedError, signedAdjustmentAmount, type ItemChange, type AdjustmentKind } from "@/app/_lib/admin-orders";
import { getDeliveryConfig } from "@/app/_lib/store-settings";
import { restoreItemPools, acquireItemPools } from "@/app/_lib/inventory-pools";
import { bookCourierAndNotify } from "@/app/checkout/book-courier";
import { sendOrderConfirmationEmail, logMailerError, type OrderDetails } from "@/app/_lib/mailer";
import { notifyOrderDispatched, notifyOrderCancelled } from "@/app/_lib/order-notifications";
import { DELIVERY_COMPANY_NAME } from "@/app/_lib/carrier";
import { effectivePrice } from "@/app/_lib/variants";
import { claimOrderMutation, OrderConflictError } from "@/app/_lib/order-concurrency";
import { invalidateStock } from "@/app/_lib/invalidate-stock";
import { assertProductsPublished } from "@/app/_lib/product-publication";

export type ActionResult =
  | { success: true; warning?: string }
  | { success: false; error: string };

export type BulkItemResult = { id: string; ok: boolean; error?: string };
export type BulkResult = { results: BulkItemResult[]; okCount: number; skippedCount: number };

function summarize(results: BulkItemResult[]): BulkResult {
  const okCount = results.filter((r) => r.ok).length;
  return { results, okCount, skippedCount: results.length - okCount };
}

async function updateOrderFromSnapshot(order: Parameters<typeof claimOrderMutation>[1], args: Prisma.OrderUpdateArgs) {
  return prisma.$transaction(async (tx) => {
    await claimOrderMutation(tx, order);
    return tx.order.update(args);
  });
}

function revalidate(orderId: string, stockChanged = false) {
  if (stockChanged) invalidateStock();
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

const NoteSchema = z.string().trim().min(1).max(500);
const TrackingSchema = z.string().trim().min(1).max(64);

export async function addNote(orderId: string, body: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = NoteSchema.safeParse(body);
  if (!parsed.success) return { success: false, error: "Note cannot be empty" };

  try {
    await prisma.orderNote.create({
      data: { orderId, authorEmail: session.user.email ?? "admin", body: parsed.data },
    });
  } catch (error) {
    return { success: false, error: error instanceof OrderConflictError ? error.message : "Something went wrong. Please try again." };
  }
  revalidate(orderId);
  return { success: true };
}

export async function markCodCollected(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentMethod !== "COD" || order.paymentStatus !== "COD_PENDING" || order.status === "CANCELLED") {
    return { success: false, error: "Not a COD order awaiting collection" };
  }
  try {
    await updateOrderFromSnapshot(order, { where: { id: orderId }, data: { paymentStatus: "COD_COLLECTED" } });
  } catch (error) {
    return { success: false, error: error instanceof OrderConflictError ? error.message : "Something went wrong. Please try again." };
  }
  revalidate(orderId);
  return { success: true };
}

export async function advanceStatus(
  orderId: string,
  to: string,
  opts?: { allowUnpaid?: boolean },
): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Order not found" };
  if (!nextStatuses(order.status).includes(to)) {
    return { success: false, error: `Cannot move order from ${order.status} to ${to}` };
  }
  if (order.paymentReviewRequired) return { success: false, error: "Resolve payment review before advancing this order." };
  if (to === "CONFIRMED" && !canConfirm(order) && !opts?.allowUnpaid) {
    return { success: false, error: "Awaiting payment — confirm online orders only after payment." };
  }
  try {
    await updateOrderFromSnapshot(order, { where: { id: orderId }, data: { status: to } });
  } catch (error) {
    return { success: false, error: error instanceof OrderConflictError ? error.message : "Something went wrong. Please try again." };
  }
  revalidate(orderId);
  return { success: true };
}

const PAID = new Set(["PAID", "COD_COLLECTED"]);

/**
 * Stock-restore + status flip for a cancellation, inside a caller-provided
 * transaction. Shared by cancelOrder (single) and bulkCancel (many) so the two
 * paths never diverge. Eligibility checks are the caller's responsibility.
 */
async function cancelOrderTx(
  tx: Prisma.TransactionClient,
  order: Parameters<typeof claimOrderMutation>[1],
  items: { plainTshirtStockId: string | null; dtfDesignId: string | null; quantity: number }[],
  actorId?: string,
): Promise<void> {
  await setStockMovementContext(tx, { actorType: "ADMIN", actorId, reason: "Order cancellation / allocation released", orderId: order.id });
  await claimOrderMutation(tx, order);
  const orderId = order.id;
  for (const it of items) {
    await restoreItemPools(tx, it);
  }
  await tx.order.update({ where: { id: orderId }, data: {
    status: "CANCELLED",
    ...(PAID.has(order.paymentStatus ?? "") ? {
      paymentReviewRequired: true, paymentReviewReason: "A paid order was cancelled. Verify and record the manual refund before closing payment review.",
    } : {}),
  } });
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: CANCEL_INCLUDE,
  });
  if (!order) return { success: false, error: "Order not found" };
  if (order.status === "CANCELLED") return { success: false, error: "Order is already cancelled" };
  if (order.status === "DELIVERED") return { success: false, error: "Delivered orders cannot be cancelled" };
  if (order.status === "DISPATCHED" || order.courierBookedAt) return { success: false, error: "Dispatched orders need a return check before stock can be restored." };

  try {
    await prisma.$transaction((tx) => cancelOrderTx(tx, order, order.items, session.user?.id));
  } catch (error) {
    return { success: false, error: error instanceof OrderConflictError ? error.message : "Something went wrong. Please try again." };
  }

  await trySendCancellationEmail(toOrderDetails(order));

  revalidate(orderId, true);
  return PAID.has(order.paymentStatus ?? "")
    ? { success: true, warning: "Order was paid — refund must be handled manually." }
    : { success: true };
}

const AddressSchema = z.object({
  line1: z.string().trim().min(1),
  line2: z.string().trim().optional().default(""),
  city: z.string().trim().min(1),
  country: z.string().trim().min(1),
});

export async function editAddress(
  orderId: string,
  address: { line1: string; line2?: string; city: string; country: string },
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = AddressSchema.safeParse(address);
  if (!parsed.success) return { success: false, error: "Invalid address" };

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, adjustments: true } });
  if (!order) return { success: false, error: "Order not found" };
  if (order.courierBookedAt) return { success: false, error: "Address already sent to Curfox — cancel/rebook there." };
  if (!canEdit(order)) return { success: false, error: "This order can no longer be edited" };

  if (financialEditsLocked(order)) return { success: false, error: "Payment has started. Delivery charges are locked to the payment amount." };
  const totals = recomputeTotals(order.items, parsed.data.city, await getDeliveryConfig(), order.adjustments, order.paymentMethod);
  try {
    await updateOrderFromSnapshot(order, {
      where: { id: orderId },
      data: {
        shippingLine1: parsed.data.line1,
        shippingLine2: parsed.data.line2 || null,
        shippingCity: parsed.data.city,
        shippingCountry: parsed.data.country,
        shippingCost: totals.shippingCost,
        total: totals.total,
      },
    });
  } catch (error) {
    return { success: false, error: error instanceof OrderConflictError ? error.message : "Something went wrong. Please try again." };
  }
  revalidate(orderId);
  return { success: true };
}

// Resolves the pool row for a NEW size, using the OLD pool row's frozen
// colorSlug (not the variant's current color) — the same freeze-at-order-time
// principle that motivates the OrderItem snapshot columns. Returns null when
// there's nothing to resolve from (sizeless/pre-migration item) or no pool
// row exists for that color+size.
async function resolveNewPlainPool(
  tx: Prisma.TransactionClient,
  oldPlainTshirtStockId: string | null,
  newSize: string,
): Promise<string | null> {
  if (!oldPlainTshirtStockId) return null;
  const oldRow = await tx.plainTshirtStock.findUnique({ where: { id: oldPlainTshirtStockId }, select: { colorSlug: true, inventoryProductId: true } });
  if (!oldRow) return null;
  const newRow = await tx.plainTshirtStock.findFirst({
    where: { inventoryProductId: oldRow.inventoryProductId ?? null, colorSlug: oldRow.colorSlug, size: newSize },
    select: { id: true },
  });
  return newRow?.id ?? null;
}

export async function editItems(orderId: string, changes: ItemChange[]): Promise<ActionResult> {
  const session = await requireAdmin();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, adjustments: true },
  });
  if (!order) return { success: false, error: "Order not found" };
  if (order.adjustments?.some(a => a.promotion)) return { success: false, error: "Items on a discounted order are locked to preserve offer eligibility. Cancel and place a new order to change items." };
  if (!canEdit(order)) return { success: false, error: "This order can no longer be edited" };
  if (financialEditsLocked(order)) return { success: false, error: "Payment has started. Items and charges are locked to the payment amount." };
  const courierError = courierBookedError(order);
  if (courierError) return { success: false, error: courierError };

  const parsedChanges = z.array(z.object({ id: z.string().min(1), quantity: z.number().int().positive().optional(), size: z.string().trim().min(1).nullable().optional(), remove: z.boolean().optional() })).safeParse(changes);
  if (!parsedChanges.success) return { success: false, error: "Enter valid quantities and sizes." };
  let next;
  try {
    next = applyItemChanges(
      order.items.map((i) => ({
        id: i.id, variantId: i.variantId, name: i.name, size: i.size, price: i.price, quantity: i.quantity,
        plainTshirtStockId: i.plainTshirtStockId, dtfDesignId: i.dtfDesignId, stockMode: i.stockMode,
      })),
      parsedChanges.data,
    );
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Invalid change" };
  }

  const totals = recomputeTotals(next.nextItems, order.shippingCity, await getDeliveryConfig(), order.adjustments, order.paymentMethod);

  try {
    await prisma.$transaction(async (tx) => {
      await setStockMovementContext(tx, { actorType: "ADMIN", actorId: session.user?.id, reason: "Order editItems allocation change", orderId });
      await claimOrderMutation(tx, order);
      // Restore every original line's pools, then reacquire every surviving
      // line's pools at its new quantity/size. Unchanged lines net to zero; a
      // failed reacquire rolls back every restore/acquire in this transaction.
      for (const original of order.items) {
        await restoreItemPools(tx, original);
      }

      const keptIds = new Set(next.nextItems.map((i) => i.id));
      for (const original of order.items) {
        if (!keptIds.has(original.id)) {
          await tx.orderItem.delete({ where: { id: original.id } });
        }
      }

      for (const item of next.nextItems) {
        const original = order.items.find((row) => row.id === item.id)!;
        if ((!item.plainTshirtStockId || (requiresPrint(item.stockMode) && !item.dtfDesignId)) && (item.sizeChanged || item.quantity !== original.quantity)) {
          throw new Error(`Stock is not configured for "${item.name}". Resolve the stock mapping before changing this line.`);
        }
        let plainTshirtStockId = item.plainTshirtStockId;
        if (item.sizeChanged) {
          plainTshirtStockId = item.size ? await resolveNewPlainPool(tx, item.plainTshirtStockId, item.size) : null;
          if (item.size && item.plainTshirtStockId && !plainTshirtStockId) {
            throw new Error(`Size "${item.size}" is not available for "${item.name}"`);
          }
        }
        await acquireItemPools(tx, {
          plainTshirtStockId, dtfDesignId: item.dtfDesignId, quantity: item.quantity, name: item.name,
        });
        await tx.orderItem.update({
          where: { id: item.id },
          data: { quantity: item.quantity, size: item.size, plainTshirtStockId,
            ...(item.sizeChanged && original.sku?.startsWith("DBV-") ? {
              sku: original.variantId && item.size ? (await tx.variantSizeStock.findFirst({
                where: { variantId: original.variantId, size: item.size, plainTshirtStockId }, select: { sku: true },
              }))?.sku ?? null : null,
            } : {}),
          },
        });
      }

      await tx.order.update({
        where: { id: orderId },
        data: { subtotal: totals.subtotal, shippingCost: totals.shippingCost, total: totals.total },
      });
    });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Edit failed" };
  }

  revalidate(orderId, true);
  return PAID.has(order.paymentStatus ?? "")
    ? { success: true, warning: "Order was paid — any price difference must be settled manually." }
    : { success: true };
}

const AdjustmentSchema = z.object({
  label: z.string().trim().min(1).max(80),
  amount: z.number().finite().positive(),
  kind: z.enum(["CHARGE", "DISCOUNT"]),
});

export async function addAdjustment(
  orderId: string,
  input: { label: string; amount: number; kind: AdjustmentKind },
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = AdjustmentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Enter a label and a positive amount" };

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, adjustments: true } });
  if (!order) return { success: false, error: "Order not found" };
  if (!canEdit(order)) return { success: false, error: "This order can no longer be edited" };
  if (financialEditsLocked(order)) return { success: false, error: "Payment has started. Items and charges are locked to the payment amount." };
  const courierError = courierBookedError(order);
  if (courierError) return { success: false, error: courierError };

  const amount = signedAdjustmentAmount(parsed.data.kind, parsed.data.amount);
  if (amount < 0 && order.adjustments?.some(a => a.promotion)) return { success: false, error: "This order already has a promotion. Additional discounts cannot be combined." };
  const totals = recomputeTotals(order.items, order.shippingCity, await getDeliveryConfig(), [...order.adjustments, { amount }], order.paymentMethod);

  try {
    await prisma.$transaction(async (tx) => {
      await claimOrderMutation(tx, order);
      await tx.orderAdjustment.create({ data: { orderId, label: parsed.data.label, amount } });
      await tx.order.update({
        where: { id: orderId },
        data: { subtotal: totals.subtotal, shippingCost: totals.shippingCost, total: totals.total },
      });
    });
  } catch (error) {
    return { success: false, error: error instanceof OrderConflictError ? error.message : "Something went wrong. Please try again." };
  }
  revalidate(orderId);
  return PAID.has(order.paymentStatus ?? "")
    ? { success: true, warning: "Order was paid — any price difference must be settled manually." }
    : { success: true };
}

export async function removeAdjustment(orderId: string, adjustmentId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, adjustments: true } });
  if (!order) return { success: false, error: "Order not found" };
  if (!canEdit(order)) return { success: false, error: "This order can no longer be edited" };
  if (financialEditsLocked(order)) return { success: false, error: "Payment has started. Items and charges are locked to the payment amount." };
  const courierError = courierBookedError(order);
  if (courierError) return { success: false, error: courierError };

  const target = order.adjustments.find((a) => a.id === adjustmentId);
  if (!target) return { success: false, error: "Adjustment not found" };
  if (target.promotion) return { success: false, error: "Promotion savings are part of the original order and cannot be removed." };
  const remaining = order.adjustments.filter((a) => a.id !== adjustmentId);
  const totals = recomputeTotals(order.items, order.shippingCity, await getDeliveryConfig(), remaining, order.paymentMethod);

  try {
    await prisma.$transaction(async (tx) => {
      await claimOrderMutation(tx, order);
      await tx.orderAdjustment.delete({ where: { id: adjustmentId } });
      await tx.order.update({
        where: { id: orderId },
        data: { subtotal: totals.subtotal, shippingCost: totals.shippingCost, total: totals.total },
      });
    });
  } catch (error) {
    return { success: false, error: error instanceof OrderConflictError ? error.message : "Something went wrong. Please try again." };
  }
  revalidate(orderId);
  return PAID.has(order.paymentStatus ?? "")
    ? { success: true, warning: "Order was paid — any price difference must be settled manually." }
    : { success: true };
}

export type ProductSearchResult = {
  id: string;
  name: string;
  price: number;
  variants: { id: string; color: string; colorSlug: string; price: number | null; sizes: string[] }[];
};

export async function searchProductsForOrder(query: string): Promise<ProductSearchResult[]> {
  await requireAdmin();
  const q = query.trim();
  if (!q) return [];
  const products = await prisma.product.findMany({
    where: { archived: false, status: "PUBLISHED", OR: [{ name: { contains: q, mode: "insensitive" } }, { variants: { some: { archived: false, sizeStocks: { some: { archived: false, sku: { contains: q, mode: "insensitive" } } } } } }] },
    take: 20,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      price: true,
      variants: {
        where: { archived: false },
        orderBy: { sortOrder: "asc" },
        select: { id: true, color: true, colorSlug: true, price: true, sizeStocks: { where: { archived: false }, select: { size: true, sku: true, plainTshirtStockId: true } } },
      },
    },
  });
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    variants: p.variants.map((v) => ({ id: v.id, color: v.color, colorSlug: v.colorSlug, price: v.price, sizes: v.sizeStocks.map((s) => s.size) })),
  }));
}

type ResolvedOrderVariant = {
  stockMode: StockMode;
  productId: string;
  productName: string;
  productPrice: number;
  variantId: string;
  color: string;
  colorSlug: string;
  sku: string | null;
  variantPrice: number | null;
  dtfDesignId: string | null;
  sizes: string[];
  stockBySize: { size: string; sku?: string | null; plainTshirtStockId?: string | null }[];
};

async function resolveVariantForOrder(productId: string, variantId: string): Promise<ResolvedOrderVariant | null> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      productId: true,
      color: true,
      colorSlug: true,
      sku: true,
      archived: true,
      price: true,
      sizeStocks: { where: { archived: false }, select: { size: true, sku: true, plainTshirtStockId: true } },
      product: { select: { id: true, name: true, price: true, dtfDesignId: true, stockMode: true, archived: true, status: true } },
    },
  });
  if (!variant || variant.archived || variant.productId !== productId || variant.product.archived || variant.product.status !== "PUBLISHED") return null;
  return {
    productId: variant.product.id,
    productName: variant.product.name,
    productPrice: variant.product.price,
    variantId: variant.id,
    color: variant.color,
    colorSlug: variant.colorSlug,
    sku: variant.sku,
    variantPrice: variant.price,
    dtfDesignId: effectivePrintId(variant.product),
    stockMode: variant.product.stockMode ?? "PRINTED_TO_ORDER",
    sizes: variant.sizeStocks.map((s) => s.size),
    stockBySize: variant.sizeStocks,
  };
}

async function stockForOrderVariant(variant: ResolvedOrderVariant, size: string | null | undefined) {
  if (!size) return null;
  const stockId = variant.stockBySize.find(cell => cell.size === size)?.plainTshirtStockId;
  if (stockId === null) return null;
  if (stockId) return prisma.plainTshirtStock.findUnique({ where: { id: stockId }, select: { id: true } });
  return prisma.plainTshirtStock.findFirst({
    where: { inventoryProductId: null, colorSlug: variant.colorSlug, size }, select: { id: true },
  });
}

function validateChosenSize(sizes: string[], size: string | null): string | null {
  if (sizes.length === 0) return "Stock is not configured for this color";
  if (!size || !sizes.includes(size)) return `Size "${size ?? ""}" is not offered for this color`;
  return null;
}

const ProductItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  size: z.string().trim().min(1).nullable(),
  quantity: z.number().int().positive(),
});

export async function addOrderItem(
  orderId: string,
  input: { productId: string; variantId: string; size: string | null; quantity: number },
): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = ProductItemSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Pick a product, color, size, and quantity" };

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, adjustments: true } });
  if (!order) return { success: false, error: "Order not found" };
  if (order.adjustments?.some(a => a.promotion)) return { success: false, error: "Items on a discounted order are locked to preserve offer eligibility. Cancel and place a new order to change items." };
  if (!canEdit(order)) return { success: false, error: "This order can no longer be edited" };
  if (financialEditsLocked(order)) return { success: false, error: "Payment has started. Items and charges are locked to the payment amount." };
  const courierError = courierBookedError(order);
  if (courierError) return { success: false, error: courierError };

  const resolved = await resolveVariantForOrder(parsed.data.productId, parsed.data.variantId);
  if (!resolved) return { success: false, error: "Selected product/color is no longer available" };
  const sizeError = validateChosenSize(resolved.sizes, parsed.data.size);
  if (sizeError) return { success: false, error: sizeError };

  const plainRow = await stockForOrderVariant(resolved, parsed.data.size);
  if (!plainRow || (requiresPrint(resolved.stockMode) && !resolved.dtfDesignId)) return { success: false, error: "Stock is not configured for this product, color and size." };
  const price = effectivePrice({ price: resolved.variantPrice }, { price: resolved.productPrice });
  const totals = recomputeTotals(
    [...order.items, { price, quantity: parsed.data.quantity }],
    order.shippingCity,
    await getDeliveryConfig(),
    order.adjustments,
    order.paymentMethod,
  );

  try {
    await prisma.$transaction(async (tx) => {
      await setStockMovementContext(tx, { actorType: "ADMIN", actorId: session.user?.id, reason: "Order addOrderItem allocation change", orderId });
      await claimOrderMutation(tx, order);
      await assertProductsPublished(tx, [resolved.productId], [{ id: resolved.productId, stockMode: resolved.stockMode, dtfDesignId: resolved.dtfDesignId }]);
      await acquireItemPools(tx, {
        plainTshirtStockId: plainRow?.id ?? null,
        dtfDesignId: resolved.dtfDesignId,
        quantity: parsed.data.quantity,
        name: resolved.productName,
      });
      await tx.orderItem.create({
        data: {
          orderId,
          productId: resolved.productId,
          variantId: resolved.variantId,
          color: resolved.color,
          sku: saleSkuForSize(resolved.stockBySize, parsed.data.size, resolved.sku),
          name: resolved.productName,
          size: parsed.data.size,
          price,
          quantity: parsed.data.quantity,
          plainTshirtStockId: plainRow?.id ?? null,
          dtfDesignId: resolved.dtfDesignId,
          stockMode: resolved.stockMode,
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { subtotal: totals.subtotal, shippingCost: totals.shippingCost, total: totals.total },
      });
    });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to add product" };
  }
  revalidate(orderId, true);
  return PAID.has(order.paymentStatus ?? "")
    ? { success: true, warning: "Order was paid — any price difference must be settled manually." }
    : { success: true };
}

export async function swapOrderItem(
  orderId: string,
  itemId: string,
  input: { productId: string; variantId: string; size: string | null; quantity: number },
): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = ProductItemSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Pick a product, color, size, and quantity" };

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, adjustments: true } });
  if (!order) return { success: false, error: "Order not found" };
  if (order.adjustments?.some(a => a.promotion)) return { success: false, error: "Items on a discounted order are locked to preserve offer eligibility. Cancel and place a new order to change items." };
  if (!canEdit(order)) return { success: false, error: "This order can no longer be edited" };
  if (financialEditsLocked(order)) return { success: false, error: "Payment has started. Items and charges are locked to the payment amount." };
  const courierError = courierBookedError(order);
  if (courierError) return { success: false, error: courierError };

  const original = order.items.find((i) => i.id === itemId);
  if (!original) return { success: false, error: "Order item not found" };

  const resolved = await resolveVariantForOrder(parsed.data.productId, parsed.data.variantId);
  if (!resolved) return { success: false, error: "Selected product/color is no longer available" };
  const sizeError = validateChosenSize(resolved.sizes, parsed.data.size);
  if (sizeError) return { success: false, error: sizeError };

  const plainRow = await stockForOrderVariant(resolved, parsed.data.size);
  if (!plainRow || (requiresPrint(resolved.stockMode) && !resolved.dtfDesignId)) return { success: false, error: "Stock is not configured for this product, color and size." };
  const price = effectivePrice({ price: resolved.variantPrice }, { price: resolved.productPrice });
  const nextItems = order.items.map((i) => (i.id === itemId ? { price, quantity: parsed.data.quantity } : i));
  const totals = recomputeTotals(nextItems, order.shippingCity, await getDeliveryConfig(), order.adjustments, order.paymentMethod);

  try {
    await prisma.$transaction(async (tx) => {
      await setStockMovementContext(tx, { actorType: "ADMIN", actorId: session.user?.id, reason: "Order swapOrderItem allocation change", orderId });
      await claimOrderMutation(tx, order);
      await assertProductsPublished(tx, [resolved.productId], [{ id: resolved.productId, stockMode: resolved.stockMode, dtfDesignId: resolved.dtfDesignId }]);
      await restoreItemPools(tx, original);
      await acquireItemPools(tx, {
        plainTshirtStockId: plainRow?.id ?? null,
        dtfDesignId: resolved.dtfDesignId,
        quantity: parsed.data.quantity,
        name: resolved.productName,
      });
      await tx.orderItem.update({
        where: { id: itemId },
        data: {
          productId: resolved.productId,
          variantId: resolved.variantId,
          color: resolved.color,
          sku: saleSkuForSize(resolved.stockBySize, parsed.data.size, resolved.sku),
          name: resolved.productName,
          size: parsed.data.size,
          price,
          quantity: parsed.data.quantity,
          plainTshirtStockId: plainRow?.id ?? null,
          dtfDesignId: resolved.dtfDesignId,
          stockMode: resolved.stockMode,
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { subtotal: totals.subtotal, shippingCost: totals.shippingCost, total: totals.total },
      });
    });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to change product" };
  }
  revalidate(orderId, true);
  return PAID.has(order.paymentStatus ?? "")
    ? { success: true, warning: "Order was paid — any price difference must be settled manually." }
    : { success: true };
}

const ORDER_INCLUDE = {
  user: { select: { name: true, email: true } },
  items: { select: { name: true, color: true, sku: true, size: true, price: true, quantity: true } },
  adjustments: { select: { label: true, amount: true } },
} satisfies Prisma.OrderInclude;

type DbOrderForDetails = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

function toOrderDetails(order: DbOrderForDetails): OrderDetails {
  return {
    orderId: order.id,
    customerName: order.user?.name ?? order.guestName ?? "Customer",
    customerEmail: order.user?.email ?? order.guestEmail ?? "",
    customerPhone: order.customerPhone,
    alternatePhone: order.alternatePhone,
    items: order.items.map((i) => ({
      name: i.name,
      color: i.color,
      sku: i.sku,
      size: i.size,
      price: i.price,
      quantity: i.quantity,
    })),
    adjustments: order.adjustments.map((a) => ({ label: a.label, amount: a.amount })),
    subtotal: order.subtotal,
    shipping: order.shippingCost,
    total: order.total,
    shippingAddress: {
      line1: order.shippingLine1, line2: order.shippingLine2 ?? undefined,
      city: order.shippingCity, country: order.shippingCountry,
    },
    paymentMethod: order.paymentMethod as OrderDetails["paymentMethod"],
    paymentMethodDisplay: order.paymentMethodDisplay,
    notes: order.notes ?? undefined,
    webNumber: order.webNumber,
    rbNumber: order.rbNumber,
    paymentStatus: order.paymentStatus,
    trackingCode: order.trackingCode ?? undefined,
  };
}

// Like ORDER_INCLUDE but also pulls each item's plainTshirtStockId/dtfDesignId,
// which the stock-restore in cancelOrderTx needs. The extra variantId field is
// harmless to toOrderDetails (which ignores it).
const CANCEL_INCLUDE = {
  user: { select: { name: true, email: true } },
  items: {
    select: {
      variantId: true,
      plainTshirtStockId: true,
      dtfDesignId: true,
      name: true,
      color: true,
      sku: true,
      size: true,
      price: true,
      quantity: true,
    },
  },
  adjustments: { select: { label: true, amount: true } },
} satisfies Prisma.OrderInclude;

/** Customer cancellation notifications (email when present + SMS). Never throws. */
async function trySendCancellationEmail(details: OrderDetails): Promise<void> {
  await notifyOrderCancelled(details);
}

export async function bookCourier(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  if (process.env.ROYAL_EXPRESS_ENABLED !== "true") {
    return { success: false, error: "Courier integration is disabled (ROYAL_EXPRESS_ENABLED)." };
  }
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (!order) return { success: false, error: "Order not found" };
  if (order.status !== "CONFIRMED" || order.courierBookedAt) {
    return { success: false, error: "Only confirmed, un-booked orders can be dispatched" };
  }
  if (order.paymentReviewRequired) return { success: false, error: "Resolve payment review before dispatching." };
  const waybill = await bookCourierAndNotify({ order: toOrderDetails(order) });
  revalidate(orderId);
  return waybill
    ? { success: true, warning: `Booked — waybill ${waybill}.` }
    : { success: false, error: "Courier booking failed — check Curfox / retry." };
}

/**
 * Manual dispatch fallback used when Curfox is disabled or its booking failed.
 * Saves an admin-entered tracking number, flips the order to DISPATCHED with
 * Royal Express as the carrier, and emails the customer once. Does not call Curfox.
 */
export async function dispatchManually(orderId: string, trackingNumber: string): Promise<ActionResult> {
  await requireAdmin();
  const parsed = TrackingSchema.safeParse(trackingNumber);
  if (!parsed.success) return { success: false, error: "Enter a valid tracking number" };

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (!order) return { success: false, error: "Order not found" };
  if (order.status !== "CONFIRMED") {
    return { success: false, error: "Only confirmed orders can be dispatched" };
  }

  if (order.paymentReviewRequired) return { success: false, error: "Resolve payment review before dispatching." };
  try {
    await updateOrderFromSnapshot(order, {
      where: { id: orderId },
      data: { trackingCode: parsed.data, status: "DISPATCHED", deliveryCompany: DELIVERY_COMPANY_NAME },
    });
  } catch (error) {
    return { success: false, error: error instanceof OrderConflictError ? error.message : "Something went wrong. Please try again." };
  }

  try {
    await notifyOrderDispatched(toOrderDetails(order), parsed.data);
  } catch (err) {
    logMailerError("dispatch", { orderId, webNumber: order.webNumber, rbNumber: order.rbNumber }, err);
  }

  revalidate(orderId);
  return { success: true, warning: `Dispatched — tracking ${parsed.data}.` };
}

/**
 * Updates the tracking number on an already-dispatched order. Never re-sends the
 * customer dispatch email (req: no duplicate dispatch emails).
 */
export async function updateTrackingNumber(orderId: string, trackingNumber: string): Promise<ActionResult> {
  await requireAdmin();
  const parsed = TrackingSchema.safeParse(trackingNumber);
  if (!parsed.success) return { success: false, error: "Enter a valid tracking number" };

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Order not found" };
  if (order.status !== "DISPATCHED") {
    return { success: false, error: "Tracking number can only be updated on a dispatched order" };
  }

  try {
    await updateOrderFromSnapshot(order, { where: { id: orderId }, data: { trackingCode: parsed.data } });
  } catch (error) {
    return { success: false, error: error instanceof OrderConflictError ? error.message : "Something went wrong. Please try again." };
  }

  revalidate(orderId);
  return { success: true };
}

export async function resendConfirmationEmail(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (!order) return { success: false, error: "Order not found" };
  const details = toOrderDetails(order);
  if (!details.customerEmail) return { success: false, error: "No customer email on this order" };
  try {
    await sendOrderConfirmationEmail(details);
  } catch {
    return { success: false, error: "Failed to send email — check mailer config." };
  }
  return { success: true, warning: details.trackingCode ? undefined : "Sent without a tracking code (not dispatched yet)." };
}

export async function bulkConfirm(ids: string[], opts?: { allowUnpaid?: boolean }): Promise<BulkResult> {
  await requireAdmin();
  const results: BulkItemResult[] = [];
  for (const id of ids) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) { results.push({ id, ok: false, error: "Not found" }); continue; }
    if (order.status !== "PENDING") {
      results.push({ id, ok: false, error: order.status === "CONFIRMED" ? "Already confirmed" : `Cannot confirm (${order.status})` });
      continue;
    }
    if (order.paymentReviewRequired) { results.push({ id, ok: false, error: "Payment review required" }); continue; }
    if (!canConfirm(order) && !opts?.allowUnpaid) { results.push({ id, ok: false, error: "Awaiting payment" }); continue; }
    try {
      await updateOrderFromSnapshot(order, { where: { id }, data: { status: "CONFIRMED" } });
      results.push({ id, ok: true });
    } catch {
      results.push({ id, ok: false, error: "Update failed" });
    }
  }
  revalidatePath("/admin/orders");
  for (const r of results) if (r.ok) revalidatePath(`/admin/orders/${r.id}`);
  return summarize(results);
}

export async function bulkDispatch(ids: string[]): Promise<BulkResult> {
  await requireAdmin();
  if (process.env.ROYAL_EXPRESS_ENABLED !== "true") {
    return summarize(ids.map((id) => ({ id, ok: false, error: "Courier disabled" })));
  }
  const results: BulkItemResult[] = [];
  for (const id of ids) {
    const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) { results.push({ id, ok: false, error: "Not found" }); continue; }
    if (order.status !== "CONFIRMED" || order.courierBookedAt || order.paymentReviewRequired) {
      results.push({ id, ok: false, error: "Not dispatchable" });
      continue;
    }
    try {
      const waybill = await bookCourierAndNotify({ order: toOrderDetails(order) });
      results.push(waybill ? { id, ok: true } : { id, ok: false, error: "Booking failed" });
    } catch {
      results.push({ id, ok: false, error: "Booking failed" });
    }
  }
  revalidatePath("/admin/orders");
  for (const r of results) if (r.ok) revalidatePath(`/admin/orders/${r.id}`);
  return summarize(results);
}

export async function bulkCancel(ids: string[]): Promise<BulkResult> {
  const session = await requireAdmin();
  const results: BulkItemResult[] = [];
  for (const id of ids) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: CANCEL_INCLUDE,
    });
    if (!order) { results.push({ id, ok: false, error: "Not found" }); continue; }
    if (order.status === "CANCELLED") { results.push({ id, ok: false, error: "Already cancelled" }); continue; }
    if (order.status === "DISPATCHED" || order.courierBookedAt) { results.push({ id, ok: false, error: "Dispatched orders need a return check" }); continue; }
    if (order.status === "DELIVERED") { results.push({ id, ok: false, error: "Cannot cancel (DELIVERED)" }); continue; }
    try {
      await prisma.$transaction((tx) => cancelOrderTx(tx, order, order.items, session.user?.id));
    } catch {
      results.push({ id, ok: false, error: "Cancel failed" });
      continue;
    }
    results.push({ id, ok: true });
    await trySendCancellationEmail(toOrderDetails(order));
  }
  invalidateStock();
  revalidatePath("/admin/orders");
  for (const r of results) if (r.ok) revalidatePath(`/admin/orders/${r.id}`);
  return summarize(results);
}

// Removal from active lists retains payment evidence and callback references.
// Neither deletion nor restoration changes the original order's stock balance.
const DELETABLE_STATUSES = new Set(["CANCELLED", "DELIVERED"]);

async function setOrderDeleted(order: Parameters<typeof claimOrderMutation>[1], deletedAt: Date | null) {
  await updateOrderFromSnapshot(order, { where: { id: order.id }, data: { deletedAt } });
}

export async function deleteOrder(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Order not found" };
  if (!DELETABLE_STATUSES.has(order.status)) {
    return { success: false, error: "Only cancelled or delivered orders can be deleted" };
  }
  if (order.deletedAt) return { success: true };
  try {
    await setOrderDeleted(order, new Date());
  } catch (error) {
    return { success: false, error: error instanceof OrderConflictError ? error.message : "Something went wrong. Please try again." };
  }
  revalidate(orderId);
  return { success: true };
}

export async function bulkDelete(ids: string[]): Promise<BulkResult> {
  await requireAdmin();
  const results: BulkItemResult[] = [];
  for (const id of ids) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) { results.push({ id, ok: false, error: "Not found" }); continue; }
    if (!DELETABLE_STATUSES.has(order.status)) { results.push({ id, ok: false, error: "Not deletable" }); continue; }
    if (order.deletedAt) { results.push({ id, ok: false, error: "Already deleted" }); continue; }
    try {
      await setOrderDeleted(order, new Date());
      results.push({ id, ok: true });
    } catch (error) {
      results.push({ id, ok: false, error: error instanceof OrderConflictError ? error.message : "Delete failed. Please try again." });
    }
  }
  revalidatePath("/admin/orders");
  for (const result of results) if (result.ok) revalidatePath(`/admin/orders/${result.id}`);
  return summarize(results);
}

export async function restoreDeletedOrder(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Order not found" };
  if (!order.deletedAt) return { success: false, error: "Order is not deleted" };
  try {
    await setOrderDeleted(order, null);
  } catch (error) {
    return { success: false, error: error instanceof OrderConflictError ? error.message : "Restore failed. Please try again." };
  }
  revalidate(orderId);
  return { success: true };
}
