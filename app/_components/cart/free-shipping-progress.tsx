"use client";

import { Truck } from "lucide-react";
import { formatPrice } from "@/app/_lib/format";
import { freeDeliveryExclusionNote } from "@/app/_lib/free-delivery-note";
import { useDeliveryConfig } from "@/app/_components/delivery/delivery-config-provider";

type Props = { subtotal: number };

// "Near threshold" = within 20% of qualifying. Once the customer is in the
// final stretch we shift copy + fill from neutral muted to brand olive so the
// momentum is felt visually as well as read in the copy.
const NEAR_THRESHOLD_FRACTION = 0.8;

export function FreeShippingProgress({ subtotal }: Props) {
  const { freeThreshold: FREE_DELIVERY_THRESHOLD } = useDeliveryConfig();

  // Empty cart — no progress bar (a 0% strip would feel like a bug).
  if (subtotal <= 0) return null;

  const qualified = subtotal >= FREE_DELIVERY_THRESHOLD;
  const remaining = Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal);
  const pct = qualified
    ? 100
    : Math.round((subtotal / FREE_DELIVERY_THRESHOLD) * 100);
  const near =
    !qualified && subtotal / FREE_DELIVERY_THRESHOLD >= NEAR_THRESHOLD_FRACTION;

  if (qualified) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-foreground transition-opacity duration-(--duration-slow) ease-(--ease-out)">
        <Truck className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          You qualify for free delivery!{" "}
          <span className="font-normal opacity-90">({freeDeliveryExclusionNote()})</span>
        </span>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <p
        className={`mb-2 flex items-center gap-2 text-sm transition-colors duration-(--duration-slow) ease-(--ease-out) ${
          near ? "text-brand" : "text-muted-foreground"
        }`}
      >
        <Truck className="h-4 w-4 shrink-0" aria-hidden />
        Add{" "}
        <span
          className={`font-semibold transition-colors duration-(--duration-slow) ease-(--ease-out) ${
            near ? "text-brand" : "text-foreground"
          }`}
        >
          {formatPrice(remaining)}
        </span>{" "}
        more for free delivery ({freeDeliveryExclusionNote()})
      </p>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progress to free delivery"
      >
        <div
          className="h-full rounded-full bg-brand transition-[width,opacity] duration-(--duration-slow) ease-(--ease-out)"
          style={{ width: `${pct}%`, opacity: near ? 1 : 0.7 }}
        />
      </div>
    </div>
  );
}
