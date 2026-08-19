# Home Page Conversion + Visual Refresh — Design Spec

**Date:** 2026-08-19
**Status:** Approved for planning
**Source:** Client design handoff `design_handoff_home_conversion_refresh/` in the
Claude Design project `Ecom-app-v1 setup`
(`d904cb16-b993-4d2e-ae78-3b58508384a5`). The handoff README is copied verbatim
to `docs/superpowers/specs/2026-08-19-home-conversion-refresh-handoff.md` so this
spec stays reviewable even if the design project changes.

## 1. Goal

Raise conversion on the storefront home route and refresh the brand's visual
identity, per a high-fidelity client handoff. Seven changes: a new brand color
sampled from the new logo, a scrolling announcement marquee, a punchier hero, a
new social-proof band, scarcity/social signals on product cards, a high-contrast
"Deals of the day" band with a countdown, and solid-color category tiles.

Scope is the home route (`app/page.tsx`) and the components it renders, plus the
`:root` token block in `app/globals.css`. No checkout, cart, payment, courier, or
admin behaviour changes.

## 2. Fidelity and deviations

The handoff is high-fidelity: colors, typography, spacing, copy and interactions
are final, and the accompanying `Dressing Bear Storefront.dc.html` is a working
prototype, not code to paste. Recreate everything with the codebase's own
primitives — `Section`, `SectionHeader`, `Eyebrow`, `Price`, `Rating`,
`SaleBadge`, `Card`, `buttonVariants`, `lucide-react`, `next/image`, and the
`--token` CSS variables.

Five deliberate deviations from the handoff were agreed during brainstorming.
Each is justified below at the change that owns it:

| # | Deviation | Reason |
|---|---|---|
| D1 | `--brand` ships at `oklch(0.55 0.08 52)`, not the handoff's `oklch(0.62 0.075 55)` (`#b27657`) or its suggested fallback `oklch(0.56 0.08 52)` | Both fail the repo's WCAG AA gate (§3) |
| D2 | The social-proof strip's 4th item is 7-day returns, not free shipping | Free shipping would otherwise appear three times on one page |
| D3 | Card badges ship as `Bestseller` only; `Trending` and `Almost gone` are dropped | No honest data source; `Almost gone` duplicates the stock nudge |
| D4 | `badge`/`lowStock` are computed behind an opt-in flag used only by the two home readers | Keeps the handoff's "home page only" scope literal and avoids an extra query on search/category listings |
| D5 | Tile ink is `#332d26` (not `#3a332c`), chosen by max contrast rather than a luminance threshold, and the caption's "soft ink" is dropped | The handoff's rule renders two of its six tints at 1.7–2.4:1 (§9) |

## 3. Change 1 — Brand color

**File:** `app/globals.css` (`:root`)

The new logo (`uploads/Logo-01.png` in the design project — a warm terracotta
lion/"D" mark) samples to `#b27657`. The handoff names `#b27657` authoritative
but explicitly forbids shipping without re-running `scripts/check-contrast.ts`,
which gates every published token pair at WCAG AA.

That check fails. Running the same OkLab → linear-sRGB → WCAG-luminance math the
script uses, against the two pairs that involve `--brand`
(`brand` on `background`, and `brand-foreground` on `brand`):

| Candidate | Hex | brand on bg (≥4.5) | brand-fg on brand (≥4.5) |
|---|---|---|---|
| `oklch(0.62 0.075 55)` — handoff authoritative | `#aa7a5a` | 3.43 ❌ | 3.56 ❌ |
| `oklch(0.56 0.08 52)` — handoff fallback | `#9a6747` | 4.41 ❌ | 4.58 ✅ |
| **`oklch(0.55 0.08 52)`** — chosen (D1) | `#976445` | **4.59 ✅** | **4.77 ✅** |
| `oklch(0.51 0.085 125)` — current olive | `#5b6f36` | 5.16 ✅ | — |

`oklch(0.55 0.08 52)` is the shallowest terracotta that clears both gates. It
reads unmistakably as terracotta rather than the outgoing olive, which is the
point of the change.

Token edits, keeping the existing "ring and chart-1 mirror brand" convention:

- `--brand: oklch(0.55 0.08 52);`
- `--ring: oklch(0.55 0.08 52);`
- `--chart-1: oklch(0.55 0.08 52);`
- `--sidebar-ring: oklch(0.55 0.08 52);`
- `--brand-foreground` (cream) unchanged.

