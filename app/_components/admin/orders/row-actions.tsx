"use client";
import { advanceStatus, bookCourier, cancelOrder, deleteOrder, markCodCollected } from "@/app/admin/orders/actions";
import { useActionRunner, Spinner } from "./use-action-runner";

type Props = {
  orderId: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string | null;
  courierBooked: boolean;
  waybill: string | null;
};

export function RowActions(p: Props) {
  const { pending, runningLabel, run } = useActionRunner();

  // Online orders (non-COD) that are not yet PAID can still be confirmed, but
  // the admin is warned first.
  const unpaidOnline = p.paymentMethod !== "COD" && p.paymentStatus !== "PAID";
  const terminal = p.status === "DELIVERED" || p.status === "CANCELLED";
  const showCodCollected = !terminal && p.paymentMethod === "COD" && p.paymentStatus === "COD_PENDING";

  const confirmOrder = () =>
    unpaidOnline
      ? run("confirm", () => advanceStatus(p.orderId, "CONFIRMED", { allowUnpaid: true }),
          "This order isn't paid yet. Confirm and prepare to dispatch anyway?")
      : run("confirm", () => advanceStatus(p.orderId, "CONFIRMED"));

  // Secondary (⋯ menu) actions for this row's state.
  const menu: { label: string; run: () => void }[] = [];
  if (p.status === "CONFIRMED" && !p.courierBooked) {
    menu.push({ label: "Mark delivered", run: () => run("deliver", () => advanceStatus(p.orderId, "DELIVERED")) });
  }
  if (!terminal) {
    menu.push({ label: "Cancel order", run: () => run("cancel", () => cancelOrder(p.orderId), "Cancel this order and restore stock?") });
  }
  if (showCodCollected) {
    menu.push({ label: "Mark COD collected", run: () => run("cod", () => markCodCollected(p.orderId)) });
  }

  return (
    <div className="flex items-center gap-2">
      {p.status === "PENDING" && (
        <button
          disabled={pending}
          onClick={confirmOrder}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {runningLabel === "confirm" && <Spinner />} Confirm
        </button>
      )}
      {p.status === "CONFIRMED" && !p.courierBooked && (
        <button
          disabled={pending}
          onClick={() => run("dispatch", () => bookCourier(p.orderId))}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {runningLabel === "dispatch" && <Spinner />} Dispatch
        </button>
      )}
      {p.status === "DISPATCHED" && (
        <button
          disabled={pending}
          onClick={() => run("deliver", () => advanceStatus(p.orderId, "DELIVERED"))}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
        >
          {runningLabel === "deliver" && <Spinner />} Mark delivered
        </button>
      )}
      {terminal && <span className="text-muted-foreground">{p.waybill ?? "—"}</span>}
      {p.status === "CANCELLED" && (
        <button
          disabled={pending}
          onClick={() => run("delete", () => deleteOrder(p.orderId), "Permanently delete this cancelled order? This cannot be undone.")}
          className="inline-flex items-center gap-1 rounded-md border border-destructive px-2 py-1 text-xs text-destructive disabled:opacity-50"
          aria-label="Permanently delete this cancelled order"
        >
          {runningLabel === "delete" && <Spinner />} Delete
        </button>
      )}

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
