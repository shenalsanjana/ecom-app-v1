# Taxonomy Section Visual Fidelity — Design

**Date:** 2026-09-01
**Status:** Approved for planning
**Predecessor:** `docs/superpowers/specs/2026-09-01-taxonomy-navigation-surfaces-design.md` (shipped)
**Source of truth:** `Dressing Bear Storefront.dc.html` (root revision) in Claude Design project
`d904cb16-b993-4d2e-ae78-3b58508384a5`

## 1. Purpose

The storefront prototype was revised after `taxonomy-navigation-surfaces` shipped. Diffing the new
revision against the one that handoff was written from, the substance of the change — department
nav, department cards, "Shop by design", breadcrumbs, photo-backed cards — is already built. What
did not land is the visual treatment of the two home taxonomy sections, which the implementation
simplified into a single shared `TintTile`.

This change closes that gap. It is scoped to **"Shop by category"** and **"Shop by design"** on the
home route. Nothing else on the home page moves, and no other route is touched.

## 2. What is already built

- **Both sections exist and read the taxonomy correctly.** `DepartmentCards` and `DesignGrid` filter
  on `showsNavDropdown` / `showsInDesignSection`, and `app/page.tsx` already passes one cached
  `getDepartments()` read into both.
- **`TintTile` serves both.** It renders a 3:4 tile with the label centred *inside* it, a flat
  scrim over any photo, and measured-contrast ink from `inkFor`. Its only two consumers are the two
  components in this change — it is not a shared primitive despite its location in `_components/ui/`.
- **The contrast machinery is sound and reusable.** `relativeLuminance`, `contrastRatio`, `inkFor`,
  `SCRIM_ALPHA` and `compositeOverBlack` in `app/_lib/taxonomy-tint.ts` are exactly the right tools;
  this change extends them rather than working around them.
- **The smaller deltas in the new revision already shipped.** The PDP's department › sub-category
  breadcrumb (`8fd1811`), the card title/sub-label split (`9df07fd`), and photo-on-tile
  (`8110721`) are all present. They are verified in this change, not rebuilt.

The gap is therefore narrower than "implement the design", and entirely presentational plus one
new read:

| | Prototype | Repo today |
|---|---|---|
| Shop by category | 1:1 media, then a **card body below** — name, mono note, brand arrow; rotating photos with dot pagination | 3:4 tile, label centred inside, no body, no rotation |
| Shop by design | Dense grid, **caption over a bottom gradient** — name plus mono `N products`; rotating photos with dots | 3:4 tile, 28px centred label, flat scrim, no note |
| Section heading | Section eyebrow `Oversized Graphic T-Shirts`, per-group `h3` = department name | Per-group eyebrow = department name, `h3` = `subName` |

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Extract a shared `SlideShow` client component; keep `DepartmentCard` and `DesignTile` as server shells | Below the media area the two treatments share no markup. A `variant` prop would be two components in a trenchcoat and would push both shells client-side for state that belongs to the media area alone. CLAUDE.md §3: client components stay small and at the leaves |
| 2 | Retire `TintTile` rather than extend it | Both of its consumers move to the new shells, so nothing is left to serve. Keeping it would leave a third tile treatment in the tree that nothing renders |
| 3 | One interval in a provider, not one per tile | The prototype advances every tile off a single 3800 ms clock, so they cross-fade in sync. N tiles with N intervals drift visibly apart and cost N timers |
| 4 | Reduced motion is read with `matchMedia`, not the `motion-safe:` class | A CSS class cannot gate a `setInterval`. The class convention still applies to the hover transforms, which are pure CSS |
| 5 | A manual dot click pins that tile permanently | Auto-advancing a tile a visitor has just chosen takes the page back off them. Pinning is also what makes the dots meaningful rather than decorative |
| 6 | Department slides derive from `d.designs[]`; no new query | `image`, `hex` and `name` are already on `DepartmentView`. The slides are a re-projection of data the page has already paid for |
| 7 | Design slides and counts come from a **new** cached reader, not from `getDepartments()` | `getDepartments()` is called on ~20 routes — the footer self-fetches it on every page (see the comment in `app/page.tsx`). Nesting `product → variant → image` into it would slow the whole site for data only the home route reads |
| 8 | One query serves both slides and counts | The row set *is* the non-archived products, so counting rows per design gives the caption and the first four urls give the slides. A separate `groupBy` would be a second query answering a question the first already answers |
| 9 | The prototype's `N products` fallback for a department note is dropped | `DepartmentCards` renders only departments passing `showsNavDropdown` (`designs.length > 0`), so the `N designs` branch always wins. The other branch is unreachable here |
| 10 | The prototype's `.reverse()` on design groups is not ported | It reads as incidental to the prototype's hardcoded fixture order. `sortOrder` is the repo's declared ordering and stays authoritative |
| 11 | Section eyebrow and group heading swap roles, per the prototype | `subName` is shared by Men and Women, so it identifies the *section*; the department name identifies the *group*. This also dissolves the `sr-only` workaround in `design-grid.tsx`, which exists only because two groups currently render identical headings |

