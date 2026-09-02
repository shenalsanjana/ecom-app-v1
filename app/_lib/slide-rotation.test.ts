import { describe, it, expect } from "vitest";
import { SLIDE_INTERVAL_MS, slideIndex, rotates, dotLabel } from "@/app/_lib/slide-rotation";

describe("slideIndex", () => {
  it("advances with the tick, wrapping at the end", () => {
    expect(slideIndex(0, 3, null)).toBe(0);
    expect(slideIndex(1, 3, null)).toBe(1);
    expect(slideIndex(3, 3, null)).toBe(0);
    expect(slideIndex(7, 3, null)).toBe(1);
  });

  it("starts at zero so server and first client paint agree", () => {
    // The island renders before any tick; a non-zero start would be a
    // hydration mismatch, the way DealsCountdown avoids one with a placeholder.
    expect(slideIndex(0, 4, null)).toBe(0);
  });

  it("holds a pinned slide regardless of the tick", () => {
    expect(slideIndex(5, 3, 2)).toBe(2);
    expect(slideIndex(99, 3, 0)).toBe(0);
  });

  it("never returns an out-of-range index", () => {
    expect(slideIndex(5, 1, null)).toBe(0);
    expect(slideIndex(0, 0, null)).toBe(0);
    expect(slideIndex(0, 2, 9)).toBe(0); // a stale pin cannot escape the range
  });
});

describe("rotates", () => {
  // This only tests the arithmetic; the "never subscribes to the clock" half
  // of the claim depends on SlideShow gating useSlideTick() behind a real
  // component boundary on this result, not an `if`. See
  // app/_components/ui/__tests__/slide-show.test.ts and the
  // "never renders the hook-owning RotatingSlideShow" cases in
  // department-card.test.ts / design-tile.test.ts for that half.
  it("is false for a single slide, so it never subscribes to the clock", () => {
    expect(rotates(0)).toBe(false);
    expect(rotates(1)).toBe(false);
    expect(rotates(2)).toBe(true);
  });
});

describe("dotLabel", () => {
  it("names a dot by its slide when the slide has a label", () => {
    expect(dotLabel("Women", "Cats", 0, 3)).toBe("Show Cats");
  });

  it("falls back to the tile's subject and position when it does not", () => {
    // Design tiles' slides are product photos with no caption of their own.
    expect(dotLabel("Cats", undefined, 1, 4)).toBe("Show Cats, image 2 of 4");
  });
});

describe("SLIDE_INTERVAL_MS", () => {
  it("matches the prototype", () => {
    expect(SLIDE_INTERVAL_MS).toBe(3800);
  });
});
