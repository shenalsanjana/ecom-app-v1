# Home Page Conversion + Visual Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the client's seven-part home page conversion and visual refresh in the existing Next.js storefront, using the codebase's own primitives.

**Architecture:** All new logic that can be tested is extracted into pure `app/_lib/*.ts` modules (Vitest runs in a `node` environment and only collects `*.test.ts`, so React components cannot be unit-tested here — the pure modules are how this change gets test coverage). The components stay thin server components, with exactly one new `"use client"` island for the deals countdown. Product-card signals are computed behind an opt-in flag so only the two home readers pay for them.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (`@theme inline` tokens), shadcn primitives, Prisma/PostgreSQL, `lucide-react`, Vitest (node env), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-home-conversion-refresh-design.md`
(client handoff preserved verbatim at `docs/superpowers/specs/2026-08-19-home-conversion-refresh-handoff.md`)

## Global Constraints

- **Brand token ships at `oklch(0.55 0.08 52)`**, not the handoff's `#b27657` / `oklch(0.62 0.075 55)`, and not its fallback `oklch(0.56 0.08 52)`. Both fail WCAG AA. (Spec D1, §3)
- **`npm run check:contrast` is a merge gate**, not a courtesy run. Do not mark any task done that leaves it failing.
- **Vitest is `environment: "node"`, `globals: false`, and collects only `app/**/__tests__/**/*.test.ts` and `app/**/*.test.ts`.** Import `describe/it/expect` from `vitest` explicitly. `.tsx` files are never collected — do not write component render tests.
- **`process.env.NEXT_PUBLIC_KOKO_ENABLED` must be read as that exact literal expression.** Next inlines `NEXT_PUBLIC_*` by textual match at build time; hoisting it into a variable or computing the key breaks it in production builds.
- **Never render an async Server Component inside a `"use client"` component** (CLAUDE.md §3).
- **Scope is the home route only.** `getProducts`, `searchProducts`, `getWishlistProductCards`, `getProductById` and `getProductDetail` must be left unchanged — `/deals` reads via `getProducts`, so despite its name it is *not* affected by this change.
- **Do not touch `TrustStrip`.** Its hardcoded "over Rs. 5,000" is a real pre-existing bug and explicitly out of scope (Spec §13).
- Only `Bestseller` ships as a card badge. `Trending` and `Almost gone` are not implemented (Spec D3).
- Commit after every task. Conventional Commits, per `openspec/COMMIT_PROCESS.md`.

---

### Task 1: Brand token + marquee keyframes

**Files:**
- Modify: `app/globals.css` (`@theme inline` block ~line 12-62; `:root` block ~line 69-116)

**Interfaces:**
- Consumes: nothing
- Produces: `--brand` / `--ring` / `--chart-1` / `--sidebar-ring` at `oklch(0.55 0.08 52)`; a Tailwind `animate-marquee` utility consumed by Task 3

- [ ] **Step 1: Verify the current contrast gate passes before you change anything**

Run: `npm run check:contrast`
Expected: PASS. If it already fails, stop and report — that is a pre-existing problem, not yours to absorb silently.

- [ ] **Step 2: Retune the brand token**

In `app/globals.css`, inside `:root`, replace the four olive values and the stale comment. The comment currently claims the token is olive; leaving it would make it a lie.

```css
  /* `--brand` is the boutique terracotta (sampled from the new logo) — used by
     sale prices, sale badges, wishlist heart fill, free-shipping qualified
     state, brand variants. Tuned to oklch(0.55 0.08 52) ≈ #976445 so
     terracotta-on-cream (sale price as body text) clears WCAG AA 4.5:1 at
     4.59:1, and cream-on-terracotta (sale badge text) clears it at 4.77:1.
     The logo samples to #b27657, but that measures only 3.43:1 — see
     docs/superpowers/specs/2026-08-19-home-conversion-refresh-design.md §3
     and scripts/check-contrast.ts. */
  --brand: oklch(0.55 0.08 52);
```

Then, further down the same `:root` block, change these three (they mirror `--brand` today and must keep mirroring it):

```css
  --ring: oklch(0.55 0.08 52);
  --chart-1: oklch(0.55 0.08 52);
```

and

```css
  --sidebar-ring: oklch(0.55 0.08 52);
```

Leave `--brand-foreground`, `--chart-2` through `--chart-5`, and every other token alone. (`--chart-2/3/4` remain on the olive hue 125 and will now sit beside a terracotta `--chart-1` in admin charts. That is a known, accepted cosmetic inconsistency — out of scope, do not "fix" it.)

- [ ] **Step 3: Run the contrast gate**

Run: `npm run check:contrast`
Expected: PASS, including the `brand on background (sale price text)` and `brand-foreground on brand (sale badge text)` pairs.

If it fails, do not adjust the script — the token is wrong, not the gate.

- [ ] **Step 4: Add the marquee keyframes and animation utility**

In the `@theme inline` block, directly after the existing `--animate-wishlist-fill` line, add:

```css
  --animate-marquee: marquee 26s linear infinite;
```

Then, directly after the existing `@keyframes wishlist-fill { ... }` block, add:

```css
@keyframes marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
```

This mirrors how `wishlist-fill` is already registered, so components get an `animate-marquee` class rather than an inline style.

- [ ] **Step 5: Verify the build still compiles the stylesheet**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css
git commit -m "feat(tokens): retune brand to AA-passing terracotta, add marquee keyframes"
```

---

### Task 2: Marquee message builder (pure)

**Files:**
- Modify: `app/_lib/free-delivery-note.ts`
- Create: `app/_lib/marquee.ts`
- Test: `app/_lib/marquee.test.ts`

**Interfaces:**
- Consumes: `formatPrice` from `app/_lib/format.ts`
- Produces:
  - `excludedMethodNamesFor(kokoEnabled: boolean): string`
  - `freeDeliveryExclusionNoteFor(kokoEnabled: boolean): string`
  - `type MarqueeMessage = { key: string; text: string }`
  - `marqueeMessages(freeThreshold: number, kokoEnabled: boolean): MarqueeMessage[]`

`free-delivery-note.ts` is the single source of the "excludes Koko & Mintpay" wording that the cart, product page and checkout all depend on. It currently reads the env var itself, which makes it untestable. Split the pure part out and have the existing zero-arg functions delegate, so the single source is preserved *and* becomes testable.

- [ ] **Step 1: Write the failing test**

Create `app/_lib/marquee.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { marqueeMessages } from "./marquee";