The comment above `--brand` currently says "the boutique olive" and must be
updated, or it becomes a lie.

`npm run check:contrast` is a required gate for this change, not a courtesy run.

Also add to `globals.css`, for Change 2:

```css
@keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
```

registered as a Tailwind animation utility in the `@theme inline` block
alongside the existing `--animate-wishlist-fill`, so components use a class
rather than inline styles.

## 4. Change 2 — Announcement bar → marquee

**File:** `app/_components/shared/announcement-bar.tsx`

Replace the single static centered line with a horizontally scrolling marquee.
Stays non-dismissible, stays above the sticky header, keeps the live
`freeThreshold` prop (the layout already fetched the delivery config and passes
it in — do not reach for a hook here).

Structure: an `overflow-hidden` wrapper containing one `flex` `whitespace-nowrap`
track with `animation: marquee 26s linear infinite`. The four-message set is
rendered **twice** back-to-back so the `-50%` loop is seamless.

- Colors unchanged: `bg-primary text-primary-foreground`.
- Item styling: `text-xs uppercase tracking-[0.06em] font-medium`, `44px` gap,
  `✦` separators at `opacity: 0.4`.
- Messages, in order:
  1. `freeThreshold > 0` → `Free shipping over {formatPrice(freeThreshold)}`;
     else `Free shipping on everything`. Keep the existing
     `freeDeliveryExclusionNote()` parenthetical — it is the single source of
     the "excludes Koko & Mintpay" wording and cart/checkout/product surfaces
     depend on it not drifting.
  2. `Pay in 3 interest-free — Koko & Mintpay`, with Koko gated behind
     `NEXT_PUBLIC_KOKO_ENABLED` exactly as today. The env read must stay a
     literal `process.env.NEXT_PUBLIC_KOKO_ENABLED` — Next inlines it by exact
     textual match at build time.
  3. `Cash on Delivery island-wide`
  4. `New drops every week`

**Accessibility:** the duplicated track is visual only — the second copy is
`aria-hidden` so screen readers do not read the set twice. The animation is
gated behind `motion-safe:`, so under `prefers-reduced-motion` the bar renders
as a static, non-animated row.

The message set is built by a small exported pure function so it can be
unit-tested without rendering.

## 5. Change 3 — Hero refresh

**File:** `app/_components/home/hero.tsx`

Keep the existing `/banners/spring-collection.jpg` full-bleed image, the
left-dark gradient, both CTAs (`Shop the collection` primary, `View deals`
underline link), and the `priority`/`sizes` image config.

Add above the eyebrow a **rating chip**: inline-flex pill, `whitespace-nowrap`,
`rgba(255,255,255,0.14)` background, `backdrop-blur`, `1px solid
rgba(255,255,255,0.28)`, `rounded-full`, `6px 14px` padding, `13px`. Content is
a filled amber star (`#f0b429`) plus `<b>4.8</b> · Loved by 12,000+ customers`.

Headline changes: `font-bold` (700), `clamp(42px,5.4vw,70px)`, `leading-[1.02]`,
`tracking-[-0.03em]`, and the final word wrapped in a brand highlight —
`Unleash your inner <span>bear.</span>` where the span carries
`background: var(--brand); color: #fff; padding: 0 .14em; border-radius: 12px;
box-decoration-break: clone; -webkit-box-decoration-break: clone` so the
highlight wraps correctly across lines.

## 6. Change 4 — Social-proof strip (new)

**Files:** new `app/_components/home/social-proof.tsx`; mounted in
`app/page.tsx` directly after `<Hero />`, before `<ProductGrid />`.

Full-bleed band, `bg-card`, `border-b`, centered wrapping flex row
(`gap: 14px 40px`, `padding: 18px 24px`, `max-w-7xl` inner). Server component.
Four icon+text items at `14px`:

1. Amber star (`#f0b429`) + `<b>4.8/5</b> from 850+ reviews`
2. `Check` (brand) + `<b>12,000+</b> tees delivered`
3. `CreditCard` (brand) + `Cash on Delivery island-wide`
4. `RotateCcw` (brand) + `7-day easy returns`

