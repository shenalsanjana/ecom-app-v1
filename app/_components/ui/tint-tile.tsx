import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { inkFor, INK_LIGHT, SCRIM_ALPHA } from "@/app/_lib/taxonomy-tint";

type TintTileProps = {
  href: string;
  label: string;
  subLabel?: string | null;
  hex: string;
  image?: string | null;
  className?: string;
};

/** A tinted browse tile.
 *
 *  Without an image, ink is chosen by measured contrast (`inkFor`), never by a
 *  luminance threshold — see the comment block in app/_lib/taxonomy-tint.ts.
 *  With one, contrast against the tint says nothing about legibility over the
 *  photograph, so the tile uses light ink over a scrim instead. The tint stays
 *  as the ground either way, so a slow or failed image still has a background. */
export function TintTile({ href, label, subLabel, hex, image, className }: TintTileProps) {
  const ink = image ? INK_LIGHT : inkFor(hex);
  return (
    <Link
      href={href}
      className={cn(
        "relative flex aspect-[3/4] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl px-4 text-center",
        "transition-transform duration-(--duration-base) ease-(--ease-out) motion-safe:hover:-translate-y-[3px]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className,
      )}
      style={{ backgroundColor: hex, color: ink }}
    >
      {image && (
        <>
          <Image src={image} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover" />
          {/* Flat, not a gradient: the label can sit anywhere in the tile, so
           *  the contrast guarantee (see SCRIM_ALPHA in taxonomy-tint.ts) has
           *  to hold everywhere, not just at one gradient stop. The opacity
           *  here and the one the test enforces are the same constant. */}
          <div
            data-scrim=""
            aria-hidden="true"
            className="absolute inset-0 bg-black"
            style={{ opacity: SCRIM_ALPHA }}
          />
        </>
      )}
      <span className="relative font-heading text-[28px] font-bold leading-tight">{label}</span>
      {subLabel && (
        <span className="relative font-mono text-[10px] uppercase tracking-[0.16em]">{subLabel}</span>
      )}
    </Link>
  );
}