## 4. Components

Four files replace one. All measurements are from the prototype and are final.

| File | Kind | Responsibility |
|---|---|---|
| `app/_components/ui/slide-clock.tsx` | `"use client"` | Provider holding one 3800 ms interval and a monotonic tick in context. Never starts the interval when `matchMedia("(prefers-reduced-motion: reduce)")` matches. Cleans up on unmount |
| `app/_components/ui/slide-show.tsx` | `"use client"` | The media area. Absolutely-positioned layers cross-fading on `opacity`, tint as the ground beneath, dot pill. Index is `tick % slides.length` until a dot is clicked, then pinned. One slide → static layer, no dots, no subscription |
| `app/_components/home/department-card.tsx` | server | Card shell + `SlideShow` + body row |
| `app/_components/home/design-tile.tsx` | server | Tile shell + `SlideShow` + gradient caption |

`app/_components/ui/tint-tile.tsx` and `app/_components/ui/__tests__/tint-tile.test.ts` are deleted.

### 4.1 `SlideShow` contract

```ts
type Slide = { hex: string; photo?: string | null; label?: string; title?: string };

type SlideShowProps = {
  slides: Slide[];
  dots: "bottom-right" | "top-right";
  fadeMs: number;            // 700 for departments, 650 for designs
  subject: string;           // what the tile is *of* — used to name the dots
};
```

`Slide.label` is the visible frosted pill; `subject` is the enclosing tile's own name. They are
distinct, and the dots use both: a dot is named `Show {slide.label}` when the slide carries a
label, and `Show {subject}, image {n} of {total}` when it does not — which is the design-tile case,
where slides are product photos with no caption of their own.

- Ground is always `slides[i].hex`, painted under the photo, so a slow or failed image still has a
  background — the guarantee `TintTile` established and this change keeps.
- `title` renders the no-photo centred label used by design tiles: 15px/600, `line-height: 1.2`,
  `padding: 14px 12px 34px`, ink from `inkFor(slide.hex)`, `text-wrap: balance`.
- `label` renders the department card's frosted slide pill: top-left at `10px`, `padding: 4px 9px`,
  `rounded-full`, 10px/500, `letter-spacing: .02em`, `bg rgba(255,255,255,.72)`, `blur(4px)`,
  text `#5b524a`.
- Dot pill: `padding: 4px 6px`, `rounded-full`, `gap: 4px`, `blur(4px)` — `rgba(255,255,255,.6)` at
  bottom-right (departments, inset `10px`), `rgba(255,255,255,.58)` at top-right (designs, inset
  `9px`). Dots are 5×5, active `rgba(20,15,10,.8)`, inactive `rgba(20,15,10,.28)`.

### 4.2 `DepartmentCard`

Outer: `rounded-2xl bg-card`, ring `0 0 0 1px color-mix(in oklab, var(--foreground) 6%, transparent)`,
hover `-translate-y-[3px]` + `shadow-card`, transition `.25s ease`. Media is 1:1. Body is
`padding: 16px 18px 18px`, a `space-between` row: name at 21px/700, `line-height: 1.1`,
`tracking-[-0.015em]`, `text-wrap: balance`; mono note at 10px, `tracking-[.16em]`, uppercase,
`text-muted-foreground`; a 19px brand arrow, `shrink-0`.

Slides are one per design under the department — `photo: design.image`, `hex: design.hex`,
`label: design.name`. Note is `d.note ?? \`${d.designs.length} designs\`` (decision 9).

Grid moves from fixed `grid-cols-2 lg:grid-cols-4` to `auto-fill minmax(220px, 1fr)`, gap 6.

### 4.3 `DesignTile`

Tile: 1:1, `rounded-[14px]`, ground = design hex, hover `-translate-y-[3px]`, transition `.2s ease`.
Caption pinned to the bottom over `linear-gradient(to top, rgba(20,15,10,.8), rgba(20,15,10,0))`,
`padding: 26px 12px 11px`: name 15px/600 `line-height: 1.15` in `#fff`; mono note at 9px,
`tracking-[.14em]`, uppercase, `rgba(255,255,255,.72)`.

Group header: `h3` at 15px/600 with the mono count label baseline-aligned beside it at 10px,
`tracking-[.14em]`, uppercase, muted; `margin-bottom: 16px`. Grid is
`auto-fill minmax(130px, 1fr)`, gap 3.5; groups are separated by 34px.

Section gains the eyebrow `Oversized Graphic T-Shirts` above the `h2` via `SectionHeader`'s
existing `eyebrow` prop, and each group's `h3` becomes the department name (decision 11). The
`sr-only` span in the current `design-grid.tsx` is removed with the ambiguity that motivated it.

## 5. Data

### 5.1 New reader — `app/_lib/taxonomy-media.ts`

Called only by `app/page.tsx`. Cached under its own key, tagged `["catalog", "products"]`,
`revalidate: 3600` — the existing `revalidateTag("catalog", "max")` in the admin actions already
busts it, so no new invalidation is introduced.

