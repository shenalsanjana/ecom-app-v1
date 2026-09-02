# Taxonomy Section Visual Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the home page's "Shop by category" and "Shop by design" sections up to the storefront prototype — card bodies, gradient captions, rotating photo slides, real counts — without touching any other route.

**Architecture:** A shared `SlideShow` client component owns the rotating media area and subscribes to a single `SlideClock` interval, so every tile cross-fades in sync off one timer. Two server shells (`DepartmentCard`, `DesignTile`) wrap it with their own chrome and replace `TintTile`. All stateful arithmetic lives in pure `.ts` modules — the repo's test harness cannot render hooks, so logic that isn't pure cannot be tested.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Prisma/PostgreSQL, Vitest (node environment, no DOM), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-taxonomy-section-visual-fidelity-design.md`

## Global Constraints

- **The test harness has no DOM.** `vitest.config.ts` sets `environment: "node"` and includes only `app/**/*.test.ts` — no `.tsx`, no React Testing Library. Components are tested by calling them as plain functions and walking the returned element tree. **A component that calls hooks cannot be unit-tested here.** All logic therefore lives in pure `.ts` modules; client components carry wiring only. Precedent: `app/_lib/countdown.ts` (pure, tested) vs `app/_components/home/deals-countdown.tsx` (island, untested).
- **Client components stay hook-free where possible** so they remain tree-walkable — see `app/_components/header/mega-menu.tsx`, which is `"use client"` with no hooks.
- Never render an `async` Server Component inside a `"use client"` component (CLAUDE.md §3). Data crosses the boundary, not components.
- Tests that import anything reaching `app/_lib/taxonomy.ts` must mock both:
  ```ts
  vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
  vi.mock("next/cache", () => ({
    unstable_cache: (fn: unknown) => fn,
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
  }));
  ```
- Conventional commits per `openspec/COMMIT_PROCESS.md`. Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```
- Prototype values are final: rotation `3800ms`; fade `700ms` departments / `650ms` designs; department grid `auto-fill minmax(220px,1fr)` gap 6; design grid `auto-fill minmax(130px,1fr)` gap 3.5; `maxSlides = 4`.
- Work happens in a dedicated git worktree on `feat/taxonomy-section-visual-fidelity` (CLAUDE.md §1 step 5).

---

### Task 1: Caption contrast foundation

The gradient's guarantee is local and much weaker than today's flat scrim. This task establishes the constant everything else depends on, so it goes first — its outcome fixes the caption's colours in Task 6.

**Files:**
- Modify: `app/_lib/taxonomy-tint.ts`
- Test: `app/_lib/taxonomy-tint.test.ts`

**Interfaces:**
- Consumes: `contrastRatio`, `ALL_TINTS`, `compositeOverBlack` (existing)
- Produces:
  - `compositeOver(hex: string, overlay: string, alpha: number): string`
  - `CAPTION_SCRIM_MIN_ALPHA: number`
  - `CAPTION_OVERLAY: string` — `"#140f0a"`, matching the prototype's `rgb(20,15,10)`
  - `CAPTION_NOTE_ALPHA: number` — `0.72`

- [ ] **Step 1: Write the failing test**

Append to `app/_lib/taxonomy-tint.test.ts`:

```ts
import {
  compositeOver, CAPTION_SCRIM_MIN_ALPHA, CAPTION_OVERLAY, CAPTION_NOTE_ALPHA,
  ALL_TINTS, contrastRatio,
} from "@/app/_lib/taxonomy-tint";

describe("compositeOver", () => {
  it("reduces to compositeOverBlack when the overlay is black", () => {
    expect(compositeOver("#E4DCC6", "#000000", 0.6)).toBe(compositeOverBlack("#E4DCC6", 0.6));
  });

  it("returns the source untouched at alpha 0 and the overlay at alpha 1", () => {
    expect(compositeOver("#E4DCC6", "#140f0a", 0)).toBe("#e4dcc6");
    expect(compositeOver("#E4DCC6", "#140f0a", 1)).toBe("#140f0a");
  });
});

describe("the caption gradient's contrast floor", () => {
  // The caption sits over a gradient, not a flat scrim, so the guarantee holds
  // only where the text actually sits. CAPTION_SCRIM_MIN_ALPHA is the gradient's
  // floor across that band. If the photo never paints, the text sits on the tint
  // composited with that floor alone -- which must still clear AA.
  const grounds = Object.entries(ALL_TINTS).map(
    ([name, hex]) => [name, compositeOver(hex, CAPTION_OVERLAY, CAPTION_SCRIM_MIN_ALPHA)] as const,
  );

  it("clears AA for the caption's name line against every tint", () => {
    for (const [name, ground] of grounds) {
      expect(contrastRatio("#ffffff", ground), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("clears AA for the caption's note line, which is only 72% white at 9px", () => {
    // The note is the binding case: small text at partial opacity. Its effective
    // colour is white composited onto the same ground at CAPTION_NOTE_ALPHA.
    for (const [name, ground] of grounds) {
      const note = compositeOver(ground, "#ffffff", CAPTION_NOTE_ALPHA);
      expect(contrastRatio(note, ground), name).toBeGreaterThanOrEqual(4.5);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/taxonomy-tint.test.ts`
