## 1. Tokens & font loading

- [x] 1.1 Update `app/globals.css` `:root` block with the boutique color tokens, `--radius: 1rem`, `--shadow-card-token`. Motion tokens added in `@theme inline` per 1.4.
- [x] 1.2 Removed `.dark { }` and the `@media (prefers-color-scheme: dark) { :root:not(.light) { ... } }` block. Kept `@custom-variant dark (&:is(.dark *));` so leftover `dark:*` utility classes stay inert (no `.dark` ancestor) instead of activating on system preference.
- [x] 1.3 Inter + Fraunces (variable, `axes: ['opsz']`, `display: 'swap'`, `latin` subset) wired in `app/layout.tsx` via `next/font/google`. Geist Mono retained for tabular numerals. All three `.variable` classes applied to `<html>`.
- [x] 1.4 `@theme inline { }` exposes `--font-sans: var(--font-inter)`, `--font-heading: var(--font-fraunces)`, plus motion tokens and `--shadow-card`. (Build verification of `font-heading` utility deferred to 5.7 typecheck/lint pass; Tailwind v4 compiles theme tokens at build.)

## 2. UI primitives

- [ ] 2.1 Refactor `components/ui/button.tsx`: `default` variant → cocoa-cream (`bg-primary text-primary-foreground`); bump `default` and `lg` sizes to `h-9` minimum; add new `accent` variant (`bg-accent text-accent-foreground` with olive focus ring). Variant names and prop API preserved.
- [ ] 2.2 Refactor `components/ui/card.tsx`: default radius → `rounded-2xl`, hover-only `--shadow-card` lift (no shadow at rest), `--border` for hairlines.
- [ ] 2.3 Refactor `components/ui/dialog.tsx`: panel `rounded-2xl`; overlay color → `oklch(0.235 0.018 60 / 0.5)` (warm cocoa wash, replacing `black/80`); override `data-[state=open]` and `data-[state=closed]` keyframes locally so `--duration-slow` and the warm overlay take precedence over `tw-animate-css` defaults.
- [ ] 2.4 Refactor `components/ui/input.tsx` and `components/ui/textarea.tsx`: `h-10` (was `h-9`), `--ring` at 50% opacity on `:focus-visible`, `font-sans`. Refactor `components/ui/label.tsx` to inherit tokens.
- [ ] 2.5 Refactor `components/ui/badge.tsx`: pill (`rounded-full`), new `accent` variant (olive bg + cream text), warmed `destructive`. Refactor `components/ui/dropdown-menu.tsx`, `components/ui/alert.tsx`, `components/ui/separator.tsx` to inherit tokens (no per-component code change beyond removing hardcoded class strings if any).

## 3. Surface components — home, header, footer

- [ ] 3.1 Refactor `app/_components/home/product-card.tsx`: image backdrop → `bg-muted` (replace `from-zinc-100 to-zinc-200`); product name → `font-heading`; on-sale price → `font-heading text-accent`; wishlist heart fills with olive when active; hover lift inherits from `Card`.
- [ ] 3.2 Refactor `app/_components/home/hero.tsx`: heading → `font-heading`; both CTAs → cocoa pill (`Button` `default` variant with `rounded-full`).
- [ ] 3.3 Refactor `app/_components/home/site-header.tsx`: cream bg, cocoa ink, olive `underline-offset-4 hover:underline` on nav links, olive pill cart-count badge.
- [ ] 3.4 Refactor `app/_components/home/site-footer.tsx`: warm-neutral fills, structure unchanged.
- [ ] 3.5 Refactor `app/_components/home/category-strip.tsx`: section heading → `font-heading`; FIX heading hierarchy (currently `h2 → h4`; correct to `h2 → h3` or restructure semantically). Document the heading-level decision inline.
- [ ] 3.6 Refactor `app/_components/home/deals-section.tsx` and `app/_components/home/newsletter.tsx`: typographic restyle only — section headings → `font-heading`, body `font-sans`, CTAs use new button variants.

## 4. Surface components — cart, product, header icons

