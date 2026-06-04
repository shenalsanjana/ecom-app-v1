"use client";
import {
  bookCourier, advanceStatus, markCodCollected, resendConfirmationEmail, cancelOrder,
} from "@/app/admin/orders/actions";
import { useActionRunner, Spinner } from "./use-action-runner";

type Props = {
  orderId: string; status: string; paymentMethod: string; paymentStatus: string | null;
  courierBooked: boolean; nextStatus: string | null;
};

export function OrderActions(p: Props) {
  const { pending, runningLabel, run } = useActionRunner();
  const unpaidOnline = p.paymentMethod !== "COD" && p.paymentStatus !== "PAID";

  const advance = () => {
    if (!p.nextStatus) return;
    if (p.nextStatus === "CONFIRMED" && unpaidOnline) {
      run("advance", () => advanceStatus(p.orderId, "CONFIRMED", { allowUnpaid: true }),
        "This order isn't paid yet. Confirm and prepare to dispatch anyway?");
    } else {
      run("advance", () => advanceStatus(p.orderId, p.nextStatus!));
    }
  };

  return (
    <div className="space-y-2">
      {p.status === "CONFIRMED" && !p.courierBooked && (
        <button disabled={pending} onClick={() => run("dispatch", () => bookCourier(p.orderId))}
          className="flex w-full items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {runningLabel === "dispatch" && <Spinner />} 📦 Book courier (Curfox)
        </button>
      )}
      {p.nextStatus && (
        <button disabled={pending} onClick={advance}
          className="flex w-full items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
          {runningLabel === "advance" && <Spinner />} Mark {p.nextStatus.toLowerCase()}
        </button>
      )}
      {p.paymentMethod === "COD" && p.paymentStatus === "COD_PENDING" && (
        <button disabled={pending} onClick={() => run("cod", () => markCodCollected(p.orderId))}
          className="flex w-full items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
          {runningLabel === "cod" && <Spinner />} Mark COD collected
        </button>
      )}
      <button disabled={pending} onClick={() => run("resend", () => resendConfirmationEmail(p.orderId))}
        className="flex w-full items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
        {runningLabel === "resend" && <Spinner />} ✉ Resend confirmation
      </button>
      {p.status !== "DELIVERED" && p.status !== "CANCELLED" && (
        <button disabled={pending}
          onClick={() => run("cancel", () => cancelOrder(p.orderId), "Cancel this order and restore stock?")}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-destructive px-3 py-2 text-sm text-destructive disabled:opacity-50">
          {runningLabel === "cancel" && <Spinner />} Cancel order
        </button>
      )}
    </div>
  );
}
