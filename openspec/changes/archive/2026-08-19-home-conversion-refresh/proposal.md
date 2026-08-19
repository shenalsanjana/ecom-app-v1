## Why

The storefront home page converts poorly and looks templated: a static promo line, a modestly-sized hero, category tiles that all resolve to the same cream product photo, and a low-contrast deals band that reads as just another section. The client delivered a high-fidelity design handoff targeting exactly these surfaces, together with a new logo whose terracotta replaces the current olive brand color.

Doing this now also settles two things that have quietly drifted: the brand token can be re-verified against the project's WCAG AA gate while it is being changed anyway, and the `storefront-home` spec — which still requires a New Arrivals section that commit `0c02610` deleted — can be reconciled with the code it claims to describe.

## What Changes

- **Brand color** moves from olive `oklch(0.51 0.085 125)` to terracotta `oklch(0.55 0.08 52)`, carrying `--ring`, `--chart-1` and `--sidebar-ring` with it. The logo samples to `#b27657`, but that measures 3.43:1 against the cream background and fails `scripts/check-contrast.ts`; so does the handoff's own suggested fallback at 4.41:1. `oklch(0.55 0.08 52)` is the shallowest terracotta clearing both brand pairs.
- **Announcement bar** becomes a horizontally scrolling marquee carrying four messages instead of one static line, gated behind `motion-safe:`, with the duplicated track marked `aria-hidden`.
- **Hero** gains a translucent rating chip and a larger, bolder headline whose final word sits on a brand-colored highlight.
- **Social-proof strip** is a new full-bleed band directly below the hero: rating, units delivered, cash on delivery, returns.
- **Product cards** gain two optional, display-only signals — a `Bestseller` badge and an `Only N left` nudge — both derived from real data (paid order items; live blank/design inventory). Only the two home-page readers populate them.
- **Deals section** flips to a high-contrast cocoa band with a live end-of-day countdown, implemented as the page's only new client island.
- **Category tiles** replace the image-under-gradient treatment with solid, per-category tints and ink chosen by measured contrast.
- **`storefront-home` spec is corrected**: the required section order is restated to match the shipped page plus the new strip, and the two New Arrivals requirements are removed. This documents a decision already made in code (`0c02610`) and changes no behavior.

Not breaking. No API, database, checkout, payment, courier, or admin behavior changes.

## Capabilities

### New Capabilities

- `home-conversion-signals`: Conversion-oriented presentation on the storefront home page — the scrolling announcement marquee, the social-proof strip, the deals countdown, and the display-only product-card scarcity and bestseller signals, including the rule that those signals derive from real data rather than fixed values.

### Modified Capabilities

- `storefront-home`: The required home page section order changes to include the new social-proof strip directly after the hero, and the three New Arrivals requirements (section order, product selection, presentation) are corrected to match the shipped page — New Arrivals was removed from the code in `0c02610` and the spec was never updated.

## Impact

**Code**

- `app/globals.css` — `:root` brand tokens, `@theme inline` animation token, `marquee` keyframes
- `app/page.tsx` — mounts `<SocialProof />`
- `app/_components/shared/announcement-bar.tsx` — marquee
- `app/_components/home/hero.tsx`, `category-strip.tsx`, `deals-section.tsx`, `product-card.tsx`
- New: `app/_components/home/social-proof.tsx`, `app/_components/home/deals-countdown.tsx`
- New pure modules with unit tests: `app/_lib/marquee.ts`, `category-tint.ts`, `countdown.ts`, `product-signals.ts`
- `app/_lib/products.ts` — `ProductView` gains two optional fields; `attachAggregates` gains an opt-in `withSignals` flag used only by `getFeaturedProducts` and `getDealsProducts`
- `app/_lib/free-delivery-note.ts` — pure variants extracted so the shared exclusion wording stays a single source and becomes testable

**Explicitly untouched:** `TrustStrip`, `getProducts`, `searchProducts`, `getWishlistProductCards`, `getProductById`, `getProductDetail`, and every cart/checkout/payment/courier/admin surface. `/deals` reads through `getProducts`, so despite its name it does not gain the new card signals.

**Gates:** `npm run check:contrast` becomes a required gate for this change, alongside `tsc --noEmit`, `lint`, `test`, `build` and `test:e2e`.

**Dependencies:** none added. Icons come from `lucide-react`; both fonts are already loaded in `layout.tsx`.

**Risk:** the brand token is global, so every brand-colored surface across the app shifts hue — sale prices, sale badges, wishlist heart fill, focus rings. This is intended, and the contrast gate is what bounds it.
