// app/_components/shared/announcement-bar.tsx
import { FREE_DELIVERY_THRESHOLD } from "@/app/_lib/checkout-config";
import { formatPrice } from "@/app/_lib/format";

// Site-wide promo strip: free-shipping threshold + Koko/Mintpay "pay in 3".
// Scrolls away above the sticky header. Static (not dismissible) by design.
export function AnnouncementBar() {
  return (
    <div className="bg-primary text-primary-foreground">
      <p className="mx-auto max-w-7xl px-4 py-2 text-center text-xs tracking-wide sm:px-6 lg:px-8">
        Free shipping over{" "}
        <span className="font-medium">{formatPrice(FREE_DELIVERY_THRESHOLD)}</span>
        {"  ·  "}Pay in 3 interest-free with{" "}
        <span className="font-medium">Koko</span> &amp;{" "}
        <span className="font-medium">Mintpay</span>
      </p>
    </div>
  );
}
