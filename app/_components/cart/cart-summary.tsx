// app/_components/cart/cart-summary.tsx
"use client";

import Link from "next/link";
import { useCart } from "@/app/_lib/cart-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/app/_lib/format";
import { calculateDelivery } from "@/app/_lib/checkout-config";
import { useDeliveryConfig } from "@/app/_components/delivery/delivery-config-provider";
import { FreeShippingProgress } from "@/app/_components/cart/free-shipping-progress";
import { InstallmentNote } from "@/app/_components/shared/installment-note";
import { PaymentMethodIcon } from "@/app/_components/shared/payment-method-icon";

export function CartSummary() {
  const { subtotal, totalItems } = useCart();
  const deliveryConfig = useDeliveryConfig();

  const shipping = calculateDelivery(subtotal, "COLOMBO", deliveryConfig);
  const total = subtotal + shipping;

  return (
    <div className="rounded-lg border p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Order Summary</h2>

      <Separator className="my-4" />

      <FreeShippingProgress subtotal={subtotal} />

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal ({totalItems} items)</span>
          <span className="font-heading">{formatPrice(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Delivery <span className="text-muted-foreground">(estimated)</span></span>
          <span className={`font-heading ${shipping === 0 ? "text-brand" : ""}`}>
            {shipping === 0 ? "Free" : formatPrice(shipping)}
          </span>
        </div>
      </div>

      <Separator className="my-4" />

      <div className="flex justify-between text-base font-semibold">
        <span className="font-heading">Total</span>
        <span className="font-heading">{formatPrice(total)}</span>
      </div>

      <InstallmentNote total={total} className="mt-3 text-center" />

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

      <div className="mt-4 flex items-center justify-center gap-4">
        {(["KOKO", "MINTPAY", "PAYHERE", "COD"] as const)
          .filter((m) => m !== "KOKO" || process.env.NEXT_PUBLIC_KOKO_ENABLED === "true")
          .map((m) => (
          <span key={m} className="flex h-6 items-center" aria-hidden>
            <PaymentMethodIcon method={m} />
          </span>
        ))}
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Delivery calculated at checkout
      </p>
    </div>
  );
}