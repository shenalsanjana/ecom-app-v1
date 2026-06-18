"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { nextStatuses, applyItemChanges, recomputeTotals, canEdit, canConfirm, type ItemChange } from "@/app/_lib/admin-orders";
import { getDeliveryConfig } from "@/app/_lib/store-settings";
import { bookCourierAndNotify } from "@/app/checkout/book-courier";
import { sendOrderConfirmationEmail, sendCustomerDispatchEmail, logMailerError, type OrderDetails } from "@/app/_lib/mailer";
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
  items: { productId: string; quantity: number }[],
): Promise<void> {
  for (const it of items) {
    await tx.product.updateMany({ where: { id: it.productId }, data: { stock: { increment: it.quantity } } });
  }
  await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { select: { productId: true, quantity: true } } },
  });
  if (!order) return { success: false, error: "Order not found" };
  if (order.status === "CANCELLED") return { success: false, error: "Order is already cancelled" };
  if (order.status === "DELIVERED") return { success: false, error: "Delivered orders cannot be cancelled" };

  try {
    await prisma.$transaction((tx) => cancelOrderTx(tx, orderId, order.items));
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }

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

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return { success: false, error: "Order not found" };
  if (order.courierBookedAt) return { success: false, error: "Address already sent to Curfox — cancel/rebook there." };

  const totals = recomputeTotals(order.items, parsed.data.city, await getDeliveryConfig());
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

export async function editItems(orderId: string, changes: ItemChange[]): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { success: false, error: "Order not found" };
  if (!canEdit(order)) return { success: false, error: "This order can no longer be edited" };

  let next;
  try {
    next = applyItemChanges(
      order.items.map((i) => ({ id: i.id, productId: i.productId, name: i.name, size: i.size, price: i.price, quantity: i.quantity })),
      changes,
    );
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Invalid change" };
  }

  const totals = recomputeTotals(next.nextItems, order.shippingCity, await getDeliveryConfig());
  const nameByProduct = new Map(order.items.map((i) => [i.productId, i.name]));

  try {
    await prisma.$transaction(async (tx) => {
      for (const [productId, delta] of Object.entries(next.stockDeltas)) {
        if (delta > 0) {
          await tx.product.updateMany({ where: { id: productId }, data: { stock: { increment: delta } } });
        } else if (delta < 0) {
          const dec = -delta;
          const r = await tx.product.updateMany({
            where: { id: productId, stock: { gte: dec } },
            data: { stock: { decrement: dec } },
          });
          if (r.count === 0) throw new Error(`Insufficient stock for "${nameByProduct.get(productId) ?? productId}"`);
        }
      }

      const keptIds = new Set(next.nextItems.map((i) => i.id));
      for (const original of order.items) {
        if (!keptIds.has(original.id)) {
          await tx.orderItem.delete({ where: { id: original.id } });
        }
      }
      for (const item of next.nextItems) {
        await tx.orderItem.update({ where: { id: item.id }, data: { quantity: item.quantity, size: item.size } });
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

const ORDER_INCLUDE = {
  user: { select: { name: true, email: true } },
  items: { select: { name: true, size: true, price: true, quantity: true } },
} satisfies Prisma.OrderInclude;

type DbOrderForDetails = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

function toOrderDetails(order: DbOrderForDetails): OrderDetails {
  return {
    orderId: order.id,
    customerName: order.user?.name ?? order.guestName ?? "Customer",
    customerEmail: order.user?.email ?? order.guestEmail ?? "",
    customerPhone: order.customerPhone,
    items: order.items.map((i) => ({ name: i.name, size: i.size, price: i.price, quantity: i.quantity })),
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

  // Email the customer once. A send failure must not undo the dispatch.
  try {
    await sendCustomerDispatchEmail({ ...toOrderDetails(order), trackingCode: parsed.data });
    await prisma.order.update({ where: { id: orderId }, data: { customerDispatchEmailSentAt: new Date() } });
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
      include: { items: { select: { productId: true, quantity: true } } },
    });
    if (!order) { results.push({ id, ok: false, error: "Not found" }); continue; }
    if (order.status === "CANCELLED") { results.push({ id, ok: false, error: "Already cancelled" }); continue; }
    if (order.status === "DELIVERED") { results.push({ id, ok: false, error: "Cannot cancel (DELIVERED)" }); continue; }
    try {
      await prisma.$transaction((tx) => cancelOrderTx(tx, id, order.items));
      results.push({ id, ok: true });
    } catch {
      results.push({ id, ok: false, error: "Cancel failed" });
    }
  }
  revalidatePath("/admin/orders");
  for (const r of results) if (r.ok) revalidatePath(`/admin/orders/${r.id}`);
  return summarize(results);
}

export async function deleteOrder(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Order not found" };
  if (order.status !== "CANCELLED") return { success: false, error: "Only cancelled orders can be deleted" };
  // Pure record removal: items & notes cascade-delete (schema onDelete: Cascade).
  // Do NOT restore stock here — cancellation already did.
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
    if (order.status !== "CANCELLED") { results.push({ id, ok: false, error: "Not cancelled" }); continue; }
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
