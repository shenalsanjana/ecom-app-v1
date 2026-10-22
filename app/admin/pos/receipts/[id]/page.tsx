import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { prisma } from "@/app/_lib/prisma";
import { getStoreSettings } from "@/app/_lib/store-settings";
import { formatPrice } from "@/app/_lib/format";
import { PrintReceiptButton } from "@/app/_components/admin/pos/print-receipt-button";
import "./receipt.css";

export default async function PosReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order || order.salesChannel !== "POS") notFound();
  const store = await getStoreSettings();

  return (
    <section>
      <div className="pos-receipt-controls mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin/pos" className="rounded-md border px-3 py-2 text-sm">‹ Shop POS</Link>
        <Link href={`/admin/orders/${order.id}`} className="mr-auto text-sm underline">Order details</Link>
        <PrintReceiptButton />
      </div>
      <article className="pos-receipt mx-auto max-w-sm rounded-lg border bg-white p-6 font-mono text-sm text-black">
        <div className="border-b border-dashed border-gray-400 pb-4 text-center">
          <h1 className="text-lg font-bold">{store.storeName}</h1>
          <p className="mt-1 whitespace-pre-line text-xs">{store.businessAddress}</p>
          <p className="text-xs">{store.supportPhone}</p>
          <h2 className="mt-4 font-bold">SALES RECEIPT</h2>
          <p>{order.posNumber}</p>
          <p className="mt-1 text-xs">{order.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Colombo" })} SLT</p>
        </div>
        <p className="my-3 text-xs">Customer: {order.guestName}</p>
        <ul className="space-y-3 border-y border-dashed border-gray-400 py-3">
          {order.items.map(item => <li key={item.id}>
            <p className="font-semibold">{item.name}</p>
            <p className="text-xs">{item.color} · {item.size} · {item.sku}</p>
            <div className="mt-1 flex justify-between gap-2"><span>{item.quantity} × {formatPrice(item.price)}</span><span>{formatPrice(item.price * item.quantity)}</span></div>
          </li>)}
        </ul>
        <div className="space-y-2 border-b border-dashed border-gray-400 py-3">
          <div className="flex justify-between text-base font-bold"><span>TOTAL</span><span>{formatPrice(order.total)}</span></div>
          <div className="flex justify-between"><span>Payment</span><span>{order.paymentMethod === "CASH" ? "Cash" : "Card terminal"}</span></div>
          {order.paymentMethod === "CASH" && <>
            <div className="flex justify-between"><span>Cash received</span><span>{formatPrice(order.posTendered ?? order.total)}</span></div>
            <div className="flex justify-between"><span>Change</span><span>{formatPrice(Math.max(0, Math.round(((order.posTendered ?? order.total) - order.total) * 100) / 100))}</span></div>
          </>}
          {order.posPaymentReference && <p className="break-all text-xs">Terminal reference: {order.posPaymentReference}</p>}
        </div>
        <p className="mt-4 text-center text-xs">Paid · Collected in store</p>
        <p className="mt-2 text-center text-xs">Thank you for shopping with us!</p>
      </article>
    </section>
  );
}
