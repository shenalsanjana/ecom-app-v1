// app/_lib/marquee.ts
// Message set for the scrolling announcement marquee. Pure so it can be
// unit-tested without rendering: the component reads the Koko flag from the
// environment and passes it in.
import { formatPrice } from "@/app/_lib/format";
import {
  excludedMethodNamesFor,
  freeDeliveryExclusionNoteFor,
} from "@/app/_lib/free-delivery-note";

export type MarqueeMessage = { key: string; text: string };

export function marqueeMessages(
  freeThreshold: number,
  kokoEnabled: boolean,
): MarqueeMessage[] {
  const note = freeDeliveryExclusionNoteFor(kokoEnabled);
  const shipping =
    freeThreshold > 0
      ? `Free shipping over ${formatPrice(freeThreshold)} (${note})`
      : `Free shipping on everything (${note})`;
  return [
    { key: "shipping", text: shipping },
    {
      key: "installments",
      text: `Pay in 3 interest-free — ${excludedMethodNamesFor(kokoEnabled)}`,
    },
    { key: "cod", text: "Cash on Delivery island-wide" },
    { key: "drops", text: "New drops every week" },
  ];
}
