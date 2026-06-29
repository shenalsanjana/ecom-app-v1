# Storefront Cohesion Foundation — Design

**Date:** 2026-06-29
**Status:** Approved (visual direction), pending implementation plan
**Author:** brainstormed with visual companion

## Goal

Raise the **craft and cohesion** of the customer-facing storefront without changing its
visual direction. The May 2026 boutique refresh established the look (warm cream + cocoa +
olive, light-only, shadcn components, Poppins). This round is **polish & cohesion, not a
reinvention**: tighten the shared design language so the same spacing, type, motion, and
component treatments apply on every surface.

The key insight: **cohesion is produced by the shared layer.** If the spacing scale, type
scale, motion vocabulary, and the most-reused presentational pieces are defined once, then
consistency across home, listing, PDP, and cart/checkout follows by construction. So this is
the **foundation sub-project** of a foundation-first decomposition — it builds the tokens and
primitives; per-surface application ships as follow-on plans.

Direction was validated section-by-section in a browser visual companion. The user approved a
**Balanced** density, **Poppins-only** type, **Restrained** motion, and **extracting small
React primitives**.

## Scope (this spec)

Cross-cutting foundation only:

1. **Token layer** — a documented 4px spacing scale, a named type scale, a restrained motion
   vocabulary, and one focus-ring style, expressed in `app/globals.css` (`@theme` + `:root`)
   and a short tokens reference doc.
