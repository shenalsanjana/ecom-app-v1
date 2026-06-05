"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { formatPrice } from "@/app/_lib/format";
import { paymentStatusLabel } from "@/app/_lib/order-status";
import { Badge } from "@/components/ui/badge";
import { RowActions } from "./row-actions";
import { bulkConfirm, bulkDispatch, bulkCancel, bulkDelete, type BulkResult } from "@/app/admin/orders/actions";

type Row = {
  id: string; webNumber: string | null; createdAt: Date; customerPhone: string;
  guestName: string | null; user: { name: string | null } | null;
  total: number; paymentMethod: string; paymentStatus: string | null; status: string;
  courierBookedAt: Date | null; courierWaybillNumber: string | null;
  _count: { items: number };
};

const PAID_STATUSES = new Set(["PAID", "COD_COLLECTED"]);

export function OrdersTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No orders match this view.</p>;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allSelected = rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const report = (r: BulkResult, verb: string) => {
    const msg = `${r.okCount} ${verb}, ${r.skippedCount} skipped`;
    if (r.okCount > 0) toast.success(msg);
    else toast.error(msg);
    setSelected(new Set());
    router.refresh();
  };

  const confirmSelected = () =>
    start(async () => {
      const ids = [...selected];
      if (ids.length === 0) return;
      const unpaid = rows.filter((o) => selected.has(o.id) && o.paymentMethod !== "COD" && o.paymentStatus !== "PAID");
      if (unpaid.length > 0) {
        if (!window.confirm(`${unpaid.length} of these aren't paid yet. Confirm anyway?`)) return;
        report(await bulkConfirm(ids, { allowUnpaid: true }), "confirmed");
      } else {
        report(await bulkConfirm(ids), "confirmed");
      }
    });

  const dispatchSelected = () =>
    start(async () => {
      const ids = [...selected];
      if (ids.length === 0) return;
      report(await bulkDispatch(ids), "dispatched");
    });

  const cancelSelected = () =>
    start(async () => {
      const ids = [...selected];
      if (ids.length === 0) return;
      if (!window.confirm(`Cancel ${ids.length} order(s) and restore their stock?`)) return;
      const paidIds = new Set(
        rows.filter((o) => PAID_STATUSES.has(o.paymentStatus ?? "")).map((o) => o.id),
      );
      const r = await bulkCancel(ids);
      report(r, "cancelled");
      const paidCancelled = r.results.filter((res) => res.ok && paidIds.has(res.id)).length;
      if (paidCancelled > 0) {
        toast.warning(`${paidCancelled} were paid — handle refunds manually.`);
      }
    });

  const selectedRows = rows.filter((o) => selected.has(o.id));
  const allCancelled = selectedRows.length > 0 && selectedRows.every((o) => o.status === "CANCELLED");

  const deleteSelected = () =>
    start(async () => {
      const ids = [...selected];
      if (ids.length === 0) return;
      if (!window.confirm(`Permanently delete ${ids.length} cancelled order(s)? This cannot be undone.`)) return;
      report(await bulkDelete(ids), "deleted");
    });

  return (
    <div>
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mb-2 flex items-center gap-3 rounded-md border bg-secondary/60 px-3 py-2 text-sm">
          <span>{selected.size} selected</span>
          <button disabled={pending} onClick={confirmSelected}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">Confirm selected</button>
          <button disabled={pending} onClick={dispatchSelected}
            className="rounded-md border px-3 py-1 text-xs disabled:opacity-50">Dispatch selected</button>
          <button disabled={pending} onClick={cancelSelected} aria-label="Cancel selected orders"
            className="rounded-md border border-destructive px-3 py-1 text-xs text-destructive disabled:opacity-50">Cancel selected</button>
          {allCancelled && (
            <button disabled={pending} onClick={deleteSelected} aria-label="Permanently delete selected orders"
              className="rounded-md bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground disabled:opacity-50">Delete selected</button>
          )}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground">Clear</button>
        </div>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="p-2"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th>
            <th className="p-2">Order #</th><th className="p-2">Date</th><th className="p-2">Customer</th>
            <th className="p-2">Items</th><th className="p-2">Total</th><th className="p-2">Payment</th>
            <th className="p-2">Status</th><th className="p-2">Dispatch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-b hover:bg-secondary/40">
              <td className="p-2">
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)}
                  aria-label={`Select ${o.webNumber ?? o.id}`} />
              </td>
              <td className="p-2 font-medium">
                <Link href={`/admin/orders/${o.id}`} className="hover:underline">{o.webNumber ?? o.id}</Link>
              </td>
              <td className="p-2">{o.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Colombo" })}</td>
              <td className="p-2">{o.user?.name ?? o.guestName ?? "—"}<br /><span className="text-muted-foreground">{o.customerPhone}</span></td>
              <td className="p-2">{o._count.items}</td>
              <td className="p-2 font-medium">{formatPrice(o.total)}</td>
              <td className="p-2">
                <Badge variant="secondary">{paymentStatusLabel(o.paymentStatus) ?? "—"}</Badge>
                <br /><span className="text-muted-foreground">{o.paymentMethod}</span>
              </td>
              <td className="p-2"><Badge variant="outline">{o.status}</Badge></td>
              <td className="p-2">
                <RowActions orderId={o.id} status={o.status} paymentMethod={o.paymentMethod}
                  paymentStatus={o.paymentStatus} courierBooked={!!o.courierBookedAt} waybill={o.courierWaybillNumber} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