Expected: FAIL — `compositeOver`, `CAPTION_SCRIM_MIN_ALPHA`, `CAPTION_OVERLAY`, `CAPTION_NOTE_ALPHA` are not exported.

- [ ] **Step 3: Write the implementation**

In `app/_lib/taxonomy-tint.ts`, add `compositeOver` and redefine `compositeOverBlack` in terms of it:

```ts
/**
 * The colour produced by painting `overlay` at `alpha` over `hex`. Pure alpha
 * compositing, per channel: out = src*(1-alpha) + overlay*alpha.
 */
export function compositeOver(hex: string, overlay: string, alpha: number): string {
  const src = parseInt(hex.slice(1), 16);
  const ov = parseInt(overlay.slice(1), 16);
  const channels = [16, 8, 0].map((shift) => {
    const s = (src >> shift) & 255;
    const o = (ov >> shift) & 255;
    return Math.round(s * (1 - alpha) + o * alpha);
  });
  return "#" + channels.map((c) => c.toString(16).padStart(2, "0")).join("");
}

/** @deprecated-internal Kept as the `#000` case of `compositeOver`. */
export function compositeOverBlack(hex: string, alpha: number): string {
  return compositeOver(hex, "#000000", alpha);
}

/** The prototype's caption overlay -- a warm near-black, not pure black. */
export const CAPTION_OVERLAY = "#140f0a";

/** The caption's note line is 72% white over the gradient. */
export const CAPTION_NOTE_ALPHA = 0.72;

/**
 * The gradient's alpha floor across the caption's text band.
 *
 * A plain two-stop `to top` gradient cannot work here. With the caption box at
 * `padding: 26px 12px 11px` (~66px tall), a fade from 0.8 at the bottom reaches
 * only ~0.32 where the name's ascender sits -- about 2.8:1 against white on the
 * lightest tint. Holding 0.55 at that height would need a bottom stop above 1.0.
 *
 * So the gradient is three-stop: it holds this floor across the whole text band
 * and fades out only in the top third (see DesignTile). 0.62 carries the name
 * but leaves the 72%-white note at ~4.3:1; 0.68 clears both. The tests above are
 * the authority -- raise this if either fails.
 */
export const CAPTION_SCRIM_MIN_ALPHA = 0.68;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/taxonomy-tint.test.ts`
Expected: PASS, including the pre-existing `SCRIM_ALPHA` tests, which must be untouched — `TintTile` still ships until Task 8.

If the note assertion fails, raise `CAPTION_SCRIM_MIN_ALPHA` in steps of `0.02` until it passes, and record the final value in the constant's comment. Do not lower the 4.5 threshold.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/taxonomy-tint.ts app/_lib/taxonomy-tint.test.ts
git commit -m "$(cat <<'EOF'
feat(tint): guarantee caption contrast over a gradient, not a flat scrim

A pinned caption's scrim is local, so the flat-scrim guarantee no longer
applies. Generalises compositeOverBlack to any overlay and adds the
gradient's alpha floor, measured so both caption lines clear AA against
every tint when the photo does not paint.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Slide rotation logic

Pure, because the harness cannot render hooks. This is all the behaviour the carousel has; `SlideShow` in Task 4 is wiring around it.

**Files:**
- Create: `app/_lib/slide-rotation.ts`
- Test: `app/_lib/slide-rotation.test.ts`

**Interfaces:**
- Produces:
  - `SLIDE_INTERVAL_MS: number` — `3800`
  - `slideIndex(tick: number, count: number, pinned: number | null): number`
  - `rotates(count: number): boolean`
  - `dotLabel(subject: string, slideLabel: string | undefined, index: number, total: number): string`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/slide-rotation.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/slide-rotation.test.ts`
Expected: FAIL — cannot resolve `@/app/_lib/slide-rotation`.

- [ ] **Step 3: Write the implementation**

Create `app/_lib/slide-rotation.ts`:

```ts
// app/_lib/slide-rotation.ts
// Pure rotation arithmetic for the taxonomy tiles' slide shows. Kept out of the
// client island so it can be unit-tested -- the Vitest run is node-only with no
// DOM, so a hooks-based component cannot be rendered at all.

/** The prototype advances every tile off one clock at this interval. */
export const SLIDE_INTERVAL_MS = 3800;

/** A tile only rotates, and only subscribes to the clock, with something to rotate. */
export function rotates(count: number): boolean {
  return count > 1;
}

/**
 * Which slide is showing. A pin wins over the tick: once a visitor picks a
 * slide, advancing past it takes the page back off them. Both paths clamp, so
 * a stale pin left by a shorter slide list cannot escape the range.
 */
export function slideIndex(tick: number, count: number, pinned: number | null): number {
  if (count <= 0) return 0;
  if (pinned !== null) return Math.min(Math.max(pinned, 0), count - 1);
  return ((tick % count) + count) % count;
}

/** Accessible name for a dot. Design-tile slides are photos with no caption. */
export function dotLabel(
  subject: string,
  slideLabel: string | undefined,
  index: number,
  total: number,
): string {
  return slideLabel ? `Show ${slideLabel}` : `Show ${subject}, image ${index + 1} of ${total}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/slide-rotation.test.ts`
Expected: PASS, 11 assertions.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/slide-rotation.ts app/_lib/slide-rotation.test.ts
git commit -m "$(cat <<'EOF'
feat(taxonomy): add pure slide-rotation arithmetic

All the carousel's behaviour, kept pure so it is testable: the Vitest run
is node-only, so the island wrapping this cannot be rendered at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Per-design photos and counts

**Files:**
- Create: `app/_lib/taxonomy-media.ts`
- Test: `app/_lib/taxonomy-media.test.ts`

**Interfaces:**
- Produces:
  - `type DesignMedia = { photos: string[]; count: number }`
  - `type ProductMediaRow = { designSlug: string; variants: { images: { url: string }[] }[] }`
  - `MAX_SLIDES: number` — `4`
  - `designMedia(rows: ProductMediaRow[], maxSlides?: number): Map<string, DesignMedia>`
  - `getDesignMedia(): Promise<Map<string, DesignMedia>>`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/taxonomy-media.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { designMedia, MAX_SLIDES, type ProductMediaRow } from "@/app/_lib/taxonomy-media";

const withPhoto = (designSlug: string, url: string): ProductMediaRow => ({
  designSlug, variants: [{ images: [{ url }] }],
});

describe("designMedia", () => {
  it("groups photos and counts by design slug", () => {
    const media = designMedia([
      withPhoto("cat", "/a.jpg"), withPhoto("cat", "/b.jpg"), withPhoto("dino", "/c.jpg"),
    ]);

    expect(media.get("cat")).toEqual({ photos: ["/a.jpg", "/b.jpg"], count: 2 });
    expect(media.get("dino")).toEqual({ photos: ["/c.jpg"], count: 1 });
  });

  it("counts a product with no variant, which contributes no photo", () => {
    // Prisma's nested select returns an empty array rather than dropping the
    // parent row -- the product is real, it just has nothing to show.
    const media = designMedia([withPhoto("cat", "/a.jpg"), { designSlug: "cat", variants: [] }]);
    expect(media.get("cat")).toEqual({ photos: ["/a.jpg"], count: 2 });
  });

  it("counts a variant with no CARD image the same way", () => {
    const media = designMedia([{ designSlug: "cat", variants: [{ images: [] }] }]);
    expect(media.get("cat")).toEqual({ photos: [], count: 1 });
  });

  it("caps photos while still counting every product", () => {
    const rows = Array.from({ length: 7 }, (_, i) => withPhoto("cat", `/${i}.jpg`));
    const media = designMedia(rows);

    expect(media.get("cat")!.photos).toEqual(["/0.jpg", "/1.jpg", "/2.jpg", "/3.jpg"]);
    expect(media.get("cat")!.count).toBe(7);
  });

  it("honours an explicit cap", () => {
    const rows = Array.from({ length: 3 }, (_, i) => withPhoto("cat", `/${i}.jpg`));
    expect(designMedia(rows, 2).get("cat")!.photos).toHaveLength(2);
  });

  it("reports nothing for a design with no products", () => {
    expect(designMedia([]).get("cat")).toBeUndefined();
  });

  it("caps at four by default", () => {
    expect(MAX_SLIDES).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/taxonomy-media.test.ts`
Expected: FAIL — cannot resolve `@/app/_lib/taxonomy-media`.

- [ ] **Step 3: Write the implementation**

Create `app/_lib/taxonomy-media.ts`:

```ts
// app/_lib/taxonomy-media.ts
import { unstable_cache } from "next/cache";
import { prisma } from "@/app/_lib/prisma";

/** Up to this many photos rotate on a design tile. */
export const MAX_SLIDES = 4;

export type DesignMedia = { photos: string[]; count: number };

/** One non-archived product, with its default variant's first CARD image. */
export type ProductMediaRow = {
  designSlug: string;
  variants: { images: { url: string }[] }[];
};

/**
 * Photos and product counts per design. Pure, and separate from the query, so
 * the arithmetic is testable without a database -- the same split
 * `taxonomy-counts.ts` uses.
 *
 * The row set IS the non-archived products, so counting rows gives the caption
 * and the first `maxSlides` urls give the slides. A product with no variant, or
 * a variant with no CARD image, still counts but contributes no photo.
 */
export function designMedia(
  rows: ProductMediaRow[],
  maxSlides: number = MAX_SLIDES,
): Map<string, DesignMedia> {
  const media = new Map<string, DesignMedia>();
  for (const row of rows) {
    const entry = media.get(row.designSlug) ?? { photos: [], count: 0 };
    entry.count += 1;
    const url = row.variants[0]?.images[0]?.url;
    if (url && entry.photos.length < maxSlides) entry.photos.push(url);
    media.set(row.designSlug, entry);
  }
  return media;
}

/**
 * Read only by the home route. Deliberately NOT folded into getDepartments():
 * the footer calls that on every page, so nesting product -> variant -> image
 * into it would slow ~20 routes for data only this one reads.
 *
 * Tagged "catalog", which the admin actions already bust with
 * revalidateTag("catalog", "max") -- no new invalidation is introduced.
 */
export const getDesignMedia = unstable_cache(
  async (): Promise<Map<string, DesignMedia>> => {
    const rows = await prisma.product.findMany({
      where: { archived: false },
      orderBy: [{ designSlug: "asc" }, { id: "asc" }], // deterministic slide order
      select: {
        designSlug: true,
        variants: {
          where: { archived: false },
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: {
            images: {
              where: { role: "CARD" },
              orderBy: { sortOrder: "asc" },
              take: 1,
              select: { url: true },
            },
          },
        },
      },
    });
    return designMedia(rows);
  },
  ["design-media"],
  { tags: ["catalog", "products"], revalidate: 3600 },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/taxonomy-media.test.ts`
