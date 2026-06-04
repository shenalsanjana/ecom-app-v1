"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceStatus, bookCourier, cancelOrder, markCodCollected } from "@/app/admin/orders/actions";

type Props = {
  orderId: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string | null;
  courierBooked: boolean;
  waybill: string | null;
};

type Result = { success: boolean; warning?: string; error?: string };

export function RowActions(p: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<Result>, confirmMsg?: string) =>
    start(async () => {
      if (confirmMsg && !window.confirm(confirmMsg)) return;
      const r = await fn();
      alert(r.success ? (r.warning ?? "Done") : r.error);
      router.refresh();
    });

  // Online orders (non-COD) must be PAID before they can be confirmed.
  const unpaidOnline = p.paymentMethod !== "COD" && p.paymentStatus !== "PAID";
  const terminal = p.status === "DELIVERED" || p.status === "CANCELLED";
  const showCodCollected = !terminal && p.paymentMethod === "COD" && p.paymentStatus === "COD_PENDING";

  // Secondary (⋯ menu) actions for this row's state.
  const menu: { label: string; run: () => void }[] = [];
  if (p.status === "CONFIRMED" && !p.courierBooked) {
    menu.push({ label: "Mark delivered", run: () => run(() => advanceStatus(p.orderId, "DELIVERED")) });
  }
  if (!terminal) {
    menu.push({ label: "Cancel order", run: () => run(() => cancelOrder(p.orderId), "Cancel this order and restore stock?") });
  }
  if (showCodCollected) {
    menu.push({ label: "Mark COD collected", run: () => run(() => markCodCollected(p.orderId)) });
  }

  return (
    <div className="flex items-center gap-2">
      {p.status === "PENDING" && (
        <button
          disabled={pending || unpaidOnline}
          title={unpaidOnline ? "Awaiting payment" : undefined}
          onClick={() => run(() => advanceStatus(p.orderId, "CONFIRMED"))}
          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          Confirm
        </button>
      )}
      {p.status === "CONFIRMED" && !p.courierBooked && (
        <button
          disabled={pending}
          onClick={() => run(() => bookCourier(p.orderId))}
          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          Dispatch
        </button>
      )}
      {p.status === "CONFIRMED" && p.courierBooked && (
        <button
          disabled={pending}
          onClick={() => run(() => advanceStatus(p.orderId, "DELIVERED"))}
          className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
        >
          Mark delivered
        </button>
      )}
      {terminal && <span className="text-muted-foreground">{p.waybill ?? "—"}</span>}

      {menu.length > 0 && (
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md border px-2 py-1 text-xs select-none">⋯</summary>
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border bg-background p-1 shadow-md">
            {menu.map((m) => (
              <button
                key={m.label}
                disabled={pending}
                onClick={(e) => {
                  const d = e.currentTarget.closest("details") as HTMLDetailsElement | null;
                  if (d) d.open = false;
                  m.run();
                }}
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-secondary disabled:opacity-50"
              >
                {m.label}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