Item 4 is **D2**: the handoff specifies free shipping there, but the existing
`TrustStrip` at the bottom of the page already advertises free shipping, and so
does the marquee. Three mentions on one page is noise, so this slot carries a
signal the strip would otherwise not make. `TrustStrip` itself is untouched —
it does the detailed-benefits job lower down the page and is unchanged by this
work.

Because item 4 no longer depends on the delivery config, the component takes no
props.

## 7. Change 5 — Card scarcity and social proof

**Files:** `app/_lib/products.ts`, `app/_components/home/product-card.tsx`

`ProductView` gains one optional display-only field, and `ProductCardVariant`
gains another:

```ts
// ProductView — product-level fact
badge?: "Bestseller";

// ProductCardVariant — per-colour fact
lowStock?: number;
```

`lowStock` lives on the variant, not the product, because `ProductCard` lets
the customer switch colour (price, image, and sizes all follow the selected
variant already); a single product-level count would report one colour's
stock while the card shows another. `badge` stays product-level — bestseller
status is a fact about the product as a whole, not about any one colour.
Neither field participates in pricing, cart, or checkout logic.

**Data derivation (D3, D4).** `attachAggregates` takes a new
`{ withSignals }: { withSignals?: boolean }` option, defaulting to `false`.
Only `getFeaturedProducts` and `getDealsProducts` — the two cached readers the
home page uses — pass `true`. `getProducts`, `searchProducts`,
`getWishlistProductCards`, `getProductById` and the related-products read inside
`getProductDetail` are unchanged, so search and category
listings pay no extra query cost and the handoff's "nothing else in the app
changes" holds literally.

- `lowStock`: computed once per variant, inside the existing
  `p.variants.map(...)` in `attachAggregates`, using the `plainStock` /
  `designStock` maps **already loaded** (via `buildPlainStockMap` /
  `buildDesignStockMap`). The unit is `unitsForVariant`: every finished tee
  consumes one blank AND one print from a single shared design pool, so the
  fulfillable total for a colour is capped **once, across the whole colour**,
  not once per size —
  `min(designQty, sum of plain blanks across that colour's sizes)`, and `0`
  when there is no design or the design pool is empty. Emitted only when that
  total is `<= 6`; otherwise left undefined. No schema change, no new query —
  the maps are in hand.

  *(An earlier draft of this derivation summed `stockForSize` — itself
  `min(plainQty, designQty)` — across sizes. Against a shared design pool that
  triple-counts a single print run: 3 sizes x 10 blanks with 1 print left
  reported "3 left" instead of the true "1 left". Fixed before ship; see
  `app/_lib/product-signals.ts`.)*
- `badge`: `"Bestseller"` for products in the top N by paid `orderItems`
  quantity, via one `prisma.orderItem.groupBy` scoped to the ids already in
  view. Both home readers are wrapped in `unstable_cache`, so this runs at most
  once per cache window.
- `Trending` and `Almost gone` are **not** implemented. `Trending` has no
  measurable definition in this schema, and `Almost gone` is the same fact the
  stock nudge already states in words. Shipping either from a hardcoded map
  would put fabricated scarcity in front of real customers.

**Rendering** in `ProductCard` (a `"use client"` component shared by seven
routes — home, `/categories`, `/categories/[slug]`, `/deals`, `/wishlist`,
`/search`, and the related strip on `/products/[id]`). Both signals render only
when the field is present, so the other six routes are visually unchanged
because their readers never populate them. Note `/deals` reads via
`getProducts`, **not** `getDealsProducts`, so it is unaffected despite the name:

- **Badge pill**, absolutely positioned over the image at `left: 12px;
  bottom: 12px`: `bg-primary text-primary-foreground`, `text-[10px]
  font-semibold uppercase tracking-[0.05em]`, `rounded-full`, `4px 9px` padding.
  Must not collide with the existing `SaleBadge` (`absolute left-3 top-3`) or
  the `WishlistHeart` (`absolute right-2 top-2`) — bottom-left is free.
- **Stock nudge**, in the card body directly under `<Rating />`: `text-xs
  font-semibold text-brand` with a small `Clock` icon — `Only {lowStock} left`.
  Read from the currently selected `variant`, so switching colour switches
  the count along with price, image, and sizes.

## 8. Change 6 — Deals band + countdown

