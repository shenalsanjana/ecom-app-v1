// app/_components/shared/announcement-bar.tsx
import { formatPrice } from "@/app/_lib/format";
import { freeDeliveryExclusionNote } from "@/app/_lib/free-delivery-note";

// Site-wide promo strip: free-shipping threshold + "pay in 3".
// Scrolls away above the sticky header. Static (not dismissible) by design.
// Rendered in the layout above the DeliveryConfigProvider, so it takes the live
// threshold as a prop (the layout already fetched the config) rather than a hook.
// Koko is gated behind NEXT_PUBLIC_KOKO_ENABLED so we only advertise it once
// it's actually offered at checkout (mirrors the server-side KOKO_ENABLED flag).
export function AnnouncementBar({ freeThreshold }: { freeThreshold: number }) {
  const kokoEnabled = process.env.NEXT_PUBLIC_KOKO_ENABLED === "true";
  return (
    <div className="bg-primary text-primary-foreground">
      <p className="mx-auto max-w-7xl px-4 py-2 text-center text-xs tracking-wide sm:px-6 lg:px-8">
        {freeThreshold > 0 ? (
          <>
            Free shipping over{" "}
            <span className="font-medium">{formatPrice(freeThreshold)}</span>{" "}
            <span className="opacity-80">({freeDeliveryExclusionNote()})</span>
          </>
        ) : (
          <>
            <span className="font-medium">Free shipping for all products</span>{" "}
            <span className="opacity-80">({freeDeliveryExclusionNote()})</span>
          </>
        )}
        {"  ·  "}Pay in 3 interest-free with{" "}
        {kokoEnabled && (
          <>
            <span className="font-medium">Koko</span> &amp;{" "}
          </>
        )}
        <span className="font-medium">Mintpay</span>
      </p>
    </div>
  );
}
