import { z } from "zod";
import { cents, isSettled, orderLines, type SalesOrder } from "./calculations";
const money = z.number().int().min(0).max(2_000_000_000);
export const RefundInputSchema = z.object({
  operationKey: z.uuid(), reference: z.string().trim().min(1).max(120).regex(/^[^\r\n\x00-\x1f]+$/).transform(value => value.toUpperCase()),
  reason: z.string().trim().min(3).max(500), occurredAt: z.iso.datetime(), shippingCents: money, verified: z.literal(true),
  items: z.array(z.object({ orderItemId: z.string().min(1).max(200), amountCents: money, returnedQuantity: z.number().int().min(0).max(10000) }).strict()).max(100),
}).strict().superRefine((input, ctx) => {
  if (new Set(input.items.map(item => item.orderItemId)).size !== input.items.length) ctx.addIssue({ code: "custom", path: ["items"], message: "Choose each order item once." });
  const total = input.shippingCents + input.items.reduce((sum, item) => sum + item.amountCents, 0);
  if (total <= 0 || total > 2_000_000_000) ctx.addIssue({ code: "custom", path: ["items"], message: "Enter a positive refund within the supported amount range." });
});
export type RefundInput = z.input<typeof RefundInputSchema>;
export type PastRefunds = { shippingCents: number; merchandiseCents: number; items: { orderItemId: string; amountCents: number; returnedQuantity: number }[] };
export function prepareRefund(order: SalesOrder & { paymentReviewRequired?: boolean; verifiedLatePayment?: boolean }, input: z.output<typeof RefundInputSchema>, past: PastRefunds, now = new Date()) {
  if (!isSettled(order.paymentStatus) && !(order.status === "CANCELLED" && order.paymentReviewRequired && order.verifiedLatePayment)) throw new Error("Only verified paid orders or reviewed late payments can have a recorded refund.");
  let occurredAt = new Date(input.occurredAt); const earliest = order.salesDateEstimated ? order.createdAt : order.salesPaidAt ?? order.createdAt;
  if (occurredAt > new Date(now.getTime() + 60_000) || occurredAt.getTime() < Math.floor(earliest.getTime() / 60000) * 60000) throw new Error("Choose a refund date after payment receipt and no later than now.");
  if (occurredAt < earliest) occurredAt = earliest; // datetime-local records minutes; keep receipt ordering within that minute.
  const lines = orderLines(order).lines, map = new Map(lines.map(line => [line.item.id, line]));
  const items = input.items.filter(item => item.amountCents || item.returnedQuantity).map(item => {
    const line = map.get(item.orderItemId);
    if (!line) throw new Error("A selected item does not belong to this order.");
    const previous = past.items.find(old => old.orderItemId === item.orderItemId);
    if (item.amountCents + (previous?.amountCents ?? 0) > line.net) throw new Error(`The refund for ${line.item.name} exceeds its remaining paid value.`);
    if (item.returnedQuantity + (previous?.returnedQuantity ?? 0) > line.item.quantity) throw new Error(`Returned units for ${line.item.name} exceed the purchased quantity.`);
    if (item.returnedQuantity && !["DISPATCHED", "DELIVERED"].includes(order.status)) throw new Error("Record returned-to-stock units only for dispatched or delivered items. Cancelled orders have already released their stock.");
    return { orderItemId: item.orderItemId, amountCents: item.amountCents, returnedQuantity: item.returnedQuantity,
      unitCostCents: line.item.unitCostCents, productKey: line.productKey, productName: line.productName, categoryKey: line.categoryKey, categoryName: line.categoryName, size: line.size };
  });
  const merchandiseCents = items.reduce((sum, item) => sum + item.amountCents, 0);
  if (input.shippingCents + past.shippingCents > cents(order.shippingCost)) throw new Error("The delivery refund exceeds the remaining delivery charge.");
  if (merchandiseCents + input.shippingCents + past.merchandiseCents + past.shippingCents > cents(order.total)) throw new Error("The refund exceeds this order's remaining paid total.");
  return { merchandiseCents, shippingCents: input.shippingCents, occurredAt, items };
}
