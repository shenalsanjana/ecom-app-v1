// app/_components/ui/slide-show.tsx
"use client";
import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { inkFor } from "@/app/_lib/taxonomy-tint";
import { dotLabel, rotates, slideIndex } from "@/app/_lib/slide-rotation";
import { useSlideTick } from "@/app/_components/ui/slide-clock";
import { isUploadedImage } from "@/app/_lib/uploaded-image";

export type Slide = { hex: string; photo?: string | null; label?: string; title?: string };

type SlideShowProps = {
  slides: Slide[];
  dots: "bottom-right" | "top-right";
  fadeMs: number;
  subject: string;
  /** `<Image sizes>` for this tile's photo layers -- distinct per grid
   *  (see department-card.tsx / design-tile.tsx), not copied from a shared
   *  default, since the two grids' columns are a different width apart. */
  sizes: string;
};

/**
 * One slide layer: the tint ground, an optional photo painted with
 * `next/image` (so the remotePatterns allowlist, resizing and lazy loading
 * all apply -- a raw CSS background-image bypasses every one of them), and
 * its optional caption/label overlay. Shared by both the static and
 * rotating paths below so they render pixel-identical layers; it carries no
 * hooks of its own, which is also why it's exported: tests can call it
 * directly (unlike RotatingSlideShow) without tripping the Rules of Hooks.
 */
export function SlideLayer({
  slide, active, fadeMs, sizes,
}: {
  slide: Slide;
  active: boolean;
  fadeMs: number;
  sizes: string;
}) {
  return (
    <div
      aria-hidden={!active}
      className="absolute inset-0"
      style={{
        backgroundColor: slide.hex, // ground: a missing or still-loading photo still has one
        opacity: active ? 1 : 0,
        transition: `opacity ${fadeMs}ms ease`,
      }}
    >
      {slide.photo && (
        <Image
          src={slide.photo}
          alt=""
          fill
          unoptimized={isUploadedImage(slide.photo)}
          sizes={sizes}
          className="object-cover object-center"
        />
      )}
      {slide.title && (
        <div className="absolute inset-0 flex items-center justify-center px-3 pb-[34px] pt-[14px] text-center">
          <span
            className="text-[15px] font-semibold leading-[1.2] text-balance"
            style={{ color: inkFor(slide.hex) }}
          >
            {slide.title}
          </span>
        </div>
      )}
      {slide.label && (
        <span className="absolute left-[10px] top-[10px] max-w-[calc(100%-20px)] truncate rounded-full bg-white/[.72] px-[9px] py-1 text-[10px] font-medium tracking-[.02em] text-[#5b524a] backdrop-blur-[4px]">
          {slide.label}
        </span>
      )}
    </div>
  );
}

/**
 * A tile with more than one image cross-fades through them off the shared
 * clock. A tile with one image or none renders it statically -- and, per
 * taxonomy-tile-slides/spec.md's first requirement, "SHALL NOT subscribe to
 * the clock". Rules of Hooks means that can't be an `if` guarding
 * useSlideTick(); it has to be a component boundary, so the static path
 * below never renders (and therefore never executes) the hook-owning
 * RotatingSlideShow at all.
 */
export function SlideShow({ slides, dots, fadeMs, subject, sizes }: SlideShowProps) {
  if (!rotates(slides.length)) {
    const slide = slides[0];
    return slide ? <SlideLayer slide={slide} active fadeMs={fadeMs} sizes={sizes} /> : null;
  }
  return <RotatingSlideShow slides={slides} dots={dots} fadeMs={fadeMs} subject={subject} sizes={sizes} />;
}

/**
 * Exported only so tests can assert, by identity, that a one-or-zero-slide
 * tile's render tree never contains this component -- i.e. that
 * useSlideTick() is never reached, not merely that its result goes unused.
 * Not meant to be imported by any consumer other than SlideShow itself.
 */
export function RotatingSlideShow({ slides, dots, fadeMs, subject, sizes }: SlideShowProps) {
  const [pinned, setPinned] = useState<number | null>(null);
  const tick = useSlideTick();
  const index = slideIndex(tick, slides.length, pinned);

  return (
    <>
      {slides.map((slide, i) => (
        <SlideLayer key={i} slide={slide} active={i === index} fadeMs={fadeMs} sizes={sizes} />
      ))}

      {/* Siblings of the tile's <Link>, not descendants (see department-card.tsx
          and design-tile.tsx, which render this component outside their Link):
          <button> inside <a> is invalid HTML, and a link's accessible name is
          computed from its subtree, so a dot nested inside the link used to
          multiply the link's announced name by every dot's own label. */}
      <div
        className={cn(
          "absolute z-10 flex items-center gap-1 rounded-full px-1.5 py-1 backdrop-blur-[4px]",
          dots === "bottom-right"
            ? "bottom-[10px] right-[10px] bg-white/60"
            : "right-[9px] top-[9px] bg-white/[.58]",
        )}
      >
        {slides.map((slide, i) => (
          <button
            key={i}
            type="button"
            aria-label={dotLabel(subject, slide.label, i, slides.length)}
            aria-current={i === index}
            // No preventDefault/stopPropagation needed: the dot is no longer
            // inside the tile's <a>, so a click here was never going to
            // navigate in the first place.
            onClick={() => setPinned(i)}
            // The visible dot stays 5x5 with a 4px gap (unchanged) -- WCAG
            // 2.5.8 wants a ~24x24 hit target, but neighboring dots sit
            // only 9px apart center-to-center (5px dot + 4px gap), so a
            // 24px target would collide with the next one. 8px is the
            // largest square that still leaves a 1px buffer between
            // neighbors. The negative margin pulls the enlarged box back
            // to a 5px layout footprint, so the row's spacing and the
            // pill's own size are untouched.
            className="grid place-items-center rounded-full"
            style={{ width: 8, height: 8, margin: "-1.5px" }}
          >
            <span
              aria-hidden="true"
              className="h-[5px] w-[5px] rounded-full"
              style={{ backgroundColor: i === index ? "rgba(20,15,10,.8)" : "rgba(20,15,10,.28)" }}
            />
          </button>
        ))}
      </div>
    </>
  );
}