2. **Presentational primitives** — extract `Section`, `Container`, `SectionHeader`, `Eyebrow`,
   `Price`, `Rating`, `SaleBadge`, `TextLink` as small components under
   `app/_components/ui/` (these are storefront-specific presentational primitives, kept
   distinct from shadcn's generic `components/ui/`), each backed by pure-logic helpers where
   there is logic to test.
3. **Reference application** — refactor **`ProductCard`** and the **home section headers**
   to consume the new tokens/primitives. This is the single highest-leverage consumer (the
   card appears on home, categories, search, and deals) and proves the system end-to-end
   without a full page-by-page sweep.

### Out of scope (follow-on plans, foundation-first order)

Per-surface application of the foundation, mirroring the repo's existing decomposition:

- **Home surfaces** — hero, category strip, product grid, deals, trust strip adopt
  `Section`/`Container`/`SectionHeader`.
- **Product listing** — category / search / deals pages: grid, toolbar, sort, pagination.
- **Product detail (PDP)** — gallery, buy box, reviews, related strip.
- **Cart & checkout** — cart line items, summary, free-shipping progress, checkout steps,
  success page.

Each follow-on is its own spec → plan → implementation cycle and reuses these primitives.

## Decisions (2026-06-29, validated in visual companion)

### 1. Spacing & vertical rhythm — **Balanced**
- Single **4px ladder**; every padding/gap/margin snaps to a step (no more 5px / 14px one-offs).
- **Section vertical padding:** ~80px desktop / ~48px mobile (Tailwind `py-12 md:py-20`).
- **Grid gap:** 24px (`gap-6`), replacing the current mix of `gap-4` / `gap-5` / `sm:gap-6`.
- **Section-header → content offset:** 40px (`mb-10`).
- **Container is already consistent and kept:** `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8`.
  This becomes the `Container` primitive; `Section` wraps it with the vertical rhythm and the
  existing `border-b` divider convention.

### 2. Type scale — **Poppins only, one named scale**
Current implemented state is **Poppins for both `--font-sans` and `--font-heading`** (the May
spec's Fraunces/Inter pairing never fully landed). We keep Poppins — no new webfont — and just
make the sizes/weights/tracking disciplined. Named roles:

| Role | Size | Weight | Tracking / notes |
|------|------|--------|------------------|
| `eyebrow` | 11px | 600 | `.16em`, uppercase, **olive (`text-brand`)** |
| `display` (hero h1) | 40 → 56px responsive | 600 | `-0.02em`, leading-tight |
| `h2` (section title) | 24px | 600 | `-0.01em` |
| `h3` (card / sub title) | 16px | 500 | leading 1.35 |
| `body` | 15px | 400 | leading 1.6 |
| `meta` | 13px | 400 | `text-muted-foreground` |
| `price` | 16px | 600 | olive when on sale |

The **`Eyebrow` primitive** ends today's three-way drift (product card `0.65rem/.12em/muted`,
hero `xs/.22em/white`, product grid `xs/.18em/brand`). Hero keeps its over-image white
treatment via an `Eyebrow` `tone` prop (`brand` default, `inverse` for dark imagery) rather
than a one-off class.

### 3. Micro-interactions & motion — **Restrained**
Reuse existing tokens (`--duration-fast 150ms`, `--duration-base 200ms`, `--duration-slow
320ms`, `--ease-out`). One documented vocabulary, applied everywhere:

- **Card hover:** lift `translateY(-2px)` + `shadow-card`, `duration-base`. (Card primitive
  already does this; make it the only lift value.)
- **Media zoom:** `scale(1.05)`, `duration-slow` — cards and category tiles.
- **Press:** `active:translate-y-px` on buttons/links.
- **Focus ring:** one style everywhere — `focus-visible:border-ring` + `ring-3 ring-ring/50`
  (olive). Applies to inputs, buttons, and `TextLink`.
- **Underline link:** underline wipes in from the left on hover — the **`TextLink` primitive**
  replaces the three different `border-b` link styles (product grid "View all", hero "View
  deals", card title hover).
- **Loading:** one skeleton shimmer timing across all loading states.
- **Reduced motion:** every transition wrapped in `motion-safe:` (the Card already does this;
  make it universal). This is a hard rule, not optional.

### 4. Component consistency — **Extract small React primitives**
New presentational primitives (one source of truth; a future tweak updates every surface):

- **`Section`** — `<section>` with vertical rhythm + optional `border-b`.
- **`Container`** — the `max-w-7xl` gutter wrapper.
- **`SectionHeader`** — `eyebrow` + `title` + optional right-aligned `action` (a `TextLink`).
- **`Eyebrow`** — label with `tone` prop.
- **`Price`** — current + optional original; renders strikethrough + olive sale color; pure
  `discountPct` / formatting logic extracted to a tested helper.
- **`Rating`** — amber star + bold value + muted count.
- **`SaleBadge`** — rounded olive badge (`−25%`), replacing the square red badge.
- **`TextLink`** — animated-underline link with the standard focus ring.

Existing shadcn **`Card` / `Button` / `Badge` stay** — we align their tokens, not replace them.
`ProductCard` is refactored to compose `Price`, `Rating`, `SaleBadge`, `Eyebrow`; home section
headers are refactored to `SectionHeader`. `SaleBadge` supersedes `ProductCard`'s inline
`<Badge variant="outline">` sale chip.

## Architecture & boundaries

```
app/globals.css             ← spacing/type/motion tokens (@theme inline + :root)
docs/.../tokens-reference    ← human-readable token doc (what each role/token is for)

app/_components/ui/          ← NEW storefront presentational primitives
  section.tsx        Section, Container
  section-header.tsx SectionHeader
  eyebrow.tsx        Eyebrow (tone: brand | inverse)
  price.tsx          Price          → app/_lib/pricing.ts (discountPct, pure, tested)
  rating.tsx         Rating
  sale-badge.tsx     SaleBadge
  text-link.tsx      TextLink

app/_lib/pricing.ts          ← discountPct (extracted from product-card; tested)
app/_lib/format.ts           ← existing formatPrice — REUSED, not duplicated

app/_components/home/product-card.tsx   ← refactored to consume the above
app/_components/home/{product-grid,category-strip,...} headers → SectionHeader (reference)

components/ui/               ← existing shadcn Card/Button/Badge: tokens aligned, kept
```

Each primitive answers: *what it renders, how you pass it data, what it depends on.* They are
presentational and dependency-light (props in, markup out) so any surface can adopt them in
isolation. Logic that can be wrong (discount %, price formatting) lives in pure helpers under
`app/_lib/` and is unit-tested; the JSX is verified by `tsc` + visual review.

## Constraints & non-negotiables

- **WCAG AA preserved.** The olive `--brand` token is tuned so olive-on-cream clears 4.5:1
  (see `app/globals.css` comments and `scripts/check-contrast.ts`). Any token change re-runs
  the contrast check; do not regress it. Sale price stays olive, not red, for this reason.
- **No dark mode.** The `dark:` variant is intentionally inert (no `.dark` ancestor). Do not
  reintroduce dark-mode semantics or `.dark` blocks.
- **No new webfonts.** Poppins only.
- **Keep shadcn primitives.** Align tokens; don't fork or replace Card/Button/Badge.

## Testing & validation

- **No local database** in this environment: `next build` prerender and `prisma migrate dev`
  fail here. The gate is **`tsc` (typecheck) + `npm run test` (Vitest)**.
- **Vitest is node-env (no RTL/jsdom).** TDD applies to **pure logic only** — e.g. extracting
  `discountPct` into `app/_lib/pricing.ts` and testing it (existing `formatPrice` in
  `app/_lib/format.ts` is reused, not re-tested). Components/styling are verified by `tsc` +
  visual review in the companion; **no invented `render()` tests**.
- Re-run `scripts/check-contrast.ts` after token edits.

## Success criteria

- A documented spacing/type/motion token set exists and is the single source for those values.
- The 8 primitives exist, are typed, and pass `tsc`; their pure helpers pass Vitest.
- `ProductCard` and home section headers are rebuilt on the primitives with **no visual
  regression** vs the approved companion mockups (eyebrow, sale color, badge shape, rhythm,
  restrained hover all match the "after" panel).
- Contrast check still passes; no `dark:` semantics introduced; no new webfont added.
- Follow-on per-surface plans can adopt the primitives without further token decisions.
