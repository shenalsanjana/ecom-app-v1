"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { nextStatuses, applyItemChanges, recomputeTotals, canEdit, canConfirm, courierBookedError, signedAdjustmentAmount, type ItemChange, type AdjustmentKind } from "@/app/_lib/admin-orders";
import { getDeliveryConfig } from "@/app/_lib/store-settings";
import { restoreItemPools, acquireItemPools } from "@/app/_lib/inventory-pools";
import { bookCourierAndNotify } from "@/app/checkout/book-courier";
import { sendOrderConfirmationEmail, logMailerError, type OrderDetails } from "@/app/_lib/mailer";
import { notifyOrderDispatched, notifyOrderCancelled } from "@/app/_lib/order-notifications";
import { DELIVERY_COMPANY_NAME } from "@/app/_lib/carrier";

export type ActionResult =
  | { success: true; warning?: string }
  | { success: false; error: string };

export type BulkItemResult = { id: string; ok: boolean; error?: string };
export type BulkResult = { results: BulkItemResult[]; okCount: number; skippedCount: number };

function summarize(results: BulkItemResult[]): BulkResult {
  const okCount = results.filter((r) => r.ok).length;
  return { results, okCount, skippedCount: results.length - okCount };
}

function revalidate(orderId: string) {
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
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate(orderId);
  return { success: true };
}

export async function markCodCollected(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentMethod !== "COD" || order.paymentStatus !== "COD_PENDING") {
    return { success: false, error: "Not a COD order awaiting collection" };
  }
  try {
    await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "COD_COLLECTED" } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
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
  if (to === "CONFIRMED" && !canConfirm(order) && !opts?.allowUnpaid) {
    return { success: false, error: "Awaiting payment — confirm online orders only after payment." };
  }
  try {
    await prisma.order.update({ where: { id: orderId }, data: { status: to } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
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
  orderId: string,
  items: { plainTshirtStockId: string | null; dtfDesignId: string | null; quantity: number }[],
): Promise<void> {
  for (const it of items) {
    await restoreItemPools(tx, it);
  }
  await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: CANCEL_INCLUDE,
  });
  if (!order) return { success: false, error: "Order not found" };
  if (order.status === "CANCELLED") return { success: false, error: "Order is already cancelled" };
  if (order.status === "DELIVERED") return { success: false, error: "Delivered orders cannot be cancelled" };

  try {
    await prisma.$transaction((tx) => cancelOrderTx(tx, orderId, order.items));
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }

  await trySendCancellationEmail(toOrderDetails(order));

  revalidate(orderId);
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

  const totals = recomputeTotals(order.items, parsed.data.city, await getDeliveryConfig(), order.adjustments);
  try {
    await prisma.order.update({
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
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
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
  const oldRow = await tx.plainTshirtStock.findUnique({ where: { id: oldPlainTshirtStockId }, select: { colorSlug: true } });
  if (!oldRow) return null;
  const newRow = await tx.plainTshirtStock.findUnique({
    where: { colorSlug_size: { colorSlug: oldRow.colorSlug, size: newSize } },
    select: { id: true },
  });
  return newRow?.id ?? null;
}

export async function editItems(orderId: string, changes: ItemChange[]): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, adjustments: true },
  });
  if (!order) return { success: false, error: "Order not found" };
  if (!canEdit(order)) return { success: false, error: "This order can no longer be edited" };
  const courierError = courierBookedError(order);
  if (courierError) return { success: false, error: courierError };

  let next;
  try {
    next = applyItemChanges(
      order.items.map((i) => ({
        id: i.id, variantId: i.variantId, name: i.name, size: i.size, price: i.price, quantity: i.quantity,
        plainTshirtStockId: i.plainTshirtStockId, dtfDesignId: i.dtfDesignId,
      })),
      changes,
    );
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Invalid change" };
  }

  const totals = recomputeTotals(next.nextItems, order.shippingCity, await getDeliveryConfig(), order.adjustments);

  try {
    await prisma.$transaction(async (tx) => {
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
          data: { quantity: item.quantity, size: item.size, plainTshirtStockId },
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

  revalidate(orderId);
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
  const courierError = courierBookedError(order);
  if (courierError) return { success: false, error: courierError };

  const amount = signedAdjustmentAmount(parsed.data.kind, parsed.data.amount);
  const totals = recomputeTotals(order.items, order.shippingCity, await getDeliveryConfig(), [...order.adjustments, { amount }]);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.orderAdjustment.create({ data: { orderId, label: parsed.data.label, amount } });
      await tx.order.update({
        where: { id: orderId },
        data: { subtotal: totals.subtotal, shippingCost: totals.shippingCost, total: totals.total },
      });
    });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate(orderId);
  return PAID.has(order.paymentStatus ?? "")
    ? { success: true, warning: "Order was paid — any price difference must be settled manually." }
    : { success: true };
}

