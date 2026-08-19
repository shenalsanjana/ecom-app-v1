> Step-by-step code, test bodies, and exact verification commands for every task
> below live in `docs/superpowers/plans/2026-08-19-home-conversion-refresh.md`.
> The numbering here matches that plan's Task numbers.

## 1. Foundation — brand token and pure modules

These five are independent of one another and may be worked in parallel.

- [x] 1.1 Retune `--brand`, `--ring`, `--chart-1` and `--sidebar-ring` to `oklch(0.55 0.08 52)` in `app/globals.css`, updating the stale "boutique olive" comment, and confirm `npm run check:contrast` passes (Plan Task 1)
- [x] 1.2 Register the `marquee` keyframes and the `--animate-marquee` theme token in `app/globals.css`, mirroring the existing `wishlist-fill` pattern (Plan Task 1)
- [x] 1.3 Extract pure `excludedMethodNamesFor(kokoEnabled)` / `freeDeliveryExclusionNoteFor(kokoEnabled)` in `app/_lib/free-delivery-note.ts` and have the existing zero-arg functions delegate, keeping the env read a literal (Plan Task 2)
- [x] 1.4 Add `app/_lib/marquee.ts` with `marqueeMessages(freeThreshold, kokoEnabled)` and its test, covering both threshold branches and both Koko states (Plan Task 2)
- [x] 1.5 Add `app/_lib/category-tint.ts` with `tintForSlug`, `relativeLuminance` and `inkFor`, plus a test asserting the unknown-slug fallback is deterministic and every tint clears AA 4.5:1 (Plan Task 6)
- [x] 1.6 Add `app/_lib/countdown.ts` with `msUntilEndOfDay` and `formatCountdown`, plus a test covering padding, truncation, the day boundary, and negative clamping (Plan Task 8)
- [x] 1.7 Add `app/_lib/product-signals.ts` with `unitsForVariant`, `lowStockSignal` and `pickBestsellers`, plus a test covering the two-pool stock cap, the zero-units silence, and deterministic tie-breaking (Plan Task 10)

## 2. Home page chrome

- [x] 2.1 Rewrite `app/_components/shared/announcement-bar.tsx` as a marquee: one `overflow-hidden` wrapper, a `motion-safe:animate-marquee` track, the message set rendered twice with the second copy `aria-hidden` (Plan Task 3)
- [x] 2.2 Add the hero rating chip and restyle the headline in `app/_components/home/hero.tsx`, wrapping the final word in a brand highlight with `box-decoration-break: clone` (Plan Task 4)
- [x] 2.3 Create `app/_components/home/social-proof.tsx` with its four signals, using 7-day returns in the fourth slot rather than repeating free shipping (Plan Task 5)
- [x] 2.4 Mount `<SocialProof />` in `app/page.tsx` directly after `<Hero />` (Plan Task 5)

## 3. Home page sections

- [x] 3.1 Rewrite `app/_components/home/category-strip.tsx` to render solid tinted tiles with computed ink, removing the now-unused `Image` and `isUploadedImage` imports (Plan Task 7)
- [x] 3.2 Create the `app/_components/home/deals-countdown.tsx` client island, rendering a stable placeholder until `useEffect` starts the timer so hydration matches (Plan Task 9)
- [x] 3.3 Restyle `app/_components/home/deals-section.tsx` as a cocoa band with the `Limited time` eyebrow, enlarged heading and mounted countdown, keeping the section an async server component (Plan Task 9)

## 4. Card signals

- [x] 4.1 Add optional `badge?: "Bestseller"` and `lowStock?: number` to `ProductView` in `app/_lib/products.ts` (Plan Task 11)
- [x] 4.2 Add the `withSignals` option to `attachAggregates`, including the paid-orders `groupBy`, and attach both derived signals to the returned view (Plan Task 11)
- [x] 4.3 Pass `{ withSignals: true }` from `getFeaturedProducts` and `getDealsProducts` only, leaving the other six call sites untouched, and verify the diff contains exactly two such call sites (Plan Task 11)
- [x] 4.4 Render the badge pill and low-stock nudge in `app/_components/home/product-card.tsx`, placing the pill bottom-left so it clears `SaleBadge` and `WishlistHeart` (Plan Task 12)
- [x] 4.5 Confirm in the running app that the signals appear on the home page and do **not** appear on `/search`, `/categories` or `/wishlist` (Plan Task 12)

## 5. Validation

- [x] 5.1 Run `npm run check:contrast`, `npx tsc --noEmit`, `npm run lint` and `npm run test`; record actual output (Plan Task 13)
- [x] 5.2 Run `npm run build` and `npm run test:e2e`; if `DATABASE_URL` is unreachable, record them as blocked-environmental rather than passed (Plan Task 13)
- [x] 5.3 Diff against `main` and confirm only the twenty expected paths changed — in particular that `trust-strip.tsx`, `prisma/`, `app/checkout/`, `app/cart/` and `app/admin/` are untouched (Plan Task 13)
- [x] 5.4 Update the `home-conversion-refresh` row in `STUB_READINESS_STATUS.md` with real column values and validation results (Plan Task 13)
