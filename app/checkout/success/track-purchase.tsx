"use client";

// Fires the Meta Pixel Purchase event from the online-payment success page.
// Mirrors ClearCartOnPaid: it is a leaf client component nested inside the
// server-rendered OrderDetails, so when PaymentStatusPoll calls router.refresh()
// and `confirmed` flips to true, this re-renders and fires. Dedupe (by order id)
// lives server-side in trackPurchaseOnce's claim call, so refresh / back-nav /
// a different browser context never double-count.
import { useEffect } from "react";
import { trackPurchaseOnce } from "@/app/_lib/meta-pixel";

export function TrackPurchase({
  orderId,
  value,
  contentIds,
  confirmed,
}: {
  orderId: string;
  value: number;
  contentIds: string[];
  confirmed: boolean;
}) {
  useEffect(() => {
    if (!confirmed) return;
    void trackPurchaseOnce(orderId, value, contentIds);
  }, [confirmed, orderId, value, contentIds]);

  return null;
}
