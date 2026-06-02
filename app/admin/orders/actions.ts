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