const ORDER_INCLUDE = {
  user: { select: { name: true, email: true } },
  items: { select: { name: true, color: true, sku: true, size: true, price: true, quantity: true } },
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

  try {
    await prisma.order.update({
      where: { id: orderId },
      data: { trackingCode: parsed.data, status: "DISPATCHED", deliveryCompany: DELIVERY_COMPANY_NAME },
    });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
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
    await prisma.order.update({ where: { id: orderId }, data: { trackingCode: parsed.data } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
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
    if (!canConfirm(order) && !opts?.allowUnpaid) { results.push({ id, ok: false, error: "Awaiting payment" }); continue; }
    try {
      await prisma.order.update({ where: { id }, data: { status: "CONFIRMED" } });
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
    if (order.status !== "CONFIRMED" || order.courierBookedAt) {
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
  await requireAdmin();
  const results: BulkItemResult[] = [];
  for (const id of ids) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: CANCEL_INCLUDE,
    });
    if (!order) { results.push({ id, ok: false, error: "Not found" }); continue; }
    if (order.status === "CANCELLED") { results.push({ id, ok: false, error: "Already cancelled" }); continue; }
    if (order.status === "DELIVERED") { results.push({ id, ok: false, error: "Cannot cancel (DELIVERED)" }); continue; }
    try {
      await prisma.$transaction((tx) => cancelOrderTx(tx, id, order.items));
    } catch {
      results.push({ id, ok: false, error: "Cancel failed" });
      continue;
    }
    results.push({ id, ok: true });
    await trySendCancellationEmail(toOrderDetails(order));
  }
  revalidatePath("/admin/orders");
  for (const r of results) if (r.ok) revalidatePath(`/admin/orders/${r.id}`);
  return summarize(results);
}

// Statuses an order may be hard-deleted from. CANCELLED already restored stock
// at cancel time; DELIVERED shipped its goods — neither path returns stock to
// inventory on delete (see below).
const DELETABLE_STATUSES = new Set(["CANCELLED", "DELIVERED"]);

export async function deleteOrder(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Order not found" };
  if (!DELETABLE_STATUSES.has(order.status)) {
    return { success: false, error: "Only cancelled or delivered orders can be deleted" };
  }
  // Pure record removal: items & notes cascade-delete (schema onDelete: Cascade).
  // Do NOT restore stock here — a CANCELLED order already restored it, and a
  // DELIVERED order's goods have shipped and must not return to inventory.
  try {
    await prisma.order.delete({ where: { id: orderId } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidatePath("/admin/orders");
  return { success: true };
}

export async function bulkDelete(ids: string[]): Promise<BulkResult> {
  await requireAdmin();
  const results: BulkItemResult[] = [];
  for (const id of ids) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) { results.push({ id, ok: false, error: "Not found" }); continue; }
    if (!DELETABLE_STATUSES.has(order.status)) { results.push({ id, ok: false, error: "Not deletable" }); continue; }
    try {
      await prisma.order.delete({ where: { id } });
      results.push({ id, ok: true });
    } catch {
      results.push({ id, ok: false, error: "Delete failed" });
    }
  }
  revalidatePath("/admin/orders");
  return summarize(results);
}
