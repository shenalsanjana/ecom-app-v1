"use client";

// Polls the order's payment status while the PayHere webhook is in flight.
// PayHere redirects the buyer back to /checkout/success the instant their
// payment is accepted, but the server-to-server webhook (which flips the order
// to PAID) is a separate request that can land a few seconds later. Without
// this poller, the user sees a yellow "awaiting payment" page directly after
// they pay — confusing.
//
// Strategy: poll every POLL_INTERVAL_MS for at most MAX_POLL_MS, then stop.
// When we observe PAID/COD_COLLECTED, call router.refresh() so the success
// page re-renders against the now-updated DB row.
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
          if (
            data.paymentStatus === "PAID" ||
            data.paymentStatus === "COD_COLLECTED"
          ) {
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
        Your payment was received by PayHere — confirmation is taking longer
        than usual. You&apos;ll get an email when it completes. You can refresh
        this page in a minute or check your email.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Please don&apos;t close this page.
    </p>
  );
}
