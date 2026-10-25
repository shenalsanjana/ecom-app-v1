"use server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { prisma } from "@/app/_lib/prisma";
import { claimOrderMutation, OrderConflictError } from "@/app/_lib/order-concurrency";
import { RefundInputSchema, prepareRefund, type RefundInput } from "@/app/_lib/sales/refunds";
import { invalidateSalesReports } from "@/app/_lib/sales/service";

export type SalesActionResult = { success: true } | { success: false; error: string; uncertain?: boolean };
function refresh(orderId: string) { invalidateSalesReports(); revalidatePath("/admin/sales"); revalidatePath(`/admin/orders/${orderId}`); }
export async function recordSalesRefund(orderId: string, raw: RefundInput): Promise<SalesActionResult> {
  const session = await requireAdmin(), parsed = RefundInputSchema.safeParse(raw);
  if (!parsed.success || typeof orderId !== "string" || !orderId || orderId.length > 200) return { success: false, error: "Enter a verified refund reference, date, reason and valid amounts." };
  const input = { ...parsed.data, items: [...parsed.data.items].sort((a, b) => a.orderItemId.localeCompare(b.orderItemId)) };
  const hash = createHash("sha256").update(JSON.stringify({ orderId, ...input })).digest("hex");
  const previous = async () => {
    const existing = await prisma.salesRefund.findUnique({ where: { operationKey: input.operationKey } });
    if (!existing) return false;
    if (existing.orderId !== orderId || existing.payloadHash !== hash) throw new Error("This refund attempt was used for different details. Refresh before starting another record.");
    if (existing.voidedAt) throw new Error("This refund record was voided. Refresh before entering a corrected record.");
    return true;
  };
  try {
    if (await previous()) { refresh(orderId); return { success: true }; }
    await prisma.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: { orderBy: { id: "asc" } }, adjustments: true,
        paymentEvents: { where: { outcome: "PAID" }, select: { id: true }, take: 1 } } });
      if (!order) throw new Error("The order is unavailable.");
      const [sum, itemSums] = await Promise.all([
        tx.salesRefund.aggregate({ where: { orderId, voidedAt: null }, _sum: { merchandiseCents: true, shippingCents: true } }),
        tx.salesRefundItem.groupBy({ by: ["orderItemId"], where: { refund: { orderId, voidedAt: null } }, _sum: { amountCents: true, returnedQuantity: true } }),
      ]);
      const values = prepareRefund({ ...order, verifiedLatePayment: order.paymentEvents.length > 0 }, input, {
        shippingCents: sum._sum.shippingCents ?? 0, merchandiseCents: sum._sum.merchandiseCents ?? 0,
        items: itemSums.map(item => ({ orderItemId: item.orderItemId, amountCents: item._sum.amountCents ?? 0, returnedQuantity: item._sum.returnedQuantity ?? 0 })),
      });
      await claimOrderMutation(tx, order);
      await tx.salesRefund.create({ data: { orderId, operationKey: input.operationKey, payloadHash: hash, reference: input.reference, reason: input.reason,
        occurredAt: values.occurredAt, merchandiseCents: values.merchandiseCents, shippingCents: values.shippingCents, createdByEmail: session.user.email ?? session.user.id!, items: { create: values.items } } });
      await tx.order.update({ where: { id: orderId }, data: { hasSalesRefunds: true } });
      await tx.orderNote.create({ data: { orderId, authorEmail: session.user.email ?? "Admin", body: `Verified refund recorded: ${input.reference} · LKR ${((values.merchandiseCents + values.shippingCents) / 100).toFixed(2)} · ${input.reason}` } });
    }, { isolationLevel: "Serializable", maxWait: 2000, timeout: 8000 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      try { if (await previous()) { refresh(orderId); return { success: true }; } } catch (found) { return { success: false, error: found instanceof Error ? found.message : "Check the existing refund." }; }
      return { success: false, error: "This refund reference is already recorded for this order." };
    }
    if (error instanceof OrderConflictError || (error as { code?: string }).code === "P2034") {
      try { if (await previous()) { refresh(orderId); return { success: true }; } } catch { /* A changed attempt is rejected below. */ }
      return { success: false, error: "The order changed. Refresh and check the refund before retrying." };
    }
    const known = error instanceof Error && ["Only verified", "Choose a refund", "The refund", "The delivery refund", "Returned units", "Record returned", "A selected item", "This refund", "The order is unavailable"].some(prefix => error.message.startsWith(prefix));
    return { success: false, error: known ? (error as Error).message : "The refund record could not be confirmed. Retry with the same details to avoid a duplicate.", ...(!known ? { uncertain: true } : {}) };
  }
  refresh(orderId); return { success: true };
}
export async function voidSalesRefund(orderId: string, refundId: string, reason: string): Promise<SalesActionResult> {
  const session = await requireAdmin();
  if (![orderId, refundId].every(value => typeof value === "string" && value.length > 0 && value.length <= 200) || typeof reason !== "string" || reason.trim().length < 3 || reason.length > 500) return { success: false, error: "Enter a reason for voiding this reporting record." };
  try {
    await prisma.$transaction(async tx => {
      const refund = await tx.salesRefund.findUnique({ where: { id: refundId }, include: { order: true } });
      if (!refund || refund.orderId !== orderId) throw new Error("Unavailable refund");
      if (refund.voidedAt) return;
      await claimOrderMutation(tx, refund.order);
      await tx.salesRefund.update({ where: { id: refundId }, data: { voidedAt: new Date(), voidReason: reason.trim(), voidedByEmail: session.user.email ?? session.user.id } });
      await tx.orderNote.create({ data: { orderId, authorEmail: session.user.email ?? "Admin", body: `Refund reporting record voided: ${refund.reference} · ${reason.trim()}` } });
    }, { maxWait: 2000, timeout: 8000 });
  } catch { return { success: false, error: "The refund record changed or is unavailable. Refresh and try again." }; }
  refresh(orderId); return { success: true };
}
export async function setHistoricalCosts(orderId: string, raw: { itemId: string; unitCostCents: number | null }[]): Promise<SalesActionResult> {
  const session = await requireAdmin();
  const parsed = z.array(z.object({ itemId: z.string().min(1).max(200), unitCostCents: z.number().int().min(0).max(2_000_000_000).nullable() }).strict()).min(1).max(100).safeParse(raw);
  if (!parsed.success || typeof orderId !== "string" || !orderId || orderId.length > 200 || new Set(parsed.data.map(item => item.itemId)).size !== parsed.data.length) return { success: false, error: "Enter valid unit costs or leave unknown costs blank." };
  try {
    await prisma.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order || parsed.data.some(entry => !order.items.some(item => item.id === entry.itemId))) throw new Error("Unavailable item");
      const changes = parsed.data.filter(entry => order.items.find(item => item.id === entry.itemId)!.unitCostCents !== entry.unitCostCents);
      if (!changes.length) return;
      await claimOrderMutation(tx, order);
      for (const entry of changes) {
        await tx.orderItem.update({ where: { id: entry.itemId }, data: { unitCostCents: entry.unitCostCents } });
        await tx.salesRefundItem.updateMany({ where: { orderItemId: entry.itemId, refund: { orderId } }, data: { unitCostCents: entry.unitCostCents } });
      }
      await tx.orderNote.create({ data: { orderId, authorEmail: session.user.email ?? "Admin", body: `Historical product unit costs recorded/corrected: ${changes.map(entry => `${order.items.find(item => item.id === entry.itemId)!.name} = ${entry.unitCostCents === null ? "unknown" : `LKR ${(entry.unitCostCents / 100).toFixed(2)}`}`).join("; ")}` } });
    }, { maxWait: 2000, timeout: 8000 });
  } catch { return { success: false, error: "The order changed or a cost is unavailable. Refresh before saving again." }; }
  refresh(orderId); return { success: true };
}
