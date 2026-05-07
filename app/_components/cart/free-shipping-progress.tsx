"use client";

import { Truck } from "lucide-react";
import { formatPrice } from "@/app/_lib/format";
import { FREE_SHIPPING_THRESHOLD } from "@/app/_lib/checkout-config";

type Props = { subtotal: number };

export function FreeShippingProgress({ subtotal }: Props) {
  // Empty cart — no progress bar (a 0% strip would feel like a bug).
  if (subtotal <= 0) return null;

  if (subtotal >= FREE_SHIPPING_THRESHOLD) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        <Truck className="h-4 w-4 shrink-0" aria-hidden />
        You qualify for free shipping!
      </div>
    );
  }

  const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
  const pct = Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100);

  return (
    <div className="mb-4">
      <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Truck className="h-4 w-4 shrink-0" aria-hidden />
        Add <span className="font-semibold text-foreground">{formatPrice(remaining)}</span> more for free shipping
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Free-shipping progress: ${pct}%`}
        />
      </div>
    </div>
  );
}
