import { hasPosPriceAdjustments } from "@/app/_lib/pos-adjustments";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderDetail, nextStatuses, financialEditsLocked, canEdit } from "@/app/_lib/admin-orders";
import { formatPrice } from "@/app/_lib/format";
import { orderReference } from "@/app/_lib/order-reference";
import { paymentStatusLabel } from "@/app/_lib/order-status";
import { OrderActions } from "@/app/_components/admin/orders/order-actions";
import { OrderItemsEditor } from "@/app/_components/admin/orders/order-items-editor";
import { OrderAdjustments } from "@/app/_components/admin/orders/order-adjustments";
import { AddressEditor } from "@/app/_components/admin/orders/address-editor";
import { OrderNotes } from "@/app/_components/admin/orders/order-notes";
import { PrintLabelLink } from "@/app/_components/admin/orders/print-label-link";
import { TrackingEditor } from "@/app/_components/admin/orders/tracking-editor";
import { PaymentReviewControl } from "@/app/_components/admin/orders/payment-review-control";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrderDetail(id);
  if (!order) notFound();

  const fixedPosPricing = hasPosPriceAdjustments(order);
  const collectionSale = order.salesChannel === "POS" && !order.shippingCity;
  const canEditOrder = canEdit(order) && !financialEditsLocked(order);
  const next = nextStatuses(order.status)[0] ?? null;
  const curfoxEnabled = process.env.ROYAL_EXPRESS_ENABLED === "true";
  const showManualDispatch = order.status === "CONFIRMED" && (!curfoxEnabled || !!order.courierLastError);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/admin/orders" className="text-sm text-muted-foreground">‹ Orders</Link>
        <h1 className="text-xl font-bold">{orderReference(order)}</h1>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{order.status}</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{paymentStatusLabel(order.paymentStatus) ?? "—"} · {order.paymentMethod}</span>
        <span className="ml-auto">{order.salesChannel === "POS"
          ? <Link href={`/admin/pos/receipts/${order.id}`} className="rounded-md border px-3 py-2 text-sm">View / print receipt</Link>
          : <PrintLabelLink waybill={order.courierWaybillNumber} />}</span>
      </div>

      {order.deletedAt && (
        <p role="status" className="mb-4 rounded-md border p-3 text-sm">
          This order is in Deleted. Its payment history and stock records are retained.
          Restore it from the Deleted tab to return it to the normal order lists.
        </p>
      )}

      {financialEditsLocked(order) && (
        <p className="mb-4 text-sm text-muted-foreground">Payment has started. Items, prices and delivery charges are locked to the payment amount.</p>
      )}
      {order.paymentReviewRequired && (
        <div role="alert" className="mb-4 rounded-lg border border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">
          <strong>Payment requires review.</strong> {order.paymentReviewReason}
          {(order.status === "CANCELLED" || order.paymentStatus === "PAID") && <PaymentReviewControl orderId={order.id} />}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <div className="rounded-lg border p-4">
            {order.adjustments.some(a => a.promotion) && <p className="mb-3 text-sm text-muted-foreground">Items are locked to preserve this order’s promotion eligibility. Cancel and place a new order to change items.</p>}
            {fixedPosPricing && <p className="mb-3 text-sm text-muted-foreground">POS costs and discounts are fixed to this sale. Items and pricing cannot be edited here.</p>}
            <OrderItemsEditor
              orderId={order.id}
              editable={canEditOrder && !fixedPosPricing && !order.adjustments.some(a => a.promotion)}
              items={order.items.map((i) => ({
                id: i.id, name: i.name, size: i.size, color: i.color, sku: i.sku,
                price: i.price, quantity: i.quantity,
                sizes: [...new Set([...(i.variant?.sizeStocks.map((s) => s.size) ?? []), ...(i.size ? [i.size] : [])])].join(","),
              }))}
            />
            <div className="mt-3 border-t pt-2 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></div>
              <div className="flex justify-between"><span>Shipping</span><span>{formatPrice(order.shippingCost)}</span></div>
              {order.adjustments.length > 0 && (
                <div className="flex justify-between">
                  <span>Adjustments</span>
                  <span>{formatPrice(order.adjustments.reduce((s, a) => s + a.amount, 0))}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold"><span>Total</span><span>{formatPrice(order.total)}</span></div>
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <OrderAdjustments orderId={order.id} editable={canEditOrder && !fixedPosPricing}
              adjustments={order.adjustments.map((a) => ({ id: a.id, label: a.label, amount: a.amount, promotion: a.promotion }))} />
          </div>
          <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Internal notes</h4>
            <OrderNotes orderId={order.id} notes={order.notesLog} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{collectionSale ? "Shop sale" : "Status & dispatch"}</h4>
            {collectionSale ? <p className="text-sm">Paid and collected in store.</p> : <>
            <p className="mb-3 text-sm">Delivery company: {order.deliveryCompany ?? "Royal Express"}</p>
            <PrintLabelLink waybill={order.courierWaybillNumber} />
            <OrderActions orderId={order.id} status={order.status} paymentMethod={order.paymentMethod}
              paymentStatus={order.paymentStatus} courierBooked={!!order.courierBookedAt} nextStatus={next}
              curfoxEnabled={curfoxEnabled} />
            {showManualDispatch && (
              <div className="mt-3 border-t pt-3">
                <TrackingEditor orderId={order.id} mode="dispatch" trackingCode={order.trackingCode} />
              </div>
            )}
            {order.status === "DISPATCHED" && (
              <div className="mt-3 border-t pt-3">
                <TrackingEditor orderId={order.id} mode="edit" trackingCode={order.trackingCode} />
              </div>
            )}
            </>}
          </div>
          <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Customer</h4>
            <div className="text-sm">{order.user?.name ?? order.guestName}<br />
              <span className="text-muted-foreground">{order.user?.email ?? order.guestEmail} · {order.customerPhone}</span></div>
          </div>
          {!collectionSale && <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Shipping address</h4>
            <AddressEditor orderId={order.id} locked={!!order.courierBookedAt || !canEdit(order) || financialEditsLocked(order)}
              address={{ line1: order.shippingLine1, line2: order.shippingLine2, city: order.shippingCity, country: order.shippingCountry, ...(order.salesChannel === "POS" ? { phone: order.customerPhone } : {}) }} />
          </div>}
          <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Payment</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{order.paymentMethodDisplay}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>{paymentStatusLabel(order.paymentStatus) ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{order.salesChannel === "POS" ? "Receipt #" : "Web #"}</span><span>{order.posNumber ?? order.webNumber ?? "—"}</span></div>
              {order.posPaymentReference && <div className="flex justify-between gap-2"><span className="text-muted-foreground">{order.paymentMethod === "CARD" ? "Terminal reference" : "Payment reference"}</span><span className="break-all">{order.posPaymentReference}</span></div>}
              {order.rbNumber && <div className="flex justify-between"><span className="text-muted-foreground">RB #</span><span>{order.rbNumber}</span></div>}
              {!collectionSale && <div className="flex justify-between"><span className="text-muted-foreground">Waybill</span><span>{order.courierWaybillNumber ?? "— (after dispatch)"}</span></div>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
