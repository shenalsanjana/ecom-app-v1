"use client";
import Image from "next/image";

export type SwatchOption = {
  colorSlug: string;
  color: string;
  swatchHex: string | null;
  image: string;
};

export function ColorSwatches({
  options,
  selected,
  onSelect,
  className = "",
}: {
  options: SwatchOption[];
  selected: string;
  onSelect: (slug: string) => void;
  className?: string;
}) {
  if (options.length <= 1) return null;
  return (
    <div className={"flex flex-wrap items-center gap-2 " + className} role="group" aria-label="Colors">
      {options.map((o) => {
        const active = o.colorSlug === selected;
        return (
          <button
            key={o.colorSlug}
            type="button"
            onClick={() => onSelect(o.colorSlug)}
            aria-pressed={active}
            aria-label={o.color}
            title={o.color}
            className={
              "relative h-8 w-8 overflow-hidden rounded-full border transition-[box-shadow,transform] duration-(--duration-fast) " +
              (active ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "hover:scale-105 border-border")
            }
            style={o.swatchHex ? { backgroundColor: o.swatchHex } : undefined}
          >
            {!o.swatchHex && (
              <Image src={o.image} alt="" fill sizes="32px" className="object-cover" />
            )}
          </button>
        );
      })}
    </div>
  );
}
