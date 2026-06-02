"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";

export type ActionResult =
  | { success: true; warning?: string }
  | { success: false; error: string };

function revalidate(orderId: string) {
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

const NoteSchema = z.string().trim().min(1).max(500);

export async function addNote(orderId: string, body: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = NoteSchema.safeParse(body);
  if (!parsed.success) return { success: false, error: "Note cannot be empty" };

  await prisma.orderNote.create({
    data: { orderId, authorEmail: session.user.email ?? "admin", body: parsed.data },
  });
  revalidate(orderId);
  return { success: true };
}

export async function markCodCollected(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentMethod !== "COD" || order.paymentStatus !== "COD_PENDING") {
    return { success: false, error: "Not a COD order awaiting collection" };
  }
  await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "COD_COLLECTED" } });
  revalidate(orderId);
  return { success: true };
}

import { nextStatuses } from "@/app/_lib/admin-orders";

export async function advanceStatus(orderId: string, to: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Order not found" };
  if (!nextStatuses(order.status).includes(to)) {
    return { success: false, error: `Cannot move order from ${order.status} to ${to}` };
  }
  await prisma.order.update({ where: { id: orderId }, data: { status: to } });
  revalidate(orderId);
  return { success: true };
}

const PAID = new Set(["PAID", "COD_COLLECTED"]);

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { select: { productId: true, quantity: true } } },
  });
  if (!order) return { success: false, error: "Order not found" };
  if (order.status === "CANCELLED") return { success: false, error: "Order is already cancelled" };
  if (order.status === "DELIVERED") return { success: false, error: "Delivered orders cannot be cancelled" };

  await prisma.$transaction(async (tx) => {
    for (const it of order.items) {
      await tx.product.updateMany({ where: { id: it.productId }, data: { stock: { increment: it.quantity } } });
    }
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
  });

  revalidate(orderId);
  return PAID.has(order.paymentStatus ?? "")
    ? { success: true, warning: "Order was paid — refund must be handled manually." }
    : { success: true };
}

import {
  applyItemChanges, recomputeTotals, canEdit, type ItemChange,
} from "@/app/_lib/admin-orders";

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

  const totals = recomputeTotals(order.items, parsed.data.city);
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

  const totals = recomputeTotals(next.nextItems, order.shippingCity);
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

import { bookCourierAndNotify } from "@/app/checkout/book-courier";
import { sendOrderConfirmationEmail, type OrderDetails } from "@/app/_lib/mailer";

type DbOrderWithItems = {
  id: string; guestName: string | null; guestEmail: string | null; customerPhone: string;
  shippingLine1: string; shippingLine2: string | null; shippingCity: string; shippingCountry: string;
  subtotal: number; shippingCost: number; total: number;
  paymentMethod: string; paymentMethodDisplay: string; paymentStatus: string | null;
  webNumber: string | null; rbNumber: string | null; notes: string | null; trackingCode: string | null;
  user: { name: string | null; email: string | null } | null;
  items: { name: string; size: string | null; price: number; quantity: number }[];
};

function toOrderDetails(order: DbOrderWithItems): OrderDetails {
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

const ORDER_INCLUDE = {
  user: { select: { name: true, email: true } },
  items: { select: { name: true, size: true, price: true, quantity: true } },
} as const;

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
  const waybill = await bookCourierAndNotify({ order: toOrderDetails(order as unknown as DbOrderWithItems) });
  revalidate(orderId);
  return waybill
    ? { success: true, warning: `Booked — waybill ${waybill}.` }
    : { success: false, error: "Courier booking failed — check Curfox / retry." };
}

export async function resendConfirmationEmail(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (!order) return { success: false, error: "Order not found" };
  const details = toOrderDetails(order as unknown as DbOrderWithItems);
  if (!details.customerEmail) return { success: false, error: "No customer email on this order" };
  await sendOrderConfirmationEmail(details);
  return { success: true, warning: details.trackingCode ? undefined : "Sent without a tracking code (not dispatched yet)." };
}