Expected: PASS, 7 assertions.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/taxonomy-media.ts app/_lib/taxonomy-media.test.ts
git commit -m "$(cat <<'EOF'
feat(taxonomy): read per-design photos and product counts

One query serves both: the row set is the non-archived products, so
counting rows gives the caption and the first four urls give the slides.
Kept out of getDepartments(), which the footer calls on every page.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The slide show island

Two thin client components. Neither gets a unit test — they call hooks, so the node-only harness cannot render them, and all their logic already lives in Task 2. They are covered indirectly: Tasks 5 and 6 assert on the props handed to `SlideShow`, exactly as `design-grid.test.ts` asserts on the props handed to `TintTile` today.

**Files:**
- Create: `app/_components/ui/slide-clock.tsx`
- Create: `app/_components/ui/slide-show.tsx`

**Interfaces:**
- Consumes: `SLIDE_INTERVAL_MS`, `slideIndex`, `rotates`, `dotLabel` (Task 2)
- Produces:
  - `SlideClock: ({ children }: { children: React.ReactNode }) => JSX.Element`
  - `useSlideTick(): number`
  - `type Slide = { hex: string; photo?: string | null; label?: string; title?: string }`
  - `SlideShow: (props: { slides: Slide[]; dots: "bottom-right" | "top-right"; fadeMs: number; subject: string }) => JSX.Element`

- [ ] **Step 1: Write `SlideClock`**

Create `app/_components/ui/slide-clock.tsx`:

```tsx
// app/_components/ui/slide-clock.tsx
"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { SLIDE_INTERVAL_MS } from "@/app/_lib/slide-rotation";

const TickContext = createContext(0);

/** Every tile reads this, so they all cross-fade together off one interval.
 *  One timer, not one per tile: N intervals drift visibly apart. */
export function useSlideTick(): number {
  return useContext(TickContext);
}

export function SlideClock({ children }: { children: React.ReactNode }) {
  // Starts at 0 and only advances after mount, so the server's HTML and the
  // first client paint agree -- the hydration rule DealsCountdown follows.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // A CSS `motion-safe:` class cannot gate a setInterval, so the query is
    // read here instead. Under reduced motion the timer never starts; the
    // dots stay clickable, so the slides remain reachable.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTick((t) => t + 1), SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return <TickContext.Provider value={tick}>{children}</TickContext.Provider>;
}
```

- [ ] **Step 2: Write `SlideShow`**

Create `app/_components/ui/slide-show.tsx`:

```tsx
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
              className="h-[5px] w-[5px] rounded-full"
              style={{ backgroundColor: i === index ? "rgba(20,15,10,.8)" : "rgba(20,15,10,.28)" }}
            />
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Verify it compiles and the existing suite still passes**

Run: `npx tsc --noEmit && npm run test`
Expected: no type errors; the full suite passes unchanged — nothing consumes these yet.

- [ ] **Step 4: Commit**

```bash
git add app/_components/ui/slide-clock.tsx app/_components/ui/slide-show.tsx
git commit -m "$(cat <<'EOF'
feat(taxonomy): add the slide-show island and its shared clock

One interval for every tile, so they cross-fade in sync rather than
drifting. The tick starts at zero and advances only after mount, and
never starts at all under prefers-reduced-motion.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Department cards

**Files:**
- Create: `app/_components/home/department-card.tsx`
- Modify: `app/_components/home/department-cards.tsx`
- Test: `app/_components/home/__tests__/department-cards.test.ts`

**Interfaces:**
- Consumes: `SlideShow`, `Slide` (Task 4); `DepartmentView`, `showsNavDropdown` (existing)
- Produces: `DepartmentCard: (props: { href: string; name: string; note: string; slides: Slide[] }) => JSX.Element`; `departmentSlides(d: DepartmentView): Slide[]`; `departmentNote(d: DepartmentView): string`

- [ ] **Step 1: Write the failing test**

Replace the body of `app/_components/home/__tests__/department-cards.test.ts`, keeping its existing `vi.mock` header, its `dept` factory, and its `collectHrefs` / `collectProp` helpers exactly as they are.

This file has **no** `collectText` helper — copy it verbatim from `app/_components/home/__tests__/design-grid.test.ts`:

```ts
/** Walk the returned element tree and collect every rendered text child. */
function collectText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined) return out;
  if (typeof node === "string") { out.push(node); return out; }
  if (typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) collectText(props.children, out);
  return out;
}
```

Then add:

