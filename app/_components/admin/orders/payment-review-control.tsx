"use client";

import { useState } from "react";
import { resolvePaymentReview } from "@/app/admin/orders/payment-actions";
import { useActionRunner } from "./use-action-runner";

export function PaymentReviewControl({ orderId }: { orderId: string }) {
  const [note, setNote] = useState("");
  const { pending, run } = useActionRunner();
  return (
    <div className="mt-3 space-y-2">
      <label className="block" htmlFor="payment-review-outcome">Verified payment or refund outcome</label>
      <textarea id="payment-review-outcome" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500}
        className="block w-full rounded border bg-white p-2" placeholder="Record the provider reference and what was verified or refunded." />
      <button disabled={pending || note.trim().length < 10} onClick={() => run("review", () => resolvePaymentReview(orderId, note))}
        className="rounded border px-3 py-1.5 disabled:opacity-50">Record outcome and resolve review</button>
    </div>
  );
}