- [ ] 4.1 Refactor `app/_components/cart/free-shipping-progress.tsx`: track `bg-muted`, fill `bg-accent`; under threshold → muted-foreground copy; near threshold (within 20%) → olive copy; qualified → olive bg pill with cream text. Width transitions `--duration-slow var(--ease-out)`. Cross-fade between state colors.
- [ ] 4.2 Refactor `app/_components/cart/cart-item.tsx`: hairline borders (`--border`); totals → `font-heading`; FIX quantity-stepper buttons by wrapping them in a `role="group"` wrapper with `aria-label="Quantity"`.
- [ ] 4.3 Refactor `app/_components/cart/cart-summary.tsx`: totals → `font-heading`; free-shipping callout → olive (`text-accent`).
- [ ] 4.4 Refactor `app/_components/cart/add-to-cart-dialog.tsx` and `app/_components/cart/quick-buy-buttons.tsx`: pick up new dialog overlay/radius; size-picker buttons get `--ring` (olive) when selected.
- [ ] 4.5 Refactor `app/_components/product/buy-box.tsx` and `app/_components/product/buy-box-client.tsx`: price → `font-heading`; size-picker selected state → olive ring + cream fill (with copy showing the selected size — color is not the only signifier).
- [ ] 4.6 Refactor `app/_components/product/breadcrumb.tsx`: olive `underline-offset-4 hover:underline` on links; current item uses `font-sans` (no underline).
- [ ] 4.7 Refactor `app/_components/product/image-gallery.tsx`, `app/_components/product/related-strip.tsx`, `app/_components/product/description.tsx`, and `app/_components/product/size-chart-dialog.tsx`: section titles → `font-heading`; tokens flow through.
- [ ] 4.8 Refactor `app/_components/product/reviews-section.tsx`: section title → `font-heading`; FIX star rating accessibility — add `aria-label="Rating: X out of 5"` (or equivalent) to the rating element so screen readers announce it.
- [ ] 4.9 Refactor `app/_components/header/profile-menu.tsx`, `app/_components/header/cart-icon.tsx`, `app/_components/header/cart-icon-wrapper.tsx`, and `app/_components/header/wishlist-icon.tsx`: bump hit targets to `h-10 w-10` (40px); olive count badges; visible focus ring with `--ring`.
- [ ] 4.10 Confirm `app/_components/whatsapp-float-button.tsx` is left visually unchanged (brand green stays); verify focus ring uses `--ring` at 50% opacity (token-driven, not hardcoded).
- [ ] 4.11 Grep-and-convert pass across `app/`: replace stray `bg-zinc-*`, `text-zinc-*`, `border-zinc-*`, `from-zinc-*`, `to-zinc-*`, `text-gray-*`, `bg-gray-*`, `border-gray-*` Tailwind utility classes with token-based equivalents (`bg-muted`, `text-muted-foreground`, `border`, etc.). Exclude `whatsapp-float-button.tsx` per 4.10.

## 5. States, a11y audit, verification

- [ ] 5.1 Tune `app/_components/shared/product-grid-skeleton.tsx`: tile color → `bg-muted` (warm); shimmer `opacity: 0.6`, cycle `2s`. Verify it complies with `prefers-reduced-motion: reduce` (shimmer becomes static).
- [ ] 5.2 Audit every `loading.tsx` (`app/cart/`, `app/categories/[slug]/`, `app/account/orders/`, `app/deals/`, `app/search/`, `app/wishlist/`) — confirm each renders `ProductGridSkeleton` or a domain-equivalent skeleton. No naked spinners.
- [ ] 5.3 Restyle every error boundary on customer surfaces (`app/account/error.tsx`, `app/checkout/error.tsx`, `app/search/error.tsx`, `app/not-found.tsx`, `app/products/[id]/not-found.tsx`) to the consistent typographic pattern: `font-heading` headline + one-line plain-language explanation + single olive-pill CTA returning to a useful surface. No new illustrations.
- [ ] 5.4 Author `scripts/check-contrast.ts`: takes the tokens from `globals.css`, parses the OKLCH values, converts to sRGB, computes WCAG relative-luminance ratios for the published pairs (foreground-on-background, primary-foreground-on-primary, accent-foreground-on-accent, muted-foreground-on-background, destructive-foreground-on-destructive, ring-on-background), prints PASS/FAIL per pair with the ratio, exits 1 on any failure. Add an `npm run check:contrast` script in `package.json`.
- [ ] 5.5 Run `npm run check:contrast` — every published pair must PASS. Adjust tokens (within the boutique palette) until green.
- [ ] 5.6 Manual a11y pass (record findings in commit body):
    - Verify focus rings on wishlist heart, free-shipping bar (if interactive), and size-picker buttons.
    - Tab through three flows end-to-end: home → category → PDP → cart → checkout; account dropdown open/close; AddToCartDialog open/close (focus trap returns to opener).
    - Measure header icon hit targets in DevTools — confirm ≥ 40 × 40 CSS px.
    - Verify form labels in `(auth)/forgot-password`, `(auth)/reset-password`, `account/profile-form.tsx`, `account/address-form.tsx` (every input has an associated `<Label>` or `aria-label`).
    - Toggle `prefers-reduced-motion: reduce` in DevTools → Rendering; verify card hover lift, dialog enter, and free-shipping bar fill all suppress transforms/dimensions while keeping color/opacity changes.
- [ ] 5.7 Run typecheck (`npx tsc --noEmit`) and lint (`npm run lint`) at the worktree's HEAD; both must pass.
- [ ] 5.8 Run a Lighthouse mobile audit at the worktree's `next start` build (or via `next dev` if necessary) and compare LCP / CLS / TBT against `develop`. Performance score MUST NOT drop more than 2 points; if it does, investigate Fraunces loading strategy.
- [ ] 5.9 Manual smoke test through the full storefront in light mode: home, /categories, a category page, a PDP, /cart, /checkout, /search, /wishlist, /account/* — confirm boutique identity is consistent and no surface looks unfinished or off-palette.
- [ ] 5.10 Run `openspec validate visual-refresh-boutique --strict` — must be green before declaring complete.
