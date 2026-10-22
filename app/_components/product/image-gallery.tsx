"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { isUploadedImage } from "@/app/_lib/uploaded-image";

type GalleryVariant = { colorSlug: string; color?: string; detailImages: string[] };

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
  const sources = [...new Set((active ? active.detailImages : [fallbackImage]).map((src) => src.trim()).filter(Boolean))];
  const sharedSources = sources.filter((src) => variants.some((v) => v.colorSlug !== activeSlug && v.detailImages.includes(src)));

  return <GalleryImages key={activeSlug} sources={sources} sharedSources={sharedSources} productName={productName} color={active?.color} />;
}

function GalleryImages({ sources, sharedSources, productName, color }: { sources: string[]; sharedSources: string[]; productName: string; color?: string }) {
  const [selected, setSelected] = useState(0);
  const selectedIndex = Math.min(selected, Math.max(0, sources.length - 1));
  const current = sources[selectedIndex];
  const caption = sharedSources.includes(current) ? "Product details" : color;
  const imageLabel = [productName, caption, `image ${selectedIndex + 1}`].filter(Boolean).join(", ");

  return (
    <section aria-label="Product images" className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
        {current ? (
          <Image
            key={current}
            src={current}
            alt={imageLabel}
            fill
            unoptimized={isUploadedImage(current)}
            sizes="(min-width: 1280px) 740px, (min-width: 1024px) 60vw, 100vw"
            className="object-contain animate-in fade-in duration-(--duration-fast)"
            priority
          />
        ) : <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Image unavailable</p>}
      </div>
      {current && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span aria-live="polite">{caption ? `${caption} · ` : ""}{selectedIndex + 1} / {sources.length}</span>
          <a href={current} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">
            View full-size image
          </a>
        </div>
      )}
      {sources.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {sources.map((src, i) => {
            const isActive = i === selectedIndex;
            const thumbnailLabel = sharedSources.includes(src) ? "product details" : color;
            return (
              <button
                key={src}
                type="button"
                onClick={() => setSelected(i)}
                aria-label={`Show ${thumbnailLabel ? `${thumbnailLabel} ` : ""}image ${i + 1}`}
                aria-current={isActive ? "true" : "false"}
                className={
                  "relative aspect-square overflow-hidden rounded-md border bg-muted transition-opacity duration-(--duration-fast) " +
                  (isActive ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "hover:opacity-90")
                }
              >
                <Image src={src} alt="" fill unoptimized={isUploadedImage(src)} sizes="(min-width: 1280px) 180px, (min-width: 1024px) 15vw, 25vw" className="object-contain" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
