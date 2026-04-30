"use client";

import { useState } from "react";
import Image from "next/image";

type GalleryImage = { url: string; sortOrder: number };

type Props = {
  images: GalleryImage[];
  productName: string;
  fallbackImage: string;
};

export function ImageGallery({ images, productName, fallbackImage }: Props) {
  const sources = images.length > 0 ? images.map((i) => i.url) : [fallbackImage];
  const [selected, setSelected] = useState(0);

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-lg border bg-zinc-50 dark:bg-zinc-900">
        <Image
          src={sources[selected]}
          alt={productName}
          fill
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-cover"
          priority
        />
      </div>
      {sources.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {sources.map((src, i) => {
            const active = i === selected;
            return (
              <button
                key={src}
                type="button"
                onClick={() => setSelected(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={active ? "true" : "false"}
                className={
                  "relative aspect-square overflow-hidden rounded-md border bg-zinc-50 dark:bg-zinc-900 " +
                  (active
                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                    : "hover:opacity-90")
                }
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 15vw, 25vw"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
