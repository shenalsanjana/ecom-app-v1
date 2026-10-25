import { prisma } from "@/app/_lib/prisma";
import { orderLines, isSettled, type SalesOrder } from "@/app/_lib/sales/calculations";
import { OrderSalesControls, type OrderSalesProps } from "./order-sales-controls";

export async function OrderSalesManager({ order }: { order: SalesOrder & { paymentReviewRequired: boolean } }) {
  let props: OrderSalesProps | null = null;
  try {
    const [sum, items, history, latePayment] = await Promise.all([
      prisma.salesRefund.aggregate({ where: { orderId: order.id, voidedAt: null }, _sum: { merchandiseCents: true, shippingCents: true } }),
      prisma.salesRefundItem.groupBy({ by: ["orderItemId"], where: { refund: { orderId: order.id, voidedAt: null } }, _sum: { amountCents: true, returnedQuantity: true } }),
      prisma.salesRefund.findMany({ where: { orderId: order.id }, take: 20, orderBy: { createdAt: "desc" }, select: { id: true, reference: true, merchandiseCents: true, shippingCents: true, occurredAt: true, reason: true, voidedAt: true } }),
      !isSettled(order.paymentStatus) && order.status === "CANCELLED" && order.paymentReviewRequired
        ? prisma.paymentEvent.findFirst({ where: { orderId: order.id, outcome: "PAID" }, select: { id: true } }) : null,
    ]);
    props = {
      orderId: order.id,
      eligible: isSettled(order.paymentStatus) || !!latePayment,
      canReturn: ["DISPATCHED", "DELIVERED"].includes(order.status),
      items: orderLines(order).lines.map(line => {
        const old = items.find(item => item.orderItemId === line.item.id);
        return { id: line.item.id, name: line.item.name, size: line.item.size, quantity: line.item.quantity, cost: line.item.unitCostCents,
          remainingCents: Math.max(0, line.net - (old?._sum.amountCents ?? 0)), remainingReturns: Math.max(0, line.item.quantity - (old?._sum.returnedQuantity ?? 0)) };
      }),
      remainingShipping: Math.max(0, Math.round(order.shippingCost * 100) - (sum._sum.shippingCents ?? 0)),
      refundedCents: (sum._sum.merchandiseCents ?? 0) + (sum._sum.shippingCents ?? 0),
      history: history.map(refund => ({ id: refund.id, reference: refund.reference, amount: refund.merchandiseCents + refund.shippingCents,
        occurredAt: refund.occurredAt.toISOString(), voided: !!refund.voidedAt, reason: refund.reason })),
    };
  } catch (error) {
    console.error("[sales] Order accounting read failed", { code: (error as { code?: string }).code });
  }
  if (!props) return <section className="rounded-lg border p-4 text-sm"><h2 className="font-semibold">Sales accounting</h2><p className="mt-2 text-muted-foreground">Sales accounting is temporarily unavailable for this order. Refresh shortly; order management remains available.</p></section>;
  return <OrderSalesControls {...props} />;
}
