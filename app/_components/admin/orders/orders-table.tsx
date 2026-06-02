import Link from "next/link";
import { formatPrice } from "@/app/_lib/format";
import { paymentStatusLabel } from "@/app/_lib/order-status";
import { DispatchButton } from "./dispatch-button";

type Row = {
  id: string; webNumber: string | null; createdAt: Date; customerPhone: string;
  guestName: string | null; user: { name: string | null } | null;
  total: number; paymentMethod: string; paymentStatus: string | null; status: string;
  courierBookedAt: Date | null; courierWaybillNumber: string | null;
  _count: { items: number };
};

export function OrdersTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No orders match this view.</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
          <th className="p-2">Order #</th><th className="p-2">Date</th><th className="p-2">Customer</th>
          <th className="p-2">Items</th><th className="p-2">Total</th><th className="p-2">Payment</th>
          <th className="p-2">Status</th><th className="p-2">Dispatch</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.id} className="border-b hover:bg-secondary/40">
            <td className="p-2 font-medium">
              <Link href={`/admin/orders/${o.id}`} className="hover:underline">{o.webNumber ?? o.id}</Link>
            </td>
            <td className="p-2">{o.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Colombo" })}</td>
            <td className="p-2">{o.user?.name ?? o.guestName ?? "—"}<br /><span className="text-muted-foreground">{o.customerPhone}</span></td>
            <td className="p-2">{o._count.items}</td>
            <td className="p-2 font-medium">{formatPrice(o.total)}</td>
            <td className="p-2">{paymentStatusLabel(o.paymentStatus) ?? "—"}<br /><span className="text-muted-foreground">{o.paymentMethod}</span></td>
            <td className="p-2">{o.status}</td>
            <td className="p-2">
              {o.status === "CONFIRMED" && !o.courierBookedAt
                ? <DispatchButton orderId={o.id} />
                : <span className="text-muted-foreground">{o.courierWaybillNumber ?? "—"}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
