import { notFound } from "next/navigation";
import { getOrderDetail, nextStatuses } from "@/app/_lib/admin-orders";
import { formatPrice } from "@/app/_lib/format";
import { paymentStatusLabel } from "@/app/_lib/order-status";
import { OrderActions } from "@/app/_components/admin/orders/order-actions";
import { OrderItemsEditor } from "@/app/_components/admin/orders/order-items-editor";
import { AddressEditor } from "@/app/_components/admin/orders/address-editor";
import { OrderNotes } from "@/app/_components/admin/orders/order-notes";
import { PrintLabelLink } from "@/app/_components/admin/orders/print-label-link";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrderDetail(id);
  if (!order) notFound();

  const canEditOrder = order.status !== "DELIVERED" && order.status !== "CANCELLED";
  const next = nextStatuses(order.status)[0] ?? null;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <a href="/admin/orders" className="text-sm text-muted-foreground">‹ Orders</a>
        <h1 className="text-xl font-bold">{order.webNumber ?? order.id}</h1>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{order.status}</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{paymentStatusLabel(order.paymentStatus) ?? "—"} · {order.paymentMethod}</span>
        <span className="ml-auto"><PrintLabelLink waybill={order.courierWaybillNumber} /></span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <div className="rounded-lg border p-4">
            <OrderItemsEditor
              orderId={order.id}
              editable={canEditOrder}
              items={order.items.map((i) => ({ id: i.id, name: i.name, size: i.size, price: i.price, quantity: i.quantity, sizes: i.product.sizes }))}
            />
            <div className="mt-3 border-t pt-2 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></div>
              <div className="flex justify-between"><span>Shipping</span><span>{formatPrice(order.shippingCost)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total</span><span>{formatPrice(order.total)}</span></div>
            </div>
          </div>
          <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Internal notes</h4>
            <OrderNotes orderId={order.id} notes={order.notesLog} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Status &amp; dispatch</h4>
            <OrderActions orderId={order.id} status={order.status} paymentMethod={order.paymentMethod}
              paymentStatus={order.paymentStatus} courierBooked={!!order.courierBookedAt} nextStatus={next} />
          </div>
          <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Customer</h4>
            <div className="text-sm">{order.user?.name ?? order.guestName}<br />
              <span className="text-muted-foreground">{order.user?.email ?? order.guestEmail} · {order.customerPhone}</span></div>
          </div>
          <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Shipping address</h4>
            <AddressEditor orderId={order.id} locked={!!order.courierBookedAt}
              address={{ line1: order.shippingLine1, line2: order.shippingLine2, city: order.shippingCity, country: order.shippingCountry }} />
          </div>
          <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Payment</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{order.paymentMethod}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>{paymentStatusLabel(order.paymentStatus) ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Web #</span><span>{order.webNumber ?? "—"}</span></div>
              {order.rbNumber && <div className="flex justify-between"><span className="text-muted-foreground">RB #</span><span>{order.rbNumber}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Waybill</span><span>{order.courierWaybillNumber ?? "— (after dispatch)"}</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