**Files:** `app/_components/home/deals-section.tsx`, new
`app/_components/home/deals-countdown.tsx`

- Section background flips from `bg-muted` to `bg-primary text-primary-foreground`
  (cocoa). The `ProductCard`s inside stay light and unchanged, which is what
  creates the contrast.
- Header: add eyebrow `Limited time` in
  `color-mix(in oklab, var(--brand) 70%, white)`; `h2` to `34px font-bold`;
  sub-copy at `rgba(255,255,255,0.6)`.
- `See all deals →` at `rgba(255,255,255,0.75)`, hover `#fff`.
- **Countdown pill** `Ends in HH:MM:SS`, counting down to the end of the local
  day (`23:59:59`): `rgba(255,255,255,0.1)` background, `1px solid
  rgba(255,255,255,0.2)`, `rounded-full`. Digits in `font-mono`
  (`--font-geist-mono`, already loaded in `layout.tsx`) coloured
  `color-mix(in oklab, var(--brand) 65%, white)`, with a pulsing brand dot
  (`box-shadow: 0 0 0 4px color-mix(in oklab, var(--brand) 30%, transparent)`).

The countdown is the **only** new client state on the page. It lives in its own
`"use client"` island (`useEffect` + 1s `setInterval`, cleared on unmount) so
`DealsSection` remains an async server component — per CLAUDE.md, an async
server component must never be rendered inside a `"use client"` component, and
this ordering respects that.

**Hydration:** the server and the first client render must agree. The island
renders a stable placeholder (or the pill with the interval-computed value only
after mount) rather than computing `Date.now()` during render, so SSR output and
first paint match.

The `HH:MM:SS` formatting is a pure exported function, unit-tested independently
of the interval.

## 9. Change 7 — Category tiles

**File:** `app/_components/home/category-strip.tsx`

The current tiles put a dark gradient over `c.image`, and every category
resolves to a similar cream product photo, so they read as six copies of the
same muddy tile. Replace with solid, distinct brand-adjacent color tiles:
centered label, mono caption. Keep the existing `aspect-[3/4]`, `rounded-xl` and
grid; add `motion-safe:hover:-translate-y-[3px]`.

- Named tints: Cat `#EFC4C4`, Dino `#AEBBA0`, Bear `#C4906E`, Retro `#E4D3B0`,
  Wave `#AEC3D1`, Nature `#BFC7A6`.
- `getCategories()` reads arbitrary rows from the database, so a slug not in
  that map is not a hypothetical. A `CATEGORY_TINTS` record covers the six known
  slugs; anything else falls back to a deterministic slug-hash pick from the
  same six-color palette, so an admin adding a category gets a stable, distinct
  tile instead of a blank one.
- **Ink (D5).** The handoff says "dark tiles → `#F1EDE4`, light tiles →
  `#3a332c`" computed from tile luminance. Implemented as a luminance
  threshold, that rule is unshippable: measured WCAG contrast of each ink
  against each tint is

  | Tint | Luminance | vs `#3a332c` | vs `#F1EDE4` |
  |---|---|---|---|
  | Cat `#EFC4C4` | 0.618 | 7.91 | 1.35 |
  | Dino `#AEBBA0` | 0.471 | 6.16 | 1.73 |
  | Bear `#C4906E` | 0.328 | 4.47 | 2.38 |
  | Retro `#E4D3B0` | 0.662 | 8.43 | 1.26 |
  | Wave `#AEC3D1` | 0.526 | 6.82 | 1.56 |
  | Nature `#BFC7A6` | 0.547 | 7.06 | 1.51 |

  A threshold at 0.5 sends Dino and Bear to light ink at **1.73:1 and 2.38:1**.
  Dark ink wins on all six. So `inkFor(bg)` picks **whichever of the two inks
  has the higher contrast**, not whichever side of a threshold the tile falls
  on — same intent, correct outcome, and it stays correct if the palette is
  edited later.

  The dark ink is darkened from `#3a332c` to **`#332d26`**, which lifts the
  worst tile (Bear) from 4.47 to **4.90** so every tint clears AA 4.5:1 for
  small text without altering any handoff tint.

  The caption's **soft ink variant is dropped**: no softened ink clears 4.5:1
  on Bear (`#6b6157` reaches only 2.18), so a "soft" caption would be the one
  illegible element on the page. The caption uses the same ink, separated from
  the name by the mono face, size, uppercase and `0.16em` tracking instead.