```ts
prisma.product.findMany({
  where: { archived: false },
  orderBy: [{ designSlug: "asc" }, { id: "asc" }],   // deterministic slide order
  select: {
    designSlug: true,
    variants: {
      where: { archived: false }, orderBy: { sortOrder: "asc" }, take: 1,
      select: {
        images: {
          where: { role: "CARD" }, orderBy: { sortOrder: "asc" }, take: 1,
          select: { url: true },
        },
      },
    },
  },
})
```

One row per non-archived product, two columns wide. `@@index([variantId, role, sortOrder])` on
`VariantImage` covers the nested take exactly.

### 5.2 Pure projection

Following the split `taxonomy-counts.ts` already establishes — thin cached query, pure arithmetic:

```ts
export function designMedia(
  rows: { designSlug: string; variants: { images: { url: string }[] }[] }[],
  maxSlides: number,
): Map<string, { photos: string[]; count: number }>;
```

`count` is rows per `designSlug`; `photos` is the first `maxSlides` (4) non-null urls. A product
with no variant, or a variant with no CARD image, still counts but contributes no photo — Prisma's
nested `select` returns an empty array rather than dropping the parent row, which is the behaviour
this relies on.

A design with zero photos falls back to its own `design.image`, then to a tint-only slide. The
caption reads `1 product` / `N products`.

## 6. Contrast and accessibility

### 6.1 The gradient needs a local guarantee

`SCRIM_ALPHA = 0.6` is justified by a flat scrim over the whole tile: the label can sit anywhere, so
the guarantee must hold everywhere. The new caption is pinned to the bottom, so the guarantee
becomes local — and *weaker* than 0.6 where the text starts.

Two consequences:

1. `compositeOverBlack` generalises to `compositeOver(hex, overlay, alpha)`; the existing function
   becomes the `#000` case, since the gradient's overlay is `rgb(20,15,10)`, not pure black.
2. The binding alpha is **not** `0.8` but the gradient's value at the **top edge of the text box**.
   With `padding: 26px 12px 11px` the name's ascender sits well above the dark end. That figure
   becomes a named constant (`CAPTION_SCRIM_MIN_ALPHA`) and is what the test asserts on.

### 6.2 Known risk

The note line is `rgba(255,255,255,.72)` at 9px — small text, so AA wants 4.5:1 — measured against a
*partially* transparent overlay rather than the full flat scrim. On the lighter tints this is
expected to fail when the photo does not paint: snoopy (`#E4DCC6`) is already the worst case at
4.36:1 under a 0.5 flat scrim.

If it fails, the remedy is to raise the gradient's dark stop or take the note to full white,
whichever the measurement favours. **The implementation measures and picks; it does not ship the
prototype's values unverified.** The same check applies to the department card's frosted slide
label (`#5b524a` on `rgba(255,255,255,.72)`) in the photo-fails case.

### 6.3 Accessibility

- Dots are real `<button>`s carrying `aria-current` and the accessible name defined in §4.1.
- Rotation never starts under `prefers-reduced-motion: reduce`; dots remain clickable.
- A dot click pins that tile, so the carousel cannot pull context away from someone mid-read
  (decision 5).
- Each tile remains one link to its department or design; the dots sit inside it and must
  `stopPropagation` so choosing a slide does not navigate.

## 7. Out of scope

- The other six prototype screens (Browse, Product, Cart, Checkout, Confirmation, Account). The
  root revision touches several of them; a systematic audit is a separate change.
- The already-shipped deltas listed in §2 — verified, not rebuilt.
- Any schema change. Both sections are served by data the models already carry.
- Any change to `getDepartments()` or the ~20 routes reading it (decision 7).

## 8. Testing

| File | Covers |
|---|---|
| `app/_components/ui/__tests__/slide-show.test.ts` | Index derivation from tick, single-slide short-circuit (no dots, no subscription), pinning after a dot click, no timer under reduced motion |
| `app/_lib/__tests__/taxonomy-media.test.ts` | Pure `designMedia`: product with no variant, variant with no CARD image, capping at four, count diverging from photo count, empty input |
| `app/_lib/taxonomy-tint.test.ts` | Extended: `compositeOver` against a non-black overlay; every tint clears AA at `CAPTION_SCRIM_MIN_ALPHA` for both caption lines |
| `app/_components/home/__tests__/department-cards.test.ts` | Updated: card body renders name/note/arrow; slides projected one per design; note falls back to `N designs` |
| `app/_components/home/__tests__/design-grid.test.ts` | Updated: section eyebrow and group `h3` swap; count label; `sr-only` span gone |
| `app/__tests__/home-page.test.ts` | Updated: the new reader is called and threaded into `DesignGrid` |

`app/_components/ui/__tests__/tint-tile.test.ts` is deleted with its component.

## 9. Validation

- `npm run build`
- `npm run test`
- `npm run test:e2e` — this changes home navigation, so CLAUDE.md §2 requires it
- `npm run check:contrast` — the tint guarantees move, so the gate must be re-run, not assumed
