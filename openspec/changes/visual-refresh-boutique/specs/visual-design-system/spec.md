## ADDED Requirements

### Requirement: Color tokens define a single warm palette with WCAG AA contrast across published pairs

The system SHALL expose a single set of color tokens defined in `app/globals.css` `:root` (no `.dark` override, no `prefers-color-scheme: dark` override) using the OKLCH color space. The token set MUST distinguish *brand* color (`--brand`, `--brand-foreground`) from *subtle-hover* color (`--accent`, `--accent-foreground`) — see design.md "Brand vs hover token" decision. Every committed pair drawn from the published list (foreground-on-background, primary-foreground-on-primary, brand-foreground-on-brand, accent-foreground-on-accent, muted-foreground-on-background, destructive-foreground-on-destructive, ring-on-background) MUST meet WCAG AA contrast (≥ 4.5:1 for body text, ≥ 3:1 for large text and non-text UI). The published pairs are validated automatically by `scripts/check-contrast.ts`, which exits with a non-zero status on any failing pair.

#### Scenario: Token contract loaded for every page

- **WHEN** any customer-facing page is rendered
- **THEN** the document inherits exactly one set of CSS custom properties for `--background`, `--foreground`, `--card`, `--card-foreground`, `--muted`, `--muted-foreground`, `--border`, `--primary`, `--primary-foreground`, `--brand`, `--brand-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--destructive-foreground`, and `--ring` from `:root`
- **AND** no `.dark` block, no `prefers-color-scheme: dark` block, and no inline-style override redefines those tokens

#### Scenario: Contrast audit blocks merge

- **WHEN** a developer runs `npx tsx scripts/check-contrast.ts`
- **THEN** the script computes WCAG relative-luminance ratios for every published pair
- **AND** prints `PASS` or `FAIL` per pair with the computed ratio
- **AND** exits with code 0 only if every pair meets its threshold (4.5:1 for body, 3:1 for large or UI), otherwise exits with code 1

### Requirement: Typography uses Inter for body/UI and Fraunces (variable, optical sizing) for headings, prices, and product names

The system SHALL load Inter and Fraunces via `next/font/google` from `app/layout.tsx`, both with `display: 'swap'` and `subsets: ['latin']`. Fraunces MUST subset its variable axes to `opsz` (with `wght` implicit). The CSS variables `--font-inter` and `--font-fraunces` MUST be applied to `<html>` so that they are inherited globally. The `@theme inline { }` block in `app/globals.css` MUST expose `--font-sans: var(--font-inter)` and `--font-heading: var(--font-fraunces)` so that Tailwind utilities (`font-sans`, `font-heading`) compile and resolve.

#### Scenario: font-heading utility resolves at build

- **WHEN** Tailwind compiles a class name `font-heading` used on any component
- **THEN** the generated CSS includes `font-family: var(--font-heading)`
- **AND** at runtime that resolves to the Fraunces variable font face

#### Scenario: Fraunces optical sizing applied at display sizes

- **WHEN** a heading element uses `font-heading` at a font-size ≥ 24px
- **THEN** Fraunces renders with `font-variation-settings` allowing `opsz` to track display optical sizing
- **AND** at smaller sizes (e.g., product card prices) the same family renders without character-shape artifacts that compromise legibility

### Requirement: Motion tokens drive a fixed set of subtle micro-interactions and respect prefers-reduced-motion

The system SHALL expose four motion tokens in `app/globals.css`: `--ease-out: cubic-bezier(0.22, 0.61, 0.36, 1)`, `--duration-fast: 150ms`, `--duration-base: 200ms`, `--duration-slow: 320ms`. Six named interactions MUST consume these tokens and no other timing value: (1) card hover lift, (2) button hover-color and press, (3) wishlist heart fill, (4) dialog enter/exit, (5) free-shipping bar fill and state-color cross-fade, (6) skeleton shimmer. Every animation that uses `transform` or width/height transitions MUST be wrapped in `@media (prefers-reduced-motion: no-preference)`; the reduced-motion fallback MUST keep color and opacity changes instant and remove transforms and dimensional transitions entirely.

#### Scenario: Card hover lift respects motion preference

- **WHEN** a user hovers a `ProductCard` (or any `Card` with an `[href]`) and `prefers-reduced-motion: no-preference` is in effect
- **THEN** the card translates `-2px` on the Y axis and gains `--shadow-card`, transitioning over `--duration-base` with `--ease-out`

#### Scenario: Reduced motion suppresses transforms

- **WHEN** the same hover happens with `prefers-reduced-motion: reduce` in effect
- **THEN** the card does NOT translate
- **AND** does NOT animate its shadow over time
- **AND** any color or opacity feedback (e.g., border tint) still applies, instantly

#### Scenario: Free-shipping bar transitions both width and state

- **WHEN** the cart total changes such that the free-shipping progress bar's fill width or threshold-state changes
- **THEN** the fill width transitions over `--duration-slow` with `--ease-out`
- **AND** the state-color transitions via cross-fade between the two state colors over the same duration
- **AND** under reduced motion, the width snaps to its new value instantly while colors still cross-fade by opacity only

### Requirement: UI primitive variants preserve their public API and add a `brand` variant on Button and Badge