```ts
import {
  DepartmentCards, MIN_DEPARTMENT_CARDS, departmentSlides, departmentNote,
} from "@/app/_components/home/department-cards";

describe("departmentSlides", () => {
  it("projects one slide per design, carrying its photo, tint and name", () => {
    const slides = departmentSlides(dept({
      designs: [
        { slug: "cat", name: "Cats", hex: "#EFC4C4", image: "/cat.jpg" },
        { slug: "dino", name: "Dino", hex: "#BFD8C2", image: null },
      ],
    }));

    expect(slides).toEqual([
      { hex: "#EFC4C4", photo: "/cat.jpg", label: "Cats" },
      { hex: "#BFD8C2", photo: null, label: "Dino" },
    ]);
  });
});

describe("departmentNote", () => {
  it("prefers the department's own note", () => {
    expect(departmentNote(dept({ note: "Unisex" }))).toBe("Unisex");
  });

  it("falls back to the design count", () => {
    // The prototype's "N products" branch is unreachable: DepartmentCards only
    // renders departments passing showsNavDropdown, so designs is never empty.
    expect(departmentNote(dept({
      note: null,
      designs: [
        { slug: "cat", name: "Cats", hex: "#EFC4C4", image: null },
        { slug: "dino", name: "Dino", hex: "#BFD8C2", image: null },
      ],
    }))).toBe("2 designs");
  });
});

describe("DepartmentCards", () => {
  it("renders the name, note and link for each linked department", () => {
    const tree = DepartmentCards({
      departments: [
        dept({ slug: "women", tileName: "Women", note: null }),
        dept({ slug: "men", tileName: "Men", note: "Unisex" }),
      ],
    });

    expect(collectHrefs(tree)).toEqual(["/categories/women", "/categories/men"]);
    expect(collectText(tree)).toContain("Women");
    expect(collectText(tree)).toContain("Unisex");
  });

  it("hands each card its own department's slides, not another's", () => {
    const tree = DepartmentCards({
      departments: [
        dept({ slug: "women", designs: [{ slug: "cat", name: "Cats", hex: "#111111", image: null }] }),
        dept({ slug: "men", designs: [{ slug: "car", name: "Car", hex: "#222222", image: null }] }),
      ],
    });

    expect(collectProp(tree, "slides")).toEqual([
      [{ hex: "#111111", photo: null, label: "Cats" }],
      [{ hex: "#222222", photo: null, label: "Car" }],
    ]);
  });

  it("still drops a department with no designs, and its threshold is unchanged", () => {
    expect(DepartmentCards({ departments: [dept({ designs: [] })] })).toBeNull();
    expect(MIN_DEPARTMENT_CARDS).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_components/home/__tests__/department-cards.test.ts`
Expected: FAIL — `departmentSlides` and `departmentNote` are not exported.

- [ ] **Step 3: Write the implementation**

Create `app/_components/home/department-card.tsx`:

```tsx
// app/_components/home/department-card.tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SlideShow, type Slide } from "@/app/_components/ui/slide-show";

export function DepartmentCard({
  href, name, note, slides,
}: {
  href: string; name: string; note: string; slides: Slide[];
}) {
  return (
    <Link
      href={href}
      className="flex flex-col overflow-hidden rounded-2xl bg-card transition-[transform,box-shadow] duration-(--duration-base) ease-(--ease-out) motion-safe:hover:-translate-y-[3px] hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      style={{ boxShadow: "0 0 0 1px color-mix(in oklab, var(--foreground) 6%, transparent)" }}
    >
      <div className="relative aspect-square overflow-hidden">
        <SlideShow slides={slides} dots="bottom-right" fadeMs={700} subject={name} />
      </div>
      <div className="flex items-center justify-between gap-2.5 px-[18px] pb-[18px] pt-4">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="font-heading text-[21px] font-bold leading-[1.1] tracking-[-0.015em] text-balance">
            {name}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">
            {note}
          </span>
        </div>
        <ArrowRight className="h-[19px] w-[19px] shrink-0 text-brand" aria-hidden />
      </div>
    </Link>
  );
}
```

Rewrite `app/_components/home/department-cards.tsx`:

```tsx
import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";
import { SlideClock } from "@/app/_components/ui/slide-clock";
import { DepartmentCard } from "@/app/_components/home/department-card";
import type { Slide } from "@/app/_components/ui/slide-show";
import { showsNavDropdown, type DepartmentView } from "@/app/_lib/taxonomy";

/** Below this many linked departments the grid reads as a bug rather than a
 *  catalog, so the section renders nothing at all. */
export const MIN_DEPARTMENT_CARDS = 2;

/** One slide per design under the department -- a re-projection of data the
 *  page has already paid for, so this costs no query. */
export function departmentSlides(d: DepartmentView): Slide[] {
  return d.designs.map((g) => ({ hex: g.hex, photo: g.image, label: g.name }));
}

/** The prototype's "N products" branch is unreachable here: the section only
 *  renders departments passing showsNavDropdown, so designs is never empty. */
export function departmentNote(d: DepartmentView): string {
  return d.note ?? `${d.designs.length} designs`;
}

export function DepartmentCards({ departments }: { departments: DepartmentView[] }) {
  const linked = departments.filter(showsNavDropdown);
  if (linked.length < MIN_DEPARTMENT_CARDS) return null;

  return (
    <Section>
      <SectionHeader title="Shop by category" />
      <SlideClock>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6">
          {linked.map((d) => (
            <li key={d.slug}>
              <DepartmentCard
                href={`/categories/${d.slug}`}
                name={d.tileName}
                note={departmentNote(d)}
                slides={departmentSlides(d)}
              />
            </li>
          ))}
        </ul>
      </SlideClock>
    </Section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_components/home/__tests__/department-cards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_components/home/department-card.tsx app/_components/home/department-cards.tsx app/_components/home/__tests__/department-cards.test.ts
git commit -m "$(cat <<'EOF'
feat(home): give a department card a body and rotating slides

Moves the label out of the tile and into a card body beneath it, and
projects one slide per design from data the page already holds.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Design tiles

**Files:**
- Create: `app/_components/home/design-tile.tsx`
- Modify: `app/_components/home/design-grid.tsx`
- Test: `app/_components/home/__tests__/design-grid.test.ts`

**Interfaces:**
- Consumes: `SlideShow`, `Slide` (Task 4); `DesignMedia` (Task 3); `CAPTION_SCRIM_MIN_ALPHA`, `CAPTION_OVERLAY` (Task 1)
- Produces: `DesignTile`; `designSlides(design: DesignSummary, media: DesignMedia | undefined): Slide[]`; `productNote(count: number): string`

- [ ] **Step 1: Write the failing test**

In `app/_components/home/__tests__/design-grid.test.ts`, keep the existing header and helpers. Delete the test `"puts the department name inside the heading's own accessible name, not merely nearby"` — the `sr-only` span it guards is removed by decision 11, and the ambiguity that motivated it is gone. Update the two heading tests and add:

```ts
import { DesignGrid, MIN_DESIGN_GROUPS, designSlides, productNote } from "@/app/_components/home/design-grid";

describe("designSlides", () => {
  const design = { slug: "cat", name: "Cats", hex: "#EFC4C4", image: "/own.jpg" };

  it("uses the design's product photos when it has them", () => {
    const slides = designSlides(design, { photos: ["/a.jpg", "/b.jpg"], count: 5 });
    expect(slides).toEqual([
      { hex: "#EFC4C4", photo: "/a.jpg" },
      { hex: "#EFC4C4", photo: "/b.jpg" },
    ]);
  });

  it("falls back to the design's own image when no product has one", () => {
    expect(designSlides(design, { photos: [], count: 2 }))
      .toEqual([{ hex: "#EFC4C4", photo: "/own.jpg" }]);
  });

  it("falls back to a tint-only slide carrying the name when there is no photo at all", () => {
    const bare = { slug: "cat", name: "Cats", hex: "#EFC4C4", image: null };
    expect(designSlides(bare, undefined))
      .toEqual([{ hex: "#EFC4C4", photo: null, title: "Cats" }]);
  });
});

describe("productNote", () => {
  it("singularises one product", () => {
    expect(productNote(1)).toBe("1 product");
    expect(productNote(4)).toBe("4 products");
    expect(productNote(0)).toBe("0 products");
  });
});

describe("DesignGrid headings", () => {
  it("moves the sub-category to the section eyebrow and names each group by department", () => {
    // subName is shared by Men and Women, so it identifies the section; the
    // department name identifies the group.
    const tree = DesignGrid({
      departments: [
        dept({ slug: "women", name: "Women" }),
        dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1", image: null }] }),
      ],
      media: new Map(),
    });

    const h3s = collectH3Texts(tree);
    expect(h3s).toEqual(["Women", "Men"]);
    // The eyebrow is a PROP on SectionHeader, not children, so collectText
    // cannot see it -- SectionHeader is an unrendered element in this tree.
    // Exactly once, in the section header, not repeated per group.
    expect(collectProp(tree, "eyebrow")).toEqual(["Oversized Graphic T-Shirts"]);
  });

  it("labels each group with its design count", () => {
    const tree = DesignGrid({
      departments: [dept({
        slug: "women",
        designs: [
          { slug: "cat", name: "Cats", hex: "#EFC4C4", image: null },
          { slug: "dino", name: "Dino", hex: "#BFD8C2", image: null },
        ],
      })],
      media: new Map(),
    });
    expect(collectText(tree)).toContain("2 designs");
  });

  it("captions a tile with its real product count", () => {
    const tree = DesignGrid({
      departments: [dept({ slug: "women" })],
      media: new Map([["cat", { photos: [], count: 3 }]]),
    });
    // `note` is a prop handed to DesignTile, not text DesignGrid renders
    // itself, so it is reachable via collectProp rather than collectText.
    expect(collectProp(tree, "note")).toContain("3 products");
  });
});
```

Every existing `DesignGrid({ departments: [...] })` call in this file must gain `media: new Map()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_components/home/__tests__/design-grid.test.ts`
Expected: FAIL — `designSlides` / `productNote` not exported, and `DesignGrid` does not accept `media`.

- [ ] **Step 3: Write the implementation**

Create `app/_components/home/design-tile.tsx`:

```tsx
// app/_components/home/design-tile.tsx
import Link from "next/link";
import { SlideShow, type Slide } from "@/app/_components/ui/slide-show";
import { CAPTION_OVERLAY, CAPTION_SCRIM_MIN_ALPHA } from "@/app/_lib/taxonomy-tint";

