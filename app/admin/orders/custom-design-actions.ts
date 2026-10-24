"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { prisma } from "@/app/_lib/prisma";
import { claimOrderMutation } from "@/app/_lib/order-concurrency";

const inputSchema = z.object({ orderId: z.string().min(1).max(200), itemId: z.string().min(1).max(200), received: z.boolean() });

export async function setCustomDesignReceived(orderId: string, itemId: string, received: boolean): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireAdmin();
  const parsed = inputSchema.safeParse({ orderId, itemId, received });
  if (!parsed.success) return { success: false, error: "Choose an order item and receipt status." };
  try {
    await prisma.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: { where: { id: itemId } } } });
      if (!order || order.deletedAt || order.status === "CANCELLED") throw new Error("This order is unavailable for design receipt updates.");
      const item = order.items[0];
      if (!item || !item.isCustomizedDesign) throw new Error("This customized item does not belong to the order.");
      if (!!item.designReceivedAt === received) return;
      await claimOrderMutation(tx, order);
      await tx.orderItem.update({ where: { id: item.id }, data: { designReceivedAt: received ? new Date() : null } });
      await tx.orderNote.create({ data: { orderId, authorEmail: session.user?.email ?? "Admin",
        body: `${received ? "Custom design received via WhatsApp" : "Custom design receipt reset to pending"}: ${item.name}` } });
    }, { maxWait: 3000, timeout: 8000 });
  } catch (error) {
    return { success: false, error: error instanceof Error && ["This order", "This customized", "This order changed"].some(prefix => error.message.startsWith(prefix))
      ? error.message : "Could not update design receipt. Please refresh and try again." };
  }
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/account/orders");
  revalidatePath("/checkout/success");
  return { success: true };
}