Refactors to `components/ui/button.tsx`, `components/ui/card.tsx`, `components/ui/input.tsx`, `components/ui/badge.tsx`, `components/ui/dialog.tsx`, `components/ui/dropdown-menu.tsx`, `components/ui/alert.tsx`, `components/ui/separator.tsx`, `components/ui/label.tsx`, and `components/ui/textarea.tsx` SHALL NOT remove or rename existing variants or props. New `brand` variants MUST be added to `Button` (olive `--brand` background + cream `--brand-foreground` text + olive focus ring) and to `Badge` (pill, olive `--brand` background, cream `--brand-foreground` text), suitable for olive-led promotional surfaces (sale badges, secondary CTAs). The pre-existing `accent` variant on dropdown-menu items and shadcn-derived hover/focus states uses the *subtle hover* `--accent` token (warm muted-darker), NOT the brand olive — see design.md "Brand vs hover token" decision.

#### Scenario: Existing variant usages still compile and render

- **WHEN** a consumer renders `<Button variant="destructive">` or `<Button variant="outline">` or `<Badge variant="secondary">` (or any other previously-exposed variant)
- **THEN** the component compiles and renders without changes to its prop signature
- **AND** uses the new boutique tokens for its visual treatment

#### Scenario: New brand variant available

- **WHEN** a consumer renders `<Button variant="brand">` or `<Badge variant="brand">`
- **THEN** the rendered element uses the olive `--brand` background and cream `--brand-foreground` text
- **AND** the focus-visible ring uses `--ring` (olive)

#### Scenario: Existing `bg-accent` / `hover:bg-accent` consumers stay subtle

- **WHEN** any pre-existing consumer (dropdown-menu item, error-page CTA, category pagination, search filter) renders with `bg-accent` or `hover:bg-accent` after the token swap
- **THEN** the rendered element uses warm muted-darker `--accent` (NOT olive) and cocoa `--accent-foreground` text
- **AND** does not produce a saturated olive flash on hover or focus

### Requirement: Every interactive element has a visible focus ring using the `--ring` token

Every focusable element on a customer surface — buttons, links, inputs, textareas, custom-button wrappers (e.g., the wishlist heart on `ProductCard`, size-picker buttons in `BuyBoxClient`, the free-shipping progress's interactive label if any) — MUST display a visible `:focus-visible` ring using `--ring` at 50% opacity, with at least a 3px outline-offset. Mouse-only focus (without keyboard activation) SHALL NOT show the ring (`:focus` without `:focus-visible` does not trigger). Custom buttons that opt out of the default browser outline MUST opt in to a Tailwind `focus-visible:ring-*` treatment using the new tokens.

#### Scenario: Wishlist heart shows focus ring on tab

- **WHEN** a user tabs to the wishlist heart button on a `ProductCard`
- **THEN** an olive ring at 50% opacity appears around the button with a 3px outline-offset

#### Scenario: Mouse click does not show focus ring

- **WHEN** a user clicks the same button with a pointing device
- **THEN** no focus ring appears (the browser distinguishes `:focus-visible` from `:focus`)

### Requirement: Touch hit targets are at least 40 × 40 CSS pixels on header and overlay surfaces

Header icon buttons (`profile-menu`, `cart-icon`, `wishlist-icon`), cart-item quantity steppers, and dialog close affordances MUST present a minimum hit target of 40 × 40 CSS pixels even when the visible glyph is smaller. The component implementation MAY use `padding`, explicit `h-10 w-10`, or an enlarged invisible touch zone to achieve the minimum.

#### Scenario: Header icons measure ≥ 40 × 40 px

- **WHEN** the storefront is loaded at a viewport with `device-pixel-ratio: 1`
- **THEN** each header icon's interactive bounding box (as seen by the pointer event hit-test, e.g., via `getBoundingClientRect()`) measures at least 40px in both width and height

### Requirement: Color is never the sole conveyor of state on customer surfaces

Sale badges MUST include both olive bg AND a percentage or "SALE" text label. Free-shipping progress states MUST include both color AND copy ("$X to free shipping" / "Free shipping unlocked"). Error states (validation, error boundaries, destructive confirmation) MUST include both warmed-red color AND an icon + copy explanation. Quantity steppers MUST visually indicate disabled state with both reduced opacity AND a removed cursor pointer (`cursor: not-allowed`).

#### Scenario: Sale badge has both color and text

- **WHEN** a `ProductCard` renders for a product with `originalPrice > price`
- **THEN** a badge appears with both olive background AND visible discount text (e.g., `−25%`)

#### Scenario: Free-shipping qualified state visible without color

- **WHEN** a user has reached the free-shipping threshold AND views the cart with a CSS rule that simulates achromatopsia (or a screen-reader)
- **THEN** the qualified state is still recognizable from copy alone (e.g., "Free shipping unlocked")

### Requirement: Loading and error states use a consistent, token-driven typographic pattern

`shared/product-grid-skeleton.tsx` MUST tile `bg-muted` blocks (warm) with shimmer at `opacity: 0.6` and a 2s cycle. Every `loading.tsx` route file MUST render a skeleton (no naked spinners). Every error boundary on customer surfaces (`account/error.tsx`, `checkout/error.tsx`, `search/error.tsx`, `not-found.tsx`, `products/[id]/not-found.tsx`) MUST follow the pattern: `font-heading` headline + one-line plain-language explanation + a single olive-pill CTA returning the user to a useful surface. No new illustrations or images are introduced.

#### Scenario: Loading state shows skeleton

- **WHEN** any customer route's `loading.tsx` is rendered
- **THEN** the page shows a `ProductGridSkeleton` (or domain-equivalent skeleton)
- **AND** does not show a circular spinner, dots, or any other non-skeleton loading affordance

#### Scenario: Error boundary follows pattern

- **WHEN** an error boundary on a customer surface renders due to a thrown error or 404
- **THEN** the visible content consists of: one heading in `font-heading`, one explanatory paragraph in `font-sans`, one button using the `accent` variant linking back to a useful surface
- **AND** the page background uses `--background` and the heading uses `--foreground`
