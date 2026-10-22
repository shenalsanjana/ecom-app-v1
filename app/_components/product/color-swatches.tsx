"use client";
import Image from "next/image";
import { isUploadedImage } from "@/app/_lib/uploaded-image";

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
  showLabels = false,
}: {
  options: SwatchOption[];
  selected: string;
  onSelect: (slug: string) => void;
  className?: string;
  showLabels?: boolean;
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
              "relative flex items-center gap-2 rounded-full border transition-[box-shadow,transform] duration-(--duration-fast) " +
              (showLabels ? "min-h-10 max-w-full px-2 py-1.5 text-left text-sm" : "h-8 w-8 overflow-hidden") + " " +
              (active ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "hover:scale-105 border-border")
            }
            style={!showLabels && o.swatchHex ? { backgroundColor: o.swatchHex } : undefined}
          >
            {showLabels ? (
              <>
                <span
                  aria-hidden="true"
                  className={"relative h-6 w-6 shrink-0 overflow-hidden border " + (o.swatchHex ? "rounded-full" : "rounded-md bg-muted")}
                  style={o.swatchHex ? { backgroundColor: o.swatchHex } : undefined}
                >
                  {!o.swatchHex && o.image && (
                    <Image src={o.image} alt="" fill unoptimized={isUploadedImage(o.image)} sizes="24px" className="object-contain" />
                  )}
                </span>
                <span className="min-w-0">{o.color}</span>
              </>
            ) : !o.swatchHex && o.image && (
              <Image src={o.image} alt="" fill unoptimized={isUploadedImage(o.image)} sizes="32px" className="object-contain" />
            )}
          </button>
        );
      })}
    </div>
  );
}