describe("marqueeMessages", () => {
  it("returns exactly four messages in the specified order", () => {
    const msgs = marqueeMessages(5000, true);
    expect(msgs.map((m) => m.key)).toEqual([
      "shipping",
      "installments",
      "cod",
      "drops",
    ]);
  });

  it("names a threshold when free shipping is conditional", () => {
    const [shipping] = marqueeMessages(5000, true);
    expect(shipping.text).toContain("Free shipping over");
    expect(shipping.text).toContain("5,000");
  });

  it("switches to the unconditional wording at a zero threshold", () => {
    const [shipping] = marqueeMessages(0, true);
    expect(shipping.text).toContain("Free shipping on everything");
    expect(shipping.text).not.toContain("over");
  });

  it("carries the exclusion note so it cannot drift from cart and checkout", () => {
    expect(marqueeMessages(5000, true)[0].text).toContain("excludes Koko & Mintpay");
    expect(marqueeMessages(5000, false)[0].text).toContain("excludes Mintpay");
  });

  it("names Koko in the installments line only when Koko is enabled", () => {
    expect(marqueeMessages(5000, true)[1].text).toBe(
      "Pay in 3 interest-free — Koko & Mintpay",
    );
    expect(marqueeMessages(5000, false)[1].text).toBe(
      "Pay in 3 interest-free — Mintpay",
    );
  });

  it("keeps the two static messages verbatim", () => {
    const msgs = marqueeMessages(5000, true);
    expect(msgs[2].text).toBe("Cash on Delivery island-wide");
    expect(msgs[3].text).toBe("New drops every week");
  });

  it("gives every message a unique key so React lists are stable", () => {
    const keys = marqueeMessages(5000, true).map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

Note the deliberate `toContain("5,000")` rather than asserting the whole
currency string: `Intl.NumberFormat` output varies with the ICU build, and
pinning it would make this test fail on a different Node image for no good
reason.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/_lib/marquee.test.ts`
Expected: FAIL — cannot resolve `./marquee`.

- [ ] **Step 3: Extract the pure half of the exclusion note**

Rewrite the two exported functions in `app/_lib/free-delivery-note.ts`, keeping the existing file header comment intact:

```ts
/** Pure form: names of the excluded methods, given the Koko flag. */
export function excludedMethodNamesFor(kokoEnabled: boolean): string {
  return kokoEnabled ? "Koko & Mintpay" : "Mintpay";
}

/** Pure form: short parenthetical for use beside free-delivery copy. */
export function freeDeliveryExclusionNoteFor(kokoEnabled: boolean): string {
  return `excludes ${excludedMethodNamesFor(kokoEnabled)}`;
}

/** Names of the excluded methods currently advertised, e.g. "Koko & Mintpay". */
export function excludedMethodNames(): string {
  return excludedMethodNamesFor(process.env.NEXT_PUBLIC_KOKO_ENABLED === "true");
}

/** Short parenthetical for use beside free-delivery copy. */
export function freeDeliveryExclusionNote(): string {
  return freeDeliveryExclusionNoteFor(
    process.env.NEXT_PUBLIC_KOKO_ENABLED === "true",
  );
}
```

The `process.env.NEXT_PUBLIC_KOKO_ENABLED === "true"` expressions stay written
out in full — see Global Constraints.

- [ ] **Step 4: Write the message builder**

Create `app/_lib/marquee.ts`:

```ts
// app/_lib/marquee.ts
// Message set for the scrolling announcement marquee. Pure so it can be
// unit-tested without rendering: the component reads the Koko flag from the
// environment and passes it in.
import { formatPrice } from "@/app/_lib/format";
import {
  excludedMethodNamesFor,
  freeDeliveryExclusionNoteFor,
} from "@/app/_lib/free-delivery-note";

export type MarqueeMessage = { key: string; text: string };

export function marqueeMessages(
  freeThreshold: number,
  kokoEnabled: boolean,
): MarqueeMessage[] {
  const note = freeDeliveryExclusionNoteFor(kokoEnabled);
  const shipping =
    freeThreshold > 0
      ? `Free shipping over ${formatPrice(freeThreshold)} (${note})`
      : `Free shipping on everything (${note})`;
  return [
    { key: "shipping", text: shipping },
    {
      key: "installments",
      text: `Pay in 3 interest-free — ${excludedMethodNamesFor(kokoEnabled)}`,
    },
    { key: "cod", text: "Cash on Delivery island-wide" },
    { key: "drops", text: "New drops every week" },
  ];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run app/_lib/marquee.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Run the full suite — this file has other consumers**

Run: `npm run test`
Expected: no new failures. `free-delivery-note` is used by the cart, product page and checkout; if any of their tests break, you changed behaviour rather than just refactoring.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/marquee.ts app/_lib/marquee.test.ts app/_lib/free-delivery-note.ts
git commit -m "feat(home): add pure marquee message builder"
```

---

### Task 3: Announcement bar → marquee

**Files:**
- Modify: `app/_components/shared/announcement-bar.tsx` (full rewrite of the returned JSX)

**Interfaces:**
- Consumes: `marqueeMessages(freeThreshold, kokoEnabled)` from Task 2; `animate-marquee` from Task 1
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Rewrite the component**

Replace the whole file with:

```tsx
// app/_components/shared/announcement-bar.tsx
import { marqueeMessages } from "@/app/_lib/marquee";

// Site-wide promo strip: free-shipping threshold + "pay in 3" + COD + drops,
// scrolling horizontally so the motion draws the eye. Scrolls away above the
// sticky header. Static (not dismissible) by design.
// Rendered in the layout above the DeliveryConfigProvider, so it takes the live
// threshold as a prop (the layout already fetched the config) rather than a hook.
// Koko is gated behind NEXT_PUBLIC_KOKO_ENABLED so we only advertise it once
// it's actually offered at checkout (mirrors the server-side KOKO_ENABLED flag).
//
// The message set is rendered twice back-to-back: the keyframes translate the
// track by -50%, so the second copy is what makes the loop seamless. It is
// purely visual, hence aria-hidden — a screen reader should hear the set once.
export function AnnouncementBar({ freeThreshold }: { freeThreshold: number }) {
  const kokoEnabled = process.env.NEXT_PUBLIC_KOKO_ENABLED === "true";
  const messages = marqueeMessages(freeThreshold, kokoEnabled);

  const set = (copy: 1 | 2) => (
    <ul
      className="flex shrink-0 items-center gap-[44px] pr-[44px]"
      aria-hidden={copy === 2 ? true : undefined}
    >
      {messages.map((m) => (
        <li
          key={m.key}
          className="flex items-center gap-[44px] whitespace-nowrap text-xs font-medium uppercase tracking-[0.06em]"
        >
          {m.text}
          <span className="opacity-40" aria-hidden>
            ✦
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="overflow-hidden bg-primary py-2 text-primary-foreground">
      <div className="flex w-max motion-safe:animate-marquee">
        {set(1)}
        {set(2)}
      </div>
    </div>
  );
}
```

`motion-safe:` is what satisfies `prefers-reduced-motion`: under that setting
the track simply renders static rather than animating.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors. In particular `formatPrice` and `freeDeliveryExclusionNote` should no longer be imported here — they moved into `marquee.ts`.

- [ ] **Step 3: Verify in the running app**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: the bar scrolls right-to-left continuously with no visible jump at the loop point; four messages separated by `✦`; the threshold matches the live delivery config.

Then set your OS to "reduce motion" and reload. Expected: the bar renders static, not animated.

- [ ] **Step 4: Commit**

```bash
git add app/_components/shared/announcement-bar.tsx
git commit -m "feat(home): scroll the announcement bar as a marquee"
```

---

### Task 4: Hero refresh

**Files:**
- Modify: `app/_components/home/hero.tsx`

**Interfaces:**
- Consumes: `--brand` from Task 1
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Add the rating chip and restyle the headline**

In `app/_components/home/hero.tsx`, add `Star` to the existing lucide import:

```tsx
import { ArrowRight, Star } from "lucide-react";
```

Then replace the contents of the `<div className="max-w-xl space-y-6 ...">`
block's first two children (the eyebrow `<p>` and the `<h1>`) with:

```tsx
            <p className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/[0.28] bg-white/[0.14] px-[14px] py-[6px] text-[13px] backdrop-blur">
              <Star className="h-4 w-4 shrink-0 fill-[#f0b429] stroke-[#f0b429]" aria-hidden />
              <span>
                <b className="font-semibold">4.8</b> · Loved by 12,000+ customers
              </span>
            </p>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-white/80">
              Oversize. Heavyweight. Unmistakably you.
            </p>
            <h1 className="font-heading text-[clamp(42px,5.4vw,70px)] font-bold leading-[1.02] tracking-[-0.03em]">
              Unleash your inner{" "}
              <span className="rounded-[12px] bg-brand px-[0.14em] text-white [-webkit-box-decoration-break:clone] [box-decoration-break:clone]">
                bear.
              </span>
            </h1>
```

`box-decoration-break: clone` is what keeps the highlight from losing its
rounded ends when the headline wraps — both the prefixed and unprefixed
properties are required for Safari.

Note the chip sits **above** the eyebrow, and the parent's `space-y-6` handles
the gaps — do not add margins.

Leave the `<Image>`, the gradient overlay, the body paragraph and both CTAs
exactly as they are.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 3: Verify in the running app**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: a translucent blurred pill above the eyebrow with an amber star; a noticeably larger, bolder headline; `bear.` sitting on a terracotta rounded highlight. Narrow the window until the headline wraps immediately before `bear.` — the highlight must keep rounded corners on both fragments.

- [ ] **Step 4: Commit**

```bash
git add app/_components/home/hero.tsx
git commit -m "feat(home): add hero rating chip and brand-highlighted headline"
```

---

### Task 5: Social-proof strip

**Files:**
- Create: `app/_components/home/social-proof.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `<SocialProof />`, a props-less server component

Per spec D2, the fourth item is **7-day returns**, not free shipping: the
marquee and `TrustStrip` already advertise free shipping, and three mentions on
one page is noise. Because it no longer depends on the delivery config, this
component takes no props.

- [ ] **Step 1: Create the component**

Create `app/_components/home/social-proof.tsx`:

```tsx
// app/_components/home/social-proof.tsx
// Social-proof band directly under the hero: the four signals a first-time
// visitor needs before scrolling. Deliberately does NOT repeat free shipping —
// the marquee and TrustStrip both already carry it.
import { Check, CreditCard, RotateCcw, Star } from "lucide-react";

export function SocialProof() {
  return (
    <section className="border-b bg-card">
      <ul className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-3.5 px-6 py-[18px] text-sm">
        <li className="flex items-center gap-2">
          <Star className="h-4 w-4 shrink-0 fill-[#f0b429] stroke-[#f0b429]" aria-hidden />
          <span>
            <b className="font-semibold">4.8/5</b> from 850+ reviews
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span>
            <b className="font-semibold">12,000+</b> tees delivered
          </span>
        </li>
        <li className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span>Cash on Delivery island-wide</span>
        </li>
        <li className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span>7-day easy returns</span>
        </li>
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Mount it after the hero**

In `app/page.tsx`, add the import alongside the others:

```tsx
import { SocialProof } from "@/app/_components/home/social-proof";
```

and insert the element directly after `<Hero />`:

```tsx
        <Hero />
        <SocialProof />
        <ProductGrid />
```

Change nothing else in this file.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Verify in the running app**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: a single centered row of four signals on a card-coloured band between the hero and the featured grid, wrapping to two rows at narrow widths without overflowing horizontally.

- [ ] **Step 5: Commit**

```bash
git add app/_components/home/social-proof.tsx app/page.tsx
git commit -m "feat(home): add social-proof strip under the hero"
```

---

### Task 6: Category tint + ink resolution (pure)

**Files:**
- Create: `app/_lib/category-tint.ts`
- Test: `app/_lib/category-tint.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `CATEGORY_TINTS: Record<string, string>`
  - `TINT_PALETTE: readonly string[]`
  - `tintForSlug(slug: string): string`
  - `relativeLuminance(hex: string): number`
  - `inkFor(bgHex: string): string`

Two things this module exists to get right, both load-bearing:

1. `getCategories()` returns whatever rows are in the database. The seed ships
   only `cat` and `dino`; the handoff names six slugs. An unknown slug is the
   normal case, not an edge case, so the fallback must produce a stable,
   distinct tile rather than a blank one.
2. The handoff's ink rule — a luminance threshold — renders Dino at 1.73:1 and
   Bear at 2.38:1. `inkFor` instead picks whichever ink has the **higher
   contrast**, and the dark ink is `#332d26` rather than `#3a332c` so the
   darkest tint clears AA. See spec §9 and D5.

- [ ] **Step 1: Write the failing test**

Create `app/_lib/category-tint.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CATEGORY_TINTS,
  TINT_PALETTE,
  tintForSlug,
  relativeLuminance,
  inkFor,
  INK_DARK,
  INK_LIGHT,
} from "./category-tint";

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("tintForSlug", () => {
  it("returns the named tint for each slug the handoff specifies", () => {
    expect(tintForSlug("cat")).toBe("#EFC4C4");
    expect(tintForSlug("dino")).toBe("#AEBBA0");
    expect(tintForSlug("bear")).toBe("#C4906E");
    expect(tintForSlug("retro")).toBe("#E4D3B0");
    expect(tintForSlug("wave")).toBe("#AEC3D1");
    expect(tintForSlug("nature")).toBe("#BFC7A6");
  });

  it("falls back to a palette color for an unknown slug", () => {
    expect(TINT_PALETTE).toContain(tintForSlug("space-invaders"));
  });

  it("is deterministic for the same unknown slug", () => {
    expect(tintForSlug("space-invaders")).toBe(tintForSlug("space-invaders"));
  });

  it("spreads different unknown slugs across the palette", () => {
    const picked = new Set(
      ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"].map(
        tintForSlug,
      ),
    );
    expect(picked.size).toBeGreaterThan(1);
  });

  it("never returns an empty string", () => {
    expect(tintForSlug("")).not.toBe("");
    expect(TINT_PALETTE).toContain(tintForSlug(""));
  });
});

describe("relativeLuminance", () => {
  it("returns 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("is case-insensitive", () => {
    expect(relativeLuminance("#efc4c4")).toBeCloseTo(relativeLuminance("#EFC4C4"), 10);
  });
});

describe("inkFor", () => {
  it("picks the dark ink on every named tint, including the dark ones", () => {
    // A naive luminance threshold at 0.5 would send dino (0.471) and bear
    // (0.328) to the light ink at 1.7:1 and 2.4:1. Max-contrast must not.
    for (const tint of Object.values(CATEGORY_TINTS)) {
      expect(inkFor(tint)).toBe(INK_DARK);
    }
  });

  it("picks the light ink on a genuinely dark background", () => {
    expect(inkFor("#1a1a1a")).toBe(INK_LIGHT);
  });

  it("clears WCAG AA 4.5:1 for small text on every named tint", () => {
    for (const [slug, tint] of Object.entries(CATEGORY_TINTS)) {
      const ratio = contrast(inkFor(tint), tint);
      expect(ratio, `${slug} (${tint})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("clears AA on every palette entry reachable through the fallback", () => {
    for (const tint of TINT_PALETTE) {
      expect(contrast(inkFor(tint), tint)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/_lib/category-tint.test.ts`
Expected: FAIL — cannot resolve `./category-tint`.

- [ ] **Step 3: Write the implementation**

Create `app/_lib/category-tint.ts`:

```ts
// app/_lib/category-tint.ts
// Solid tile colors for the category strip, replacing the old image-under-
// gradient tiles (every category resolved to a similar cream product photo, so
// the six tiles read as six copies of the same muddy tile).
//
// getCategories() reads arbitrary rows from the database — the seed ships only
// `cat` and `dino` — so an unnamed slug is the normal case and gets a stable
// hash-picked color from the same palette rather than a blank tile.

export const CATEGORY_TINTS: Record<string, string> = {
  cat: "#EFC4C4",
  dino: "#AEBBA0",
  bear: "#C4906E",
  retro: "#E4D3B0",
  wave: "#AEC3D1",
  nature: "#BFC7A6",
};

export const TINT_PALETTE = Object.values(CATEGORY_TINTS) as readonly string[];

/** Dark ink. Darkened from the handoff's #3a332c so the darkest tint
 *  (bear #C4906E) clears AA 4.5:1 — it reaches 4.90:1 here, vs 4.47:1 before. */
export const INK_DARK = "#332d26";
export const INK_LIGHT = "#F1EDE4";

export function tintForSlug(slug: string): string {
  const named = CATEGORY_TINTS[slug];
  if (named) return named;
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  }
  return TINT_PALETTE[Math.abs(hash) % TINT_PALETTE.length];
}

/** WCAG relative luminance of a `#rrggbb` color. */
export function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Ink for a tile, chosen by whichever of the two inks actually contrasts
 * better — NOT by a luminance threshold. A threshold at 0.5 would send dino
 * (0.471) and bear (0.328) to the light ink at 1.73:1 and 2.38:1.
 */
export function inkFor(bgHex: string): string {
  return contrast(INK_DARK, bgHex) >= contrast(INK_LIGHT, bgHex)
    ? INK_DARK
    : INK_LIGHT;
}
```

The hash mirrors the one already used by `avatarColor` in `app/_lib/format.ts` —
same shape, same reason, so the codebase has one idiom for "stable pick from a
small palette".

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/_lib/category-tint.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/category-tint.ts app/_lib/category-tint.test.ts
git commit -m "feat(home): add category tile tint and AA-safe ink resolution"
```

---

### Task 7: Category tiles

**Files:**
- Modify: `app/_components/home/category-strip.tsx`

**Interfaces:**
- Consumes: `tintForSlug`, `inkFor` from Task 6
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Rewrite the tile markup**

Replace the whole file with:

```tsx
import Link from "next/link";
import { getCategories } from "@/app/_lib/products";
import { tintForSlug, inkFor } from "@/app/_lib/category-tint";
import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";

export async function CategoryStrip() {
  const categories = await getCategories();
  return (
    <Section>
      <SectionHeader title="Shop by category" />
      <ul className="grid grid-cols-2 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((c) => {
          const tint = tintForSlug(c.slug);
          const ink = inkFor(tint);
          return (
            <li key={c.slug}>
              <Link
                href={`/categories/${c.slug}`}
                className="flex aspect-[3/4] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl px-4 text-center transition-transform duration-(--duration-base) ease-(--ease-out) motion-safe:hover:-translate-y-[3px]"
                style={{ backgroundColor: tint, color: ink }}
              >
                <span className="font-heading text-[28px] font-bold leading-tight">
                  {c.name}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
                  Shop {c.name} →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
```

Note: the `Image` and `isUploadedImage` imports are **gone**. Leaving them would
fail lint. `CategoryView.image` stays on the type and in the query — other
surfaces use it, and if real category photography lands later these tiles can
revert.

The tint and ink go through `style` rather than Tailwind classes on purpose:
the values are data-driven, and Tailwind's JIT only emits classes it can see as
literals in source.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors, and specifically no `no-unused-vars` for a leftover
`Image` import.

- [ ] **Step 3: Verify in the running app**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: solid, visibly distinct color tiles; the category name centred and
large; a mono caption below it; the tile lifting slightly on hover. Every label
must be comfortably readable — if any tile's text looks washed out, `inkFor` is
being bypassed.

- [ ] **Step 4: Commit**

```bash
git add app/_components/home/category-strip.tsx
git commit -m "feat(home): replace category tiles with distinct solid tints"
```

---

### Task 8: Countdown formatting (pure)

**Files:**
- Create: `app/_lib/countdown.ts`
- Test: `app/_lib/countdown.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `msUntilEndOfDay(now: Date): number`
  - `formatCountdown(ms: number): string`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/countdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { msUntilEndOfDay, formatCountdown } from "./countdown";

describe("formatCountdown", () => {
  it("pads every field to two digits", () => {
    expect(formatCountdown(0)).toBe("00:00:00");
    expect(formatCountdown(1000)).toBe("00:00:01");
    expect(formatCountdown(61_000)).toBe("00:01:01");
  });

  it("formats a full day boundary", () => {
    expect(formatCountdown(23 * 3600_000 + 59 * 60_000 + 59_000)).toBe("23:59:59");
  });

  it("truncates sub-second remainders rather than rounding up", () => {
    expect(formatCountdown(1999)).toBe("00:00:01");
  });

  it("clamps negatives to zero instead of rendering a negative clock", () => {
    expect(formatCountdown(-5000)).toBe("00:00:00");
  });
});

describe("msUntilEndOfDay", () => {
  it("counts to 23:59:59.999 of the same local day", () => {
    const now = new Date(2026, 7, 19, 23, 59, 58, 0);
    expect(msUntilEndOfDay(now)).toBe(1999);
  });

  it("returns nearly a full day just after local midnight", () => {
    const now = new Date(2026, 7, 19, 0, 0, 0, 0);
    expect(msUntilEndOfDay(now)).toBe(24 * 3600_000 - 1);
  });

  it("is always positive within a day", () => {
    const now = new Date(2026, 7, 19, 23, 59, 59, 999);
    expect(msUntilEndOfDay(now)).toBe(0);
  });

  it("composes with formatCountdown to a sane clock", () => {
    const now = new Date(2026, 7, 19, 21, 0, 0, 0);
    expect(formatCountdown(msUntilEndOfDay(now))).toBe("02:59:59");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/_lib/countdown.test.ts`
Expected: FAIL — cannot resolve `./countdown`.

- [ ] **Step 3: Write the implementation**

Create `app/_lib/countdown.ts`:

```ts
// app/_lib/countdown.ts
// Pure clock math for the "Deals of the day" countdown. Kept out of the client
// island so it can be unit-tested without fake timers or a DOM.

/** Milliseconds from `now` to 23:59:59.999 of the same local day. */
export function msUntilEndOfDay(now: Date): number {
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );
  return Math.max(0, end.getTime() - now.getTime());
}

/** `HH:MM:SS`, truncating sub-second remainders and clamping negatives to zero. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/_lib/countdown.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/countdown.ts app/_lib/countdown.test.ts
git commit -m "feat(home): add pure countdown clock helpers"
```

---

### Task 9: Deals band + countdown island

**Files:**
- Create: `app/_components/home/deals-countdown.tsx`
- Modify: `app/_components/home/deals-section.tsx`

**Interfaces:**
- Consumes: `msUntilEndOfDay`, `formatCountdown` from Task 8
- Produces: `<DealsCountdown />`, a props-less `"use client"` island

`DealsSection` stays an async server component and renders the island as a
child — never the other way around (CLAUDE.md §3).

**Hydration matters here.** If the island computed `Date.now()` during render,
the server HTML and the first client render would disagree and React would
throw a hydration mismatch. The island therefore renders a stable placeholder
until `useEffect` has run on the client.

- [ ] **Step 1: Create the countdown island**

Create `app/_components/home/deals-countdown.tsx`:

```tsx
// app/_components/home/deals-countdown.tsx
"use client";
import { useEffect, useState } from "react";
import { msUntilEndOfDay, formatCountdown } from "@/app/_lib/countdown";

// The only client state on the home page. Renders a fixed placeholder on the
// server and for the first client paint — computing the clock during render
// would make server and client HTML disagree and trip a hydration mismatch.
export function DealsCountdown() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(msUntilEndOfDay(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm">
      <span
        className="h-2 w-2 shrink-0 rounded-full motion-safe:animate-pulse"
        style={{
          backgroundColor: "var(--brand)",
          boxShadow: "0 0 0 4px color-mix(in oklab, var(--brand) 30%, transparent)",
        }}
        aria-hidden
      />
      Ends in{" "}
      <span
        className="font-mono tabular-nums"
        style={{ color: "color-mix(in oklab, var(--brand) 65%, white)" }}
        suppressHydrationWarning
      >
        {remaining === null ? "--:--:--" : formatCountdown(remaining)}
      </span>
    </span>
  );
}
```

`tabular-nums` stops the pill from jittering as the digits change.

- [ ] **Step 2: Restyle the deals section**

Replace `app/_components/home/deals-section.tsx` with:

```tsx
import Link from "next/link";
import { ProductCard } from "@/app/_components/home/product-card";
import { DealsCountdown } from "@/app/_components/home/deals-countdown";
import { getDealsProducts } from "@/app/_lib/products";

export async function DealsSection() {
  const products = await getDealsProducts(4);
  return (
    <section className="border-b bg-primary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p
              className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em]"
              style={{ color: "color-mix(in oklab, var(--brand) 70%, white)" }}
            >
              Limited time
            </p>
            <h2 className="font-heading mt-1 text-[34px] font-bold tracking-tight">
              Deals of the day
            </h2>
            <p className="mt-1 text-sm text-white/60">
              Limited-time savings on everyday picks.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <DealsCountdown />
            <Link
              href="/deals"
              className="text-sm font-medium text-white/75 transition-colors duration-(--duration-fast) hover:text-white"
            >
              See all deals →
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} fromPath="/" />
          ))}
        </div>
      </div>
    </section>
  );
}
```

The eyebrow is written out rather than using the `Eyebrow` primitive because
that primitive only offers `brand` and `inverse` tones, neither of which is the
brand-mixed-with-white this band needs. Do not widen `Eyebrow` for one caller.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Verify in the running app**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: a cocoa band with light product cards inside it; a `Limited time`
eyebrow in warm terracotta-white; a pill reading `Ends in HH:MM:SS` whose
seconds tick down every second; a pulsing dot with a soft brand halo.

Open the browser console. Expected: **no hydration mismatch warning**. Reload a
few times to be sure.

- [ ] **Step 5: Commit**

```bash
git add app/_components/home/deals-countdown.tsx app/_components/home/deals-section.tsx
git commit -m "feat(home): dark deals band with end-of-day countdown"
```

---

### Task 10: Product signal derivation (pure)

**Files:**
- Create: `app/_lib/product-signals.ts`
- Test: `app/_lib/product-signals.test.ts`

**Interfaces:**
- Consumes: `stockForSize`, `PlainStockMap`, `DesignStockMap` from `app/_lib/variants.ts`
- Produces:
  - `LOW_STOCK_THRESHOLD: number`
  - `BESTSELLER_COUNT: number`
  - `unitsForVariant(sizes, colorSlug, dtfDesignId, plainStock, designStock): number`
  - `lowStockSignal(units: number): number | undefined`
  - `pickBestsellers(sold: { productId: string; units: number }[], topN: number): Set<string>`

`pickBestsellers` must be **deterministic**: ties broken by `productId` ascending,
so the same catalog does not shuffle its badges between cache windows.

- [ ] **Step 1: Write the failing test**

Create `app/_lib/product-signals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPlainStockMap, buildDesignStockMap } from "./variants";
import {
  LOW_STOCK_THRESHOLD,
  unitsForVariant,
  lowStockSignal,
  pickBestsellers,
} from "./product-signals";

const SIZES = [{ size: "S" }, { size: "M" }, { size: "L" }];

function maps(plainQty: number, designQty: number) {
  return {
    plainStock: buildPlainStockMap(
      SIZES.map((s, i) => ({
        id: `ps-${i}`,
        colorSlug: "white",
        size: s.size,
        quantity: plainQty,
      })),
    ),
    designStock: buildDesignStockMap([{ id: "d1", quantity: designQty }]),
  };
}

describe("unitsForVariant", () => {
  it("sums the fulfillable units across sizes", () => {
    const { plainStock, designStock } = maps(2, 100);
    expect(unitsForVariant(SIZES, "white", "d1", plainStock, designStock)).toBe(6);
  });

  it("is capped per size by the shared design pool", () => {
    // Each size has 10 plain blanks but the design only has 1 print left, so
    // every size is min(10, 1) = 1.
    const { plainStock, designStock } = maps(10, 1);
    expect(unitsForVariant(SIZES, "white", "d1", plainStock, designStock)).toBe(3);
  });

  it("is zero when the design is exhausted", () => {
    const { plainStock, designStock } = maps(10, 0);
    expect(unitsForVariant(SIZES, "white", "d1", plainStock, designStock)).toBe(0);
  });

  it("is zero when the product has no design at all", () => {
    const { plainStock, designStock } = maps(10, 10);
    expect(unitsForVariant(SIZES, "white", null, plainStock, designStock)).toBe(0);
  });

  it("ignores sizes with no matching blank", () => {
    const { plainStock, designStock } = maps(4, 100);
    expect(
      unitsForVariant([...SIZES, { size: "XXL" }], "white", "d1", plainStock, designStock),
    ).toBe(12);
  });
});

describe("lowStockSignal", () => {
  it("reports at the threshold", () => {
    expect(lowStockSignal(LOW_STOCK_THRESHOLD)).toBe(LOW_STOCK_THRESHOLD);
  });

  it("reports below the threshold", () => {
    expect(lowStockSignal(1)).toBe(1);
  });

  it("stays silent above the threshold", () => {
    expect(lowStockSignal(LOW_STOCK_THRESHOLD + 1)).toBeUndefined();
  });

  it("stays silent at zero — out of stock is not a scarcity nudge", () => {
    expect(lowStockSignal(0)).toBeUndefined();
  });
});

describe("pickBestsellers", () => {
  it("takes the top N by units sold", () => {
    const picked = pickBestsellers(
      [
        { productId: "a", units: 3 },
        { productId: "b", units: 10 },
        { productId: "c", units: 7 },
      ],
      2,
    );
    expect(picked).toEqual(new Set(["b", "c"]));
  });

  it("breaks ties by productId so badges do not shuffle between cache windows", () => {
    const input = [
      { productId: "zeta", units: 5 },
      { productId: "alpha", units: 5 },
      { productId: "mid", units: 5 },
    ];
    expect(pickBestsellers(input, 2)).toEqual(new Set(["alpha", "mid"]));
    expect(pickBestsellers([...input].reverse(), 2)).toEqual(new Set(["alpha", "mid"]));
  });

  it("ignores products with no sales", () => {
    const picked = pickBestsellers(
      [
        { productId: "a", units: 0 },
        { productId: "b", units: 2 },
      ],
      5,
    );
    expect(picked).toEqual(new Set(["b"]));
  });

  it("returns an empty set for an empty catalog", () => {
    expect(pickBestsellers([], 3)).toEqual(new Set());
  });

  it("returns fewer than N when fewer products have sold", () => {
    expect(pickBestsellers([{ productId: "a", units: 1 }], 3).size).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/_lib/product-signals.test.ts`
Expected: FAIL — cannot resolve `./product-signals`.

- [ ] **Step 3: Write the implementation**

Create `app/_lib/product-signals.ts`:

```ts
// app/_lib/product-signals.ts
// Display-only conversion signals for product cards. Pure — the DB reads live
// in app/_lib/products.ts and pass their results in.
//
// These are display metadata only: nothing here participates in pricing, cart,
// or checkout logic. Both signals are derived from real data on purpose — a
// hardcoded "Only 4 left" would be fabricated scarcity shown to real customers.
import { stockForSize, type PlainStockMap, type DesignStockMap } from "@/app/_lib/variants";

export const LOW_STOCK_THRESHOLD = 6;
export const BESTSELLER_COUNT = 3;

/** Total fulfillable units for one color, summed across its sizes. */
export function unitsForVariant(
  sizes: { size: string }[],
  colorSlug: string,
  dtfDesignId: string | null,
  plainStock: PlainStockMap,
  designStock: DesignStockMap,
): number {
  return sizes.reduce(
    (sum, s) =>
      sum + stockForSize(colorSlug, s.size, dtfDesignId, plainStock, designStock),
    0,
  );
}

/**
 * The "Only N left" nudge, or undefined when it should not be shown.
 * Zero is deliberately silent: out of stock is not scarcity, and the card
 * already communicates unavailability through its sizes.
 */
export function lowStockSignal(units: number): number | undefined {
  return units > 0 && units <= LOW_STOCK_THRESHOLD ? units : undefined;
}

/**
 * Product ids to badge as "Bestseller". Sorted by units sold descending, then
 * by productId ascending so the result is stable across cache windows for a
 * catalog where several products are tied.
 */
export function pickBestsellers(
  sold: { productId: string; units: number }[],
  topN: number,
): Set<string> {
  return new Set(
    sold
      .filter((s) => s.units > 0)
      .sort((a, b) => b.units - a.units || a.productId.localeCompare(b.productId))
      .slice(0, topN)
      .map((s) => s.productId),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/_lib/product-signals.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/product-signals.ts app/_lib/product-signals.test.ts
git commit -m "feat(home): derive card scarcity and bestseller signals from real data"
```

---

### Task 11: Wire signals into the home readers

**Files:**
- Modify: `app/_lib/products.ts` (`ProductView` type ~line 19-27; `attachAggregates` ~line 58-100; `getFeaturedProducts` ~line 116-128; `getDealsProducts` ~line 130-142)

**Interfaces:**
- Consumes: `unitsForVariant`, `lowStockSignal`, `pickBestsellers`, `BESTSELLER_COUNT` from Task 10
- Produces: `ProductView.badge?: "Bestseller"` and `ProductView.lowStock?: number`, populated **only** by `getFeaturedProducts` and `getDealsProducts`

- [ ] **Step 1: Extend the view type**

In `app/_lib/products.ts`, add two optional fields to `ProductView`:

```ts
export type ProductView = {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  category: string;
  defaultColorSlug: string;
  variants: ProductCardVariant[];
  // Display-only conversion signals, populated only by the home-page readers
  // (getFeaturedProducts / getDealsProducts) via attachAggregates'
  // `withSignals` option. Never used in pricing, cart or checkout logic.
  badge?: "Bestseller";
  lowStock?: number;
};
```

Both are optional, so every other caller compiles untouched.

- [ ] **Step 2: Add the opt-in flag to attachAggregates**

Add the import at the top of the file:

```ts
import { unitsForVariant, lowStockSignal, pickBestsellers, BESTSELLER_COUNT } from "@/app/_lib/product-signals";
```

Change the signature and add the bestseller query. `attachAggregates` already
loads `plainStock` and `designStock`, so `lowStock` costs no extra query — only
the bestseller `groupBy` is new, and it only runs when asked:

```ts
async function attachAggregates(
  rows: ProductRow[],
  { withSignals = false }: { withSignals?: boolean } = {},
): Promise<ProductView[]> {
  // A design with no active variants can't be carded; drop it.
  const usable = rows.filter((r) => r.variants.length > 0);
  if (usable.length === 0) return [];
  const ids = usable.map((r) => r.id);
  const [grouped, plainStockRows, designStockRows, soldRows] = await Promise.all([
    prisma.review.groupBy({
      by: ["productId"],
      where: { productId: { in: ids }, approved: true },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.plainTshirtStock.findMany({ select: { id: true, colorSlug: true, size: true, quantity: true } }),
    prisma.dtfDesign.findMany({ select: { id: true, quantity: true } }),
    withSignals
      ? prisma.orderItem.groupBy({
          by: ["productId"],
          where: {
            productId: { in: ids },
            order: { paymentStatus: { in: ["PAID", "COD_COLLECTED"] } },
          },
          _sum: { quantity: true },
        })
      : Promise.resolve([]),
  ]);
```

Only orders that were actually paid for count — `PAID` for online payments and
`COD_COLLECTED` for cash on delivery, matching how `checkoutPaymentState` in
`app/_lib/order-status.ts` already defines "paid". Counting `PENDING` orders
would let an abandoned checkout mint a bestseller.

- [ ] **Step 3: Compute and attach the signals**

Immediately after `const designStock = buildDesignStockMap(designStockRows);`, add:

```ts
  const bestsellers = withSignals
    ? pickBestsellers(
        soldRows.map((r) => ({
          productId: r.productId as string,
          units: r._sum.quantity ?? 0,
        })),
        BESTSELLER_COUNT,
      )
    : new Set<string>();
```

`r.productId` needs the cast because `OrderItem.productId` is nullable in the
schema (a product can be hard-deleted while its order history lives on); the
`productId: { in: ids }` filter already excludes nulls.

Then, inside the `usable.map((p) => { ... })` callback, after the `variants`
array is built and before the `return`, add:

```ts
    const defaultVariant = p.variants[0];
    const units = withSignals
      ? unitsForVariant(
          defaultVariant.sizeStocks,
          defaultVariant.colorSlug,
          p.dtfDesignId,
          plainStock,
          designStock,
        )
      : 0;
    const lowStock = withSignals ? lowStockSignal(units) : undefined;
    const badge = bestsellers.has(p.id) ? ("Bestseller" as const) : undefined;
```

and extend the returned object with the two fields, leaving every existing field
in place:

```ts
    return {
      id: p.id,
      name: p.name,
      rating: agg.avg,
      reviewCount: agg.count,
      category: p.categorySlug,
      defaultColorSlug: variants[0].colorSlug,
      variants,
      ...(badge ? { badge } : {}),
      ...(lowStock != null ? { lowStock } : {}),
    };
```

Spreading conditionally keeps the key absent rather than present-and-undefined,
so callers that serialize `ProductView` do not gain two null fields.

- [ ] **Step 4: Opt the two home readers in — and nothing else**

In `getFeaturedProducts`, change the return to:

```ts
    return attachAggregates(rows, { withSignals: true });
```

In `getDealsProducts`, make the same change.

**Leave every other `attachAggregates(...)` call site exactly as it is** — there
are six others (`getProductById`, the related-products read in
`getProductDetail`, `getProducts`, `searchProducts`, `getWishlistProductCards`).
They default to `withSignals: false` and must stay that way, or search and
category listings start paying for a `groupBy` they never render.

- [ ] **Step 5: Verify no other call site changed**

Run: `git diff app/_lib/products.ts | grep -c "withSignals: true"`
Expected: `2` — exactly the two home readers.

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npm run test`
Expected: no new errors and no new failures. The optional fields must not have
broken any existing `ProductView` consumer.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/products.ts
git commit -m "feat(home): populate card signals from the home product readers"
```

---

### Task 12: Render the card signals

**Files:**
- Modify: `app/_components/home/product-card.tsx`

**Interfaces:**
- Consumes: `ProductView.badge`, `ProductView.lowStock` from Task 11
- Produces: nothing consumed by later tasks

`ProductCard` is shared by seven routes. Both signals render only when the field
is present, and only the two home readers populate them, so the other six routes
are visually unchanged.

- [ ] **Step 1: Add the badge pill and stock nudge**

In `app/_components/home/product-card.tsx`, add `Clock` to the lucide import:

```tsx
import { Clock, Zap } from "lucide-react";
```

Destructure the two new fields from `product`:

```tsx
  const { id, name, rating, reviewCount, category, variants, defaultColorSlug, badge, lowStock } = product;
```

Inside the image wrapper `<div className="relative aspect-[4/5] ...">`, directly
after the `WishlistHeart` block, add the badge:

```tsx
        {badge && (
          <span className="absolute bottom-3 left-3 z-10 rounded-full bg-primary px-[9px] py-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-primary-foreground">
            {badge}
          </span>
        )}
```

Bottom-left is chosen because `SaleBadge` already occupies `left-3 top-3` and
`WishlistHeart` occupies `right-2 top-2` — do not move either.

Then, in `<CardContent>`, directly after the `<Rating ... />` line, add the nudge:

```tsx
        {lowStock != null && (
          <p className="flex items-center gap-1 text-xs font-semibold text-brand">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Only {lowStock} left
          </p>
        )}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 3: Verify in the running app**

Run: `npm run dev`, open `http://localhost:3000`.

Expected on the featured grid and the deals band: up to three cards carry a
cocoa `BESTSELLER` pill at the bottom-left of the image, and any card whose
default color has 1-6 fulfillable units shows `Only N left` in terracotta under
the rating. The pill must not overlap the sale badge or the wishlist heart.

Then open `/search?q=tee` and `/categories`. Expected: **no** badges and **no**
stock nudges — those routes never opt in. If they appear there, a
`withSignals` flag leaked into a shared reader in Task 11.

If your local database has no paid orders, no badge will render anywhere; that
is correct behaviour, not a bug. Confirm the nudge separately by checking a
product whose design or blank stock is genuinely low.

- [ ] **Step 4: Commit**

```bash
git add app/_components/home/product-card.tsx
git commit -m "feat(home): show bestseller badge and low-stock nudge on cards"
```

---

### Task 13: Full validation and readiness update

**Files:**
- Modify: `STUB_READINESS_STATUS.md`

**Interfaces:**
- Consumes: everything above
- Produces: a merge-ready branch

- [ ] **Step 1: Run every gate**

Run, in order, and record the actual output of each:

```bash
npm run check:contrast
npx tsc --noEmit
npm run lint
npm run test
npm run build
npm run test:e2e
```

Expected: all pass.

`npm run build` and `npm run test:e2e` need a reachable `DATABASE_URL`. Per
`STUB_READINESS_STATUS.md` this has repeatedly been the local blocker on this
project. If no Postgres is available, **do not mark them passed** — record them
as blocked-environmental and state plainly that they must run in CI or against
the VPS before merge.

`npm run lint` has known pre-existing errors in files this change never touches.
Compare against `git stash`-ed `main` if unsure; only new findings are yours.

- [ ] **Step 2: Re-read the diff against the spec**

Run: `git diff main --stat`

Expected exactly these paths, and no others:

```
app/globals.css
app/page.tsx
app/_components/home/category-strip.tsx
app/_components/home/deals-countdown.tsx      (new)
app/_components/home/deals-section.tsx
app/_components/home/hero.tsx
app/_components/home/product-card.tsx
app/_components/home/social-proof.tsx         (new)
app/_components/shared/announcement-bar.tsx
app/_lib/category-tint.ts                     (new)
app/_lib/category-tint.test.ts                (new)
app/_lib/countdown.ts                         (new)
app/_lib/countdown.test.ts                    (new)
app/_lib/free-delivery-note.ts
app/_lib/marquee.ts                           (new)
app/_lib/marquee.test.ts                      (new)
app/_lib/product-signals.ts                   (new)
app/_lib/product-signals.test.ts              (new)
app/_lib/products.ts
STUB_READINESS_STATUS.md
```

`trust-strip.tsx` must **not** appear. Neither must any file under
`app/checkout/`, `app/cart/`, `app/admin/`, or `prisma/`.

- [ ] **Step 3: Update the readiness tracker**

In `STUB_READINESS_STATUS.md`, update the `home-conversion-refresh` row: set
the executing-skill, worktree, propose and apply columns to their real values,
set Current Status to `Applied`, and replace the TODO cell with what actually
remains (sync/archive/merge). Record the real validation results in the Notes
cell — including anything that came back blocked-environmental.

- [ ] **Step 4: Commit**

```bash
git add STUB_READINESS_STATUS.md
git commit -m "docs(home): record home conversion refresh validation status"
```

---

## Notes for the executor

- **Tasks 1, 2, 6, 8 and 10 are independent** and can run in parallel. Task 3
  needs 1 and 2; Task 7 needs 6; Task 9 needs 8; Task 11 needs 10; Task 12
  needs 11. Task 13 needs everything.
- **Do not "fix" things you notice in passing.** `TrustStrip`'s hardcoded
  shipping threshold, the olive `--chart-2/3/4` ramp, and the pre-existing lint
  errors are all known and all out of scope (Spec §13).
- **If a handoff value and this plan disagree, this plan wins** — every
  divergence is recorded as a numbered deviation in the spec with the
  measurement that forced it.