/**
 * A three-stop gradient, not two. The caption is ~66px tall, so a plain fade
 * from the bottom reaches only ~0.32 where the name's ascender sits -- far
 * under AA on the light tints. This holds CAPTION_SCRIM_MIN_ALPHA across the
 * whole text band and fades out only above it. See taxonomy-tint.ts.
 */
const CAPTION_GRADIENT =
  `linear-gradient(to top,` +
  ` color-mix(in srgb, ${CAPTION_OVERLAY} 85%, transparent) 0%,` +
  ` color-mix(in srgb, ${CAPTION_OVERLAY} ${Math.round(CAPTION_SCRIM_MIN_ALPHA * 100)}%, transparent) 62%,` +
  ` transparent 100%)`;

export function DesignTile({
  href, name, note, slides,
}: {
  href: string; name: string; note: string; slides: Slide[];
}) {
  return (
    <Link
      href={href}
      className="relative block aspect-square overflow-hidden rounded-[14px] transition-transform duration-(--duration-base) ease-(--ease-out) motion-safe:hover:-translate-y-[3px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <SlideShow slides={slides} dots="top-right" fadeMs={650} subject={name} />
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col gap-px px-3 pb-[11px] pt-[26px]"
        style={{ backgroundImage: CAPTION_GRADIENT }}
      >
        <span className="text-[15px] font-semibold leading-[1.15] text-white">{name}</span>
        <span className="font-mono text-[9px] uppercase tracking-[.14em] text-white/[.72]">
          {note}
        </span>
      </div>
    </Link>
  );
}
```

Rewrite `app/_components/home/design-grid.tsx`:

```tsx
import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";
import { SlideClock } from "@/app/_components/ui/slide-clock";
import { DesignTile } from "@/app/_components/home/design-tile";
import type { Slide } from "@/app/_components/ui/slide-show";
import type { DesignMedia } from "@/app/_lib/taxonomy-media";
import {
  designPath, showsInDesignSection,
  type DepartmentView, type DesignSummary,
} from "@/app/_lib/taxonomy";

/** One qualifying department is enough: production has exactly one. */
export const MIN_DESIGN_GROUPS = 1;

/** Product photos first; then the design's own image; then a tint-only slide
 *  carrying the name, so a design with no photography still reads. */
export function designSlides(design: DesignSummary, media: DesignMedia | undefined): Slide[] {
  if (media && media.photos.length > 0) {
    return media.photos.map((photo) => ({ hex: design.hex, photo }));
  }
  if (design.image) return [{ hex: design.hex, photo: design.image }];
  return [{ hex: design.hex, photo: null, title: design.name }];
}

export function productNote(count: number): string {
  return `${count} ${count === 1 ? "product" : "products"}`;
}

