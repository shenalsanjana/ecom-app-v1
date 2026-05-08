## Why

The storefront ships on default shadcn/ui tokens — pure neutral grayscale, Geist Sans, no brand voice. The catalog skews lifestyle (linen, cotton, sleepwear, perfume) but the surface looks identical to a thousand other stores. A coherent visual identity ("Boutique" — warm cream + cocoa + olive) plus a small set of named micro-interactions, plus a WCAG AA contrast floor, lets the storefront feel considered without a redesign. The constraint is intentional: no page restructuring, no new pages, no API changes — token-first refresh.

## What Changes

- Introduce a complete design-token contract in `app/globals.css`: warm cream background, cocoa ink foreground, olive accent (`oklch(0.55 0.075 125)`), warm hairline borders, single warm shadow, a `--font-heading` (Fraunces) / `--font-sans` (Inter) split, and explicit motion tokens (`--ease-out`, `--duration-fast/base/slow`).
- Wire Inter and Fraunces via `next/font/google` in `app/layout.tsx` (display:swap, latin subset, Fraunces axis subset to `opsz` + `wght`). Replace Geist Sans for body/UI; keep Geist Mono for tabular numerals.
- **BREAKING (visual-only, no API change):** dark mode is removed. Delete the `.dark { }` block and the `prefers-color-scheme: dark` media query in `globals.css`. `dark:` Tailwind classes scattered through components are left in place (inert without a `.dark` ancestor) — too noisy to strip in this change.
- Refresh shadcn-derived primitives in `components/ui/` (button, card, input, badge, dialog, dropdown-menu, alert, separator, label, textarea) — variant tunings only, public APIs preserved. New `accent` variant on button + badge for olive treatments.
- Restyle surface components in `app/_components/` (home/*, cart/*, product/*, header/*) to pick up the new tokens — typography, hover lift, focus rings, hit-target sizing — without changing layout, grid, or breakpoints.
- Polish loading / empty / error states: warm skeletons, consistent typographic pattern across all error boundaries (`account/error.tsx`, `checkout/error.tsx`, `search/error.tsx`, `not-found.tsx`, `products/[id]/not-found.tsx`).
- **Intentional (not drive-by) accessibility fixes** bundled in: heading hierarchy in `home/category-strip.tsx` (jumps `h2 → h4`), missing accessible name on stars in `product/reviews-section.tsx`, ungrouped quantity-stepper buttons in `cart/cart-item.tsx`, focus rings on the wishlist heart and free-shipping bar, 40 × 40 CSS px hit targets on header icons (currently 32 px). Surfaced explicitly in the audit because they would otherwise be invisible after the visual changes ship.
- Add `scripts/check-contrast.ts` (uses `tsx`, already a devDep — no new package) that verifies every committed token pair meets WCAG AA. Failing pair → exit 1 → blocks merge.

## Capabilities

### New Capabilities
- `visual-design-system`: token contract (color, typography, radius, shadow, motion), shared variant contract for shadcn-derived primitives (`button`, `badge`, `card`, `dialog`, `input`), focus-visible behavior, and the `prefers-reduced-motion` fallback contract. Seeds `openspec/specs/visual-design-system/spec.md`.

### Modified Capabilities
<!-- None — `openspec/specs/` is currently empty; this change introduces the first capability. -->

## Impact

- **Files touched:** `app/globals.css`, `app/layout.tsx`, every file under `components/ui/`, every file under `app/_components/{home,cart,product,header,shared}/`, all `loading.tsx` and `error.tsx` in `app/`, plus `not-found.tsx` and `products/[id]/not-found.tsx`.
- **New file:** `scripts/check-contrast.ts` (one-shot Node script via `tsx`).
- **Dependencies:** none added. Inter and Fraunces are loaded via the existing `next/font/google` integration. `tw-animate-css` stays — `dialog.tsx` overrides its default keyframes locally so `--duration-slow` + the warm overlay take precedence.
- **APIs:** no public-facing API changes (no route, no server action, no schema, no UI primitive prop or variant rename).
- **Visual contract:** mockups produced during brainstorming are persisted in `.superpowers/brainstorm/` and serve as the visual reference if the implementation drifts.
- **Performance:** Fraunces variable adds ~30 KB gzipped; offset by `display: swap`, latin-only subset, axis-subset (`opsz` + `wght`). Lighthouse mobile score expected within 2 points of the `develop` baseline.
- **Out of scope:** new pages, layout/grid changes, dark-mode replacement palette, screen-reader landmark restructuring, axe-core CI integration, skip-to-content link, animated illustrations, brand-asset refresh, WhatsApp float button (brand green non-negotiable).