- Content: centered `28px font-bold` category name; below it `font-mono
  text-[10px] uppercase tracking-[0.16em]` `Shop {name} →` in the same ink.

`CategoryView.image` stays on the type and in the query — it is used elsewhere,
and if real category imagery lands later these tiles can revert to photos. The
`next/image` import in this file becomes unused and must be removed or lint
fails.

## 10. Interactions, responsiveness, state

- **Motion:** marquee and countdown run continuously; the marquee is gated
  behind `motion-safe:`. Card hover keeps the existing `Card` primitive's
  `-translate-y-0.5 + shadow-card` at `--duration-base`; category tiles add
  `-translate-y-[3px]`.
- **Navigation** unchanged: cards → `/products/{id}`, tiles →
  `/categories/{slug}`, deals header → `/deals`.
- **Responsive:** all rows reuse existing `grid-cols` breakpoints; both strips
  wrap via `flex-wrap`. No new breakpoints.
- **State:** the countdown island is the only new client state. `badge` and
  `lowStock` are data fields, not runtime state.
- `app/page.tsx` changes by exactly one line: `<SocialProof />` after `<Hero />`.

## 11. Design tokens

| Token | Value |
|-------|-------|
| Brand (new) | `oklch(0.55 0.08 52)` ≈ `#976445` — AA-verified, see §3 |
| Cocoa / primary | `oklch(0.235 0.018 60)` (unchanged) |
| Cream / background | `oklch(0.972 0.013 80)` (unchanged) |
| Card | `oklch(0.985 0.008 80)` (unchanged) |
| Muted-foreground | `oklch(0.54 0.018 60)` (unchanged) |
| Border | `oklch(0.89 0.014 75)` (unchanged) |
| Amber star | `#f0b429` |
| Radius | `--radius: 1rem` — cards `rounded-2xl`, tiles `rounded-xl`, pills `rounded-full` |
| Category tints | Cat `#EFC4C4`, Dino `#AEBBA0`, Bear `#C4906E`, Retro `#E4D3B0`, Wave `#AEC3D1`, Nature `#BFC7A6` |
| Tile ink | `#332d26` (dark) / `#F1EDE4` (light), selected by max contrast — see §9 |
| Fonts | Poppins 400/500/600/700; Geist Mono for the countdown — both already in `layout.tsx` |

Icons all come from `lucide-react` (already a dependency): `Star`, `Check`,
`CreditCard`, `RotateCcw`, `Clock`, `ArrowRight`.

Assets are unchanged: `public/logo.png` (header/footer) and
`public/banners/spring-collection.jpg` (hero). If the client confirms
`uploads/Logo-01.png` as the official mark, replacing `public/logo.png` is a
separate change.

## 12. Testing

Pure logic extracted so it can be tested without rendering:

- marquee message assembly across `freeThreshold > 0` / `= 0` and
  `NEXT_PUBLIC_KOKO_ENABLED` on/off;
- `HH:MM:SS` countdown formatting, including the end-of-day boundary;
- category tint resolution — known slugs, unknown-slug fallback determinism, and
  ink selection on both light and dark tints;
- `lowStock` derivation (at, below, and above the `<= 6` threshold; the
  no-stock-data case) and `Bestseller` selection.

Gates before merge: `npm run check:contrast`, `npx tsc --noEmit`,
`npm run lint`, `npm run test`, `npm run build`, and `npm run test:e2e` — the
home page is a user flow, so the Playwright suite is required, not optional.

`npm run build` and `npm run test:e2e` need a reachable `DATABASE_URL`; per
`STUB_READINESS_STATUS.md` this has repeatedly been the local blocker, so if no
Postgres is available locally those two must run in CI or against the VPS
before merge rather than being marked passed.

## 13. Out of scope

- Replacing `public/logo.png` with `uploads/Logo-01.png`.
- Any change to `TrustStrip`, including its hardcoded "over Rs. 5,000" copy,
  which does not read the live `freeThreshold`. Real, but pre-existing and not
  this change's business.
- Real category photography.
- A `Product.badge` column plus admin merchandising UI (the route to shipping
  `Trending`/`Almost gone` honestly, if the client wants them later).
- Cart, checkout, payment, courier, and admin surfaces.
