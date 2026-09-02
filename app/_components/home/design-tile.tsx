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

/** Mirrors design-grid.tsx's grid-cols-[repeat(auto-fill,minmax(130px,1fr))]:
 *  roughly twice as many columns as the department grid at any given width.
 *  A caller laying the tiles out on a wider grid passes its own `sizes` --
 *  see the department page, whose columns are half again as wide. */
const SLIDE_SIZES = "(min-width:1024px) 12vw, (min-width:640px) 20vw, 33vw";

export function DesignTile({
  href, name, note, slides, sizes = SLIDE_SIZES,
}: {
  href: string; name: string; note: string; slides: Slide[]; sizes?: string;
}) {
  return (
    <div className="group relative block aspect-square overflow-hidden rounded-[14px] transition-transform duration-(--duration-base) ease-(--ease-out) motion-safe:hover:-translate-y-[3px]">
      <SlideShow slides={slides} dots="top-right" fadeMs={650} subject={name} sizes={sizes} />
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col gap-px px-3 pb-[11px] pt-[26px]"
        style={{ backgroundImage: CAPTION_GRADIENT }}
      >
        <span className="text-[15px] font-semibold leading-[1.15] text-white">{name}</span>
        {note && (
          <span className="font-mono text-[9px] uppercase tracking-[.14em] text-white/[.72]">
            {note}
          </span>
        )}
      </div>
      {/* The whole-tile click target, not the tile's wrapper: the dot buttons
          SlideShow renders (z-10, above this) must stay siblings of the link,
          not descendants -- see slide-show.tsx. Its accessible name is set
          explicitly because it has no content of its own to derive one from. */}
      <Link
        href={href}
        aria-label={name}
        className="absolute inset-0 z-[1] rounded-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />
    </div>
  );
}
