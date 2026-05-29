"use client";

// Polls the order's payment status while the provider's server-to-server
// callback is in flight. Online payment providers (PayHere, Koko, Mintpay)
// redirect the buyer back to /checkout/success as soon as the payment is
// accepted, but the server-to-server webhook/callback that flips the order to
// PAID is a separate request that can arrive a few seconds later. Without this
// poller, the user sees a yellow "awaiting payment" page directly after paying.
//
// Strategy: poll every POLL_INTERVAL_MS for at most MAX_POLL_MS, then stop.
// When we observe a terminal status (PAID, COD_COLLECTED, PAYMENT_FAILED),
// call router.refresh() so the success page re-renders against the updated DB row.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 30_000;

type PaymentStatusResponse = {
  paymentStatus?: string;
  paymentMethod?: string;
  error?: string;
};

export function PaymentStatusPoll({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    async function tick() {
      try {
        const res = await fetch(
          `/api/orders/${encodeURIComponent(orderId)}/payment-status`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as PaymentStatusResponse;
          if (["PAID", "COD_COLLECTED", "PAYMENT_FAILED"].includes(data.paymentStatus ?? "")) {
            router.refresh();
            return;
          }
        }
      } catch {
        // Network blip — keep polling until timeout.
      }

      if (cancelled) return;
      if (Date.now() - startedAt >= MAX_POLL_MS) {
        setTimedOut(true);
        return;
      }
      window.setTimeout(tick, POLL_INTERVAL_MS);
    }

    tick();
    return () => {
      cancelled = true;
    };
  }, [orderId, router]);

  if (timedOut) {
    return (
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Your payment was received — confirmation is taking longer than usual.
        You&apos;ll get an email when it completes. You can refresh this page in
        a minute or check your email.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Please don&apos;t close this page.
    </p>
  );
}
