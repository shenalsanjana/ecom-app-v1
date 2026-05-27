"use client";

// Clears the local cart the moment the user lands on /checkout/success and the
// order isn't in a cancelled state. PayHere only redirects to this page when
// the payment was accepted (failures route to cancel_url), and COD orders are
// terminal as soon as they're placed — so it's safe to clear the cart even
// while we're still waiting on the webhook to flip paymentStatus to PAID.
// Without this, a user wandering back to /cart during the 0–30s polling
// window would see the items they just paid for and might re-pay.
import { useEffect } from "react";
import { useCart } from "@/app/_lib/cart-context";

export function ClearCartOnPaid({ shouldClear }: { shouldClear: boolean }) {
  const { clearCart } = useCart();

  useEffect(() => {
    if (shouldClear) clearCart();
  }, [shouldClear, clearCart]);

  return null;
}
