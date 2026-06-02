"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bookCourier, advanceStatus, markCodCollected, resendConfirmationEmail, cancelOrder,
} from "@/app/admin/orders/actions";

type Props = {
  orderId: string; status: string; paymentMethod: string; paymentStatus: string | null;
  courierBooked: boolean; nextStatus: string | null;
};

export function OrderActions(p: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ success: boolean; warning?: string; error?: string }>, confirmMsg?: string) =>
    start(async () => {
      if (confirmMsg && !window.confirm(confirmMsg)) return;
      const r = await fn();
      alert(r.success ? (r.warning ?? "Done") : r.error);
      router.refresh();
    });

  return (
    <div className="space-y-2">
      {p.status === "CONFIRMED" && !p.courierBooked && (
        <button disabled={pending} onClick={() => run(() => bookCourier(p.orderId))}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          📦 Book courier (Curfox)
        </button>
      )}
      {p.nextStatus && (
        <button disabled={pending} onClick={() => run(() => advanceStatus(p.orderId, p.nextStatus!))}
          className="w-full rounded-md border px-3 py-2 text-sm">Mark {p.nextStatus.toLowerCase()}</button>
      )}
      {p.paymentMethod === "COD" && p.paymentStatus === "COD_PENDING" && (
        <button disabled={pending} onClick={() => run(() => markCodCollected(p.orderId))}
          className="w-full rounded-md border px-3 py-2 text-sm">Mark COD collected</button>
      )}
      <button disabled={pending} onClick={() => run(() => resendConfirmationEmail(p.orderId))}
        className="w-full rounded-md border px-3 py-2 text-sm">✉ Resend confirmation</button>
      {p.status !== "DELIVERED" && p.status !== "CANCELLED" && (
        <button disabled={pending}
          onClick={() => run(() => cancelOrder(p.orderId), "Cancel this order and restore stock?")}
          className="w-full rounded-md border border-destructive px-3 py-2 text-sm text-destructive">Cancel order</button>
      )}
    </div>
  );
}
