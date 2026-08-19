// app/_components/shared/announcement-bar.tsx
import { marqueeMessages } from "@/app/_lib/marquee";

// Site-wide promo strip: free-shipping threshold + "pay in 3" + COD + drops,
// scrolling horizontally so the motion draws the eye. Scrolls away above the
// sticky header. Static (not dismissible) by design.
// Rendered in the layout above the DeliveryConfigProvider, so it takes the live
// threshold as a prop (the layout already fetched the config) rather than a hook.
// Koko is gated behind NEXT_PUBLIC_KOKO_ENABLED so we only advertise it once
// it's actually offered at checkout (mirrors the server-side KOKO_ENABLED flag).
//
// The message set is rendered twice back-to-back: the keyframes translate the
// track by -50%, so the second copy is what makes the loop seamless. It is
// purely visual, hence aria-hidden — a screen reader should hear the set once.
export function AnnouncementBar({ freeThreshold }: { freeThreshold: number }) {
  const kokoEnabled = process.env.NEXT_PUBLIC_KOKO_ENABLED === "true";
  const messages = marqueeMessages(freeThreshold, kokoEnabled);

  const set = (copy: 1 | 2) => (
    <ul
      className="flex shrink-0 items-center gap-[44px] pr-[44px]"
      aria-hidden={copy === 2 ? true : undefined}
    >
      {messages.map((m) => (
        <li
          key={m.key}
          className="flex items-center gap-[44px] whitespace-nowrap text-xs font-medium uppercase tracking-[0.06em]"
        >
          {m.text}
          <span className="opacity-40" aria-hidden>
            ✦
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="overflow-hidden bg-primary py-2 text-primary-foreground">
      <div className="flex w-max motion-safe:animate-marquee">
        {set(1)}
        {set(2)}
      </div>
    </div>
  );
}
