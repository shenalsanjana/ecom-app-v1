// app/_components/cart/cart-summary.tsx
"use client";

import Link from "next/link";
import { useCart } from "@/app/_lib/cart-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/app/_lib/format";
import { calculateShipping, FREE_SHIPPING_THRESHOLD } from "@/app/_lib/checkout-config";

export function CartSummary() {
  const { subtotal, totalItems } = useCart();

  const shipping = calculateShipping(subtotal);
  const total = subtotal + shipping;
  const remainingForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  return (
    <div className="rounded-lg border p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Order Summary</h2>

      <Separator className="my-4" />

      {remainingForFreeShipping > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          Add {formatPrice(remainingForFreeShipping)} more for free shipping
        </p>
      )}

      {subtotal >= FREE_SHIPPING_THRESHOLD && (
        <p className="mb-4 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          You qualify for free shipping!
        </p>
      )}

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal ({totalItems} items)</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Shipping</span>
          <span>{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
        </div>
      </div>

      <Separator className="my-4" />

      <div className="flex justify-between text-base font-semibold">
        <span>Total</span>
        <span>{formatPrice(total)}</span>
      </div>

      <div className="mt-4 flex gap-4 text-xs text-muted-foreground justify-center">
        <Link href="/refund-policy" className="hover:text-foreground underline underline-offset-2">Refund Policy</Link>
        <Link href="/privacy-policy" className="hover:text-foreground underline underline-offset-2">Privacy Policy</Link>
        <Link href="/terms-and-conditions" className="hover:text-foreground underline underline-offset-2">Terms & Conditions</Link>
      </div>

      <Link href="/checkout" className="block mt-6">
        <Button className="w-full" size="lg">
          Proceed to checkout
        </Button>
      </Link>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Shipping calculated at checkout
      </p>
    </div>
  );
}