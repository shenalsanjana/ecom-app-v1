"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { isUploadedImage } from "@/app/_lib/uploaded-image";

type GalleryVariant = { colorSlug: string; detailImages: string[] };

type Props = {
  variants: GalleryVariant[];
  defaultColorSlug: string;
  productName: string;
  fallbackImage: string;
};

export function ImageGallery({ variants, defaultColorSlug, productName, fallbackImage }: Props) {
  const colorParam = useSearchParams().get("color");
  const active =
    variants.find((v) => v.colorSlug === colorParam) ??
    variants.find((v) => v.colorSlug === defaultColorSlug) ??
    variants[0];
  const activeSlug = active?.colorSlug ?? "none";
  const sources = active && active.detailImages.length > 0 ? active.detailImages : [fallbackImage];

  const [selected, setSelected] = useState(0);
  // Reset to the first image whenever the selected color changes.
  useEffect(() => { setSelected(0); }, [activeSlug]);
  const current = sources[Math.min(selected, sources.length - 1)];

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
        <Image
          key={activeSlug}
          src={current}
          alt={productName}
          fill
          unoptimized={isUploadedImage(current)}
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-cover animate-in fade-in duration-(--duration-fast)"
          priority
        />
      </div>
      {sources.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {sources.map((src, i) => {
            const isActive = i === selected;
            return (
              <button
                key={src}
                type="button"
                onClick={() => setSelected(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={isActive ? "true" : "false"}
                className={
                  "relative aspect-square overflow-hidden rounded-md border bg-muted transition-opacity duration-(--duration-fast) " +
                  (isActive ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "hover:opacity-90")
                }
              >
                <Image src={src} alt="" fill unoptimized={isUploadedImage(src)} sizes="(min-width: 1024px) 15vw, 25vw" className="object-cover" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
