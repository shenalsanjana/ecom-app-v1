// app/_components/home/design-tile.tsx
import Link from "next/link";
import { SlideShow, type Slide } from "@/app/_components/ui/slide-show";
import { CAPTION_OVERLAY, CAPTION_SCRIM_MIN_ALPHA } from "@/app/_lib/taxonomy-tint";

/**
 * A three-stop gradient, not two. The caption is ~66px tall, so a plain fade
 * from the bottom reaches only ~0.32 where the name's ascender sits -- far
 * under AA on the light tints. This holds CAPTION_SCRIM_MIN_ALPHA across the
 * whole text band and fades out only above it. See taxonomy-tint.ts.
 */
const CAPTION_GRADIENT =
  `linear-gradient(to top,` +
  ` color-mix(in srgb, ${CAPTION_OVERLAY} 85%, transparent) 0%,` +
  ` color-mix(in srgb, ${CAPTION_OVERLAY} ${Math.round(CAPTION_SCRIM_MIN_ALPHA * 100)}%, transparent) 62%,` +
  ` transparent 100%)`;

export function DesignTile({
  href, name, note, slides,
}: {
  href: string; name: string; note: string; slides: Slide[];
}) {
  return (
    <Link
      href={href}
      className="relative block aspect-square overflow-hidden rounded-[14px] transition-transform duration-(--duration-base) ease-(--ease-out) motion-safe:hover:-translate-y-[3px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <SlideShow slides={slides} dots="top-right" fadeMs={650} subject={name} />
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col gap-px px-3 pb-[11px] pt-[26px]"
        style={{ backgroundImage: CAPTION_GRADIENT }}
      >
        <span className="text-[15px] font-semibold leading-[1.15] text-white">{name}</span>
        <span className="font-mono text-[9px] uppercase tracking-[.14em] text-white/[.72]">
          {note}
        </span>
      </div>
    </Link>
  );
}
