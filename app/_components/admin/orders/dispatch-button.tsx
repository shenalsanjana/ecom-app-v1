"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { bookCourier } from "@/app/admin/orders/actions";

export function DispatchButton({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => { const r = await bookCourier(orderId); alert(r.success ? r.warning : r.error); router.refresh(); })}
      className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
    >
      {pending ? "Booking…" : "Book courier"}
    </button>
  );
}
