"use client";

// Clears the local cart the moment the user lands on /checkout/success and the
// order isn't in a cancelled state. PayHere only redirects to this page when
// the payment was accepted (failures route to cancel_url), and COD orders are
// terminal as soon as they're placed — so it's safe to clear the cart even
// while we're still waiting on the webhook to flip paymentStatus to PAID.
// Without this, a user wandering back to /cart during the 0–30s polling
// window would see the items they just paid for and might re-pay.
//
// We must wait for `isLoading` to become false before clearing — child effects
// run before parent effects, so the CartProvider's localStorage hydration
// (LOAD_CART) lands AFTER our CLEAR_CART otherwise, restoring the paid items.
import { useEffect } from "react";
import { useCart } from "@/app/_lib/cart-context";

export function ClearCartOnPaid({ shouldClear }: { shouldClear: boolean }) {
  const { clearCart, isLoading } = useCart();

  useEffect(() => {
    if (!shouldClear || isLoading) return;
    clearCart();
  }, [shouldClear, clearCart, isLoading]);

  return null;
}
