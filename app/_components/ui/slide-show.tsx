// app/_components/ui/slide-show.tsx
"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { inkFor } from "@/app/_lib/taxonomy-tint";
import { dotLabel, rotates, slideIndex } from "@/app/_lib/slide-rotation";
import { useSlideTick } from "@/app/_components/ui/slide-clock";

export type Slide = { hex: string; photo?: string | null; label?: string; title?: string };

export function SlideShow({
  slides, dots, fadeMs, subject,
}: {
  slides: Slide[];
  dots: "bottom-right" | "top-right";
  fadeMs: number;
  subject: string;
}) {
  const [pinned, setPinned] = useState<number | null>(null);
  const tick = useSlideTick();
  const index = slideIndex(tick, slides.length, pinned);
  const showDots = rotates(slides.length);

  return (
    <>
      {slides.map((slide, i) => (
        <div
          key={i}
          aria-hidden={i !== index}
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundColor: slide.hex, // ground: a failed photo still has one
            backgroundImage: slide.photo ? `url(${slide.photo})` : undefined,
            opacity: i === index ? 1 : 0,
            transition: `opacity ${fadeMs}ms ease`,
          }}
        >
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
      ))}

      {showDots && (
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
              onClick={(e) => {
                // The tile is a link; choosing a slide must not navigate.
                e.preventDefault();
                e.stopPropagation();
                setPinned(i);
              }}
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
      )}
    </>
  );
}
