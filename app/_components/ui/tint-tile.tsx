import Link from "next/link";
import { cn } from "@/lib/utils";
import { inkFor } from "@/app/_lib/taxonomy-tint";

type TintTileProps = {
  href: string;
  label: string;
  subLabel?: string | null;
  hex: string;
  className?: string;
};

/** A tinted browse tile. Ink is chosen by measured contrast (`inkFor`), never by
 *  a luminance threshold — see the comment block in app/_lib/taxonomy-tint.ts. */
export function TintTile({ href, label, subLabel, hex, className }: TintTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex aspect-[3/4] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl px-4 text-center",
        "transition-transform duration-(--duration-base) ease-(--ease-out) motion-safe:hover:-translate-y-[3px]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className,
      )}
      style={{ backgroundColor: hex, color: inkFor(hex) }}
    >
      <span className="font-heading text-[28px] font-bold leading-tight">{label}</span>
      {subLabel && (
        <span className="font-mono text-[10px] uppercase tracking-[0.16em]">{subLabel}</span>
      )}
    </Link>
  );
}