export function DesignGrid({
  departments, media,
}: {
  departments: DepartmentView[];
  media: Map<string, DesignMedia>;
}) {
  const groups = departments.filter(showsInDesignSection);
  if (groups.length < MIN_DESIGN_GROUPS) return null;

  return (
    <Section>
      {/* subName is shared by Men and Women, so it names the section; the
          department name names each group. That asymmetry is why no group
          heading needs an sr-only disambiguator any more. */}
      <SectionHeader eyebrow={groups[0].subName ?? undefined} title="Shop by design" />
      <SlideClock>
        <div className="space-y-[34px]">
          {groups.map((d) => (
            <div key={d.slug}>
              <div className="mb-4 flex items-baseline gap-2.5">
                <h3 className="font-heading text-[15px] font-semibold">{d.name}</h3>
                <span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                  {d.designs.length} designs
                </span>
              </div>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3.5">
                {d.designs.map((design) => (
                  <li key={design.slug}>
                    <DesignTile
                      href={designPath(d.slug, design.slug)}
                      name={design.name}
                      note={productNote(media.get(design.slug)?.count ?? 0)}
                      slides={designSlides(design, media.get(design.slug))}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SlideClock>
    </Section>
  );
}
```

`DesignSummary` is already exported from `app/_lib/taxonomy.ts` — import it, don't redeclare it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_components/home/__tests__/design-grid.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_components/home/design-tile.tsx app/_components/home/design-grid.tsx app/_components/home/__tests__/design-grid.test.ts
git commit -m "$(cat <<'EOF'
feat(home): caption a design tile over a gradient and rotate its photos

Denser grid, a caption carrying the design's real product count, and a
three-stop gradient that holds its contrast floor across the whole text
band. The sub-category moves to the section eyebrow, which retires the
sr-only disambiguator two identical group headings used to need.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Wire the home page

**Files:**
- Modify: `app/page.tsx`
- Test: `app/__tests__/home-page.test.ts`

**Interfaces:**
- Consumes: `getDesignMedia` (Task 3), `DesignGrid` (Task 6)

- [ ] **Step 1: Write the failing test**

In `app/__tests__/home-page.test.ts`, add to the hoisted mocks and assertions:

```ts
const { getDepartments, getDesignMedia } = vi.hoisted(() => ({
  getDepartments: vi.fn(),
  getDesignMedia: vi.fn(),
}));

vi.mock("@/app/_lib/taxonomy-media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/_lib/taxonomy-media")>()),
  getDesignMedia,
}));
```

and a new test:

```ts
it("threads the design media into DesignGrid and nothing else", async () => {
  const media = new Map([["cat", { photos: ["/a.jpg"], count: 2 }]]);
  getDepartments.mockResolvedValue(departments);
  getDesignMedia.mockResolvedValue(media);

  const elements = collectElements(await Home());
  const grid = elements.find((e) => e.type === DesignGrid);
  const cards = elements.find((e) => e.type === DepartmentCards);

  expect(grid?.props.media).toBe(media);
  // Department slides come from getDepartments, so the card section must not
  // have been given the extra read.
  expect(cards?.props.media).toBeUndefined();
  expect(getDesignMedia).toHaveBeenCalledTimes(1);
});
```

Set `getDesignMedia.mockResolvedValue(new Map())` in the existing `beforeEach` so the other tests keep passing.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/__tests__/home-page.test.ts`
Expected: FAIL — `grid?.props.media` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `app/page.tsx`, import `getDesignMedia` and read both in parallel:

```tsx
import { getDesignMedia } from "@/app/_lib/taxonomy-media";

// ...

  // Two independent cached reads, so they go in parallel. getDepartments is the
  // shared one (the footer hits the same key on every page); design media is
  // read only here, which is why it is a separate key rather than a deeper
  // getDepartments query.
  const [departments, media] = await Promise.all([getDepartments(), getDesignMedia()]);
```

and pass `media` to `DesignGrid`:

```tsx
        <DesignGrid departments={departments} media={media} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/__tests__/home-page.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/__tests__/home-page.test.ts
git commit -m "$(cat <<'EOF'
feat(home): read design media alongside the departments

Two independent cached reads in parallel. The media read is home-only by
design -- folding it into getDepartments would slow every page that
renders the footer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Retire TintTile and validate

**Files:**
- Delete: `app/_components/ui/tint-tile.tsx`
- Delete: `app/_components/ui/__tests__/tint-tile.test.ts`

- [ ] **Step 1: Confirm nothing still imports it**

Run: `grep -rn "TintTile\|tint-tile" app components --include='*.ts' --include='*.tsx'`
Expected: only the two files being deleted. If anything else appears, that consumer was missed in Tasks 5–6 — fix it before continuing.

- [ ] **Step 2: Delete both files**

```bash
git rm app/_components/ui/tint-tile.tsx app/_components/ui/__tests__/tint-tile.test.ts
```

- [ ] **Step 3: Check whether SCRIM_ALPHA is now dead**

Run: `grep -rn "SCRIM_ALPHA" app --include='*.ts' --include='*.tsx' | grep -v CAPTION_SCRIM`
`SCRIM_ALPHA` and its `taxonomy-tint.test.ts` block existed only for `TintTile`'s flat scrim. If nothing outside the tests references it, remove the constant, its doc comment and the `"clears AA against INK_LIGHT through the scrim alone"` test with it. Leaving a documented guarantee behind that nothing enforces is worse than deleting it. `INK_LIGHT` and `inkFor` stay — `SlideShow` uses `inkFor` for tint-only slide titles.

- [ ] **Step 4: Verify the already-shipped deltas rather than rebuilding them**

Spec §2 claims three parts of the newer prototype revision already landed. Confirm each against the prototype and report anything that does not match — do **not** change it here; a mismatch is a finding for a follow-up change, not scope creep into this one.

```bash
git show 8fd1811 --stat   # PDP breadcrumb: Home > Department > Sub-category > Product
git show 9df07fd --stat   # card labelled by department as well as design
git show 8110721 --stat   # a design's photo rendered on its tile
```

Check the rendered result of each against the corresponding prototype region, and note the outcome in the OPSX task record.

- [ ] **Step 5: Full validation sweep**

Run each and confirm before claiming completion:

```bash
npm run build
npm run test
npm run check:contrast
npm run test:e2e
```

Expected: all pass. `check:contrast` is required because the tint guarantees moved in Task 1; `test:e2e` because home navigation changed (CLAUDE.md §2). If the e2e suite cannot run in this environment, say so explicitly rather than reporting it as passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(taxonomy): retire TintTile

Both of its consumers now have purpose-built shells, so nothing is left
for it to serve.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Deviations from the spec

Two, both discovered by reading the code rather than the prototype. The spec should be amended, or these recorded in the OPSX proposal:

1. **§8 named `slide-show.test.ts`; there is no such test.** The harness is node-only with no DOM, so a hooks-based component cannot be rendered at all. The rotation logic moved wholesale into the pure `app/_lib/slide-rotation.ts` (Task 2), which is tested exhaustively; `SlideShow` is covered indirectly by the props its consumers hand it. This follows the repo's own `countdown.ts` / `deals-countdown.tsx` split.

2. **§6.2 predicted a marginal contrast failure; it is decisive, and the remedy is structural.** A two-stop gradient reaches only α≈0.32 at the caption's text, ~2.8:1 against white on the lightest tint, and no bottom stop ≤1.0 can fix it. The caption therefore uses a three-stop gradient holding `CAPTION_SCRIM_MIN_ALPHA = 0.68` across the text band. The prototype's `white/.72` note survives unchanged at that floor.
