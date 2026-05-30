# UI/UX Boutique Refresh — Design

**Date:** 2026-05-30
**Status:** Approved (visual direction), pending implementation plan
**Author:** brainstormed with visual companion

## Goal

Elevate Dressing Bear's storefront to feel **premium** *and* **convert better** (the two
goals are complementary for fashion). This is an **evolution of the existing "boutique"
design system** — warm cream + cocoa + olive palette, Fraunces headings + Inter body,
shadcn components, existing radius/motion tokens — **not a reinvention**. Light mode only
(dark mode is intentionally dropped; keep it that way).

Visual ambition was validated surface-by-surface in a browser companion; the user approved
"this level" of elevation (refined, calm, editorial — not louder).

## Scope

Seven surfaces, top-to-bottom of the shopper journey, plus cross-cutting "global polish"
rules. Order mirrors the homepage and funnel:

1. Top of page (announcement bar + header + hero)
2. Category strip
3. Product grid + product card
4. Product detail page (gallery + buy box)
5. Cart
6. Checkout
7. Footer + global polish

This is a **visual/UX refresh**. Where a UI change requires data or backend work, it is
called out under "Dependencies & backend impact" — those are the parts that are NOT just CSS.

## Surface-by-surface decisions

### 1. Top of page
- **Announcement bar** (new, above header): free-shipping threshold + "Pay in 3 interest-free
  with Koko & Mintpay". Display-only.
- **Wordmark** in Fraunces (`font-heading`) instead of the plain bold sans logo.
- **Nav** refined: uppercase, letter-spaced, muted→brand hover (keep existing links).
- **Hero**: directional gradient (keeps the image visible vs the current bottom-up black
  gradient), tighter editorial headline, one confident primary CTA + a quieter secondary
  (underline/ghost). Keep the existing image slot and min-heights.

### 2. Category strip
- Replace small **round thumbnails** with larger **editorial tiles**: 3:4 image, category
  name + sub-label over a soft bottom gradient, gentle hover zoom.
- Mobile: 3 large tappable tiles per row.
- Sub-label is optional copy; if no grouping data exists, omit it (see dependencies).

### 3. Product grid + product card
- Keep the responsive grid (2/3/4 cols).
- **Elevated card**: tall **4:5** image (replaces the current short `h-48` landscape crop),
  category eyebrow label, refined Fraunces title, star rating, price (olive `--brand` for
  sale), **colour swatches**, and a **single "Add to cart"** button (replaces the two
  competing Add/Buy-now buttons — user approved single CTA).
- Quieter sale badge (outline/cream chip vs solid), image zoom on hover.
- Section header gets an eyebrow ("Editor's picks") + underlined "View all".

### 4. Product detail page
- Keep two-column layout (gallery `1.6fr` / buy box `1fr`).
- **Buy box additions (these are the conversion fixes):**
  - **Size selector** + "Size guide" link — currently MISSING from the rendered buy box;
    this is the single biggest conversion gap for clothing.
  - **"Pay in 3" BNPL line** under the price: "or 3 interest-free payments of Rs X with
    Koko / Mintpay" (X = total ÷ 3, display-only).
  - **Palette-aligned stock indicator** (olive dot + text) replacing the bright
    red/amber/emerald pills that clash with the theme.
  - Trust row: free shipping / free returns / secure checkout.
  - Quantity stepper (replaces raw `<select>`).
- **Sticky** buy box on desktop; **sticky add-to-cart bar** on mobile.

### 5. Cart
- Keep the **free-shipping progress bar** (already present — good).
- Refined line items: larger thumbnail, size/colour chips, inline qty stepper, quiet Remove.
- **Sticky summary** with the progress bar + a **"Pay in 3"** line + a payment-method
  reassurance row (Koko / Mintpay / Card / COD) before the checkout button.

### 6. Checkout
- **Numbered steps** (1 Contact · 2 Shipping · 3 Payment) on the single page.
- **Payment method tiles** — premium rounded tiles, not emoji:
  - **Koko** and **Mintpay** surfaced first, each with a **"PAY IN 3"** tag and their **real
    brand logo** (user-provided `koko_logo.jpg`, `mintpay_logo.png`).
  - **"Credit / Debit Card"** label replaces the customer-facing brand name "PayHere"
    (subtext "Visa · Mastercard · Amex — secure"; PayHere remains the processor behind it).
  - **Cash on Delivery**.
  - Clean line/SVG icons for Card & COD; selected state in cocoa (`--primary`), not blue.
- **Contact fields:** two phone numbers — **Mobile (required)** + **Alternate mobile
  (optional)**. **Email is optional** (per user; see note below).
- **Standard required-field convention:** red asterisk on mandatory labels, "(optional)" on
  the rest, and a "* Required field" legend. Required: Mobile, Full name, Address line 1,
  City, Country. Optional: Email, Alternate mobile, Address line 2.
- **Order-confirmed screen** restyled from bright green (`green-100/600`) to the
  olive/cocoa palette.
- Summary with item thumbnails + BNPL line + secure-checkout note.

> **Note on optional email:** with email optional, order confirmations/receipts would rely on
> SMS to the mobile number. Recommended to keep email *recommended* even if not mandatory.
> Flagged to user; left optional per their decision.

### 7. Footer + global polish
- **Footer**: dark cocoa brand band — Fraunces wordmark + tagline + social icons, link
  columns, and a **payment-methods row** (Koko, Mintpay, Visa, Mastercard, COD). **Koko
  wordmark rendered in light pink** on the dark band (per user). Remove the demo line
  ("Built with Next.js. Prices and stock for demonstration only.").
- **Global polish rules (apply everywhere):**
  - **Type scale** — Fraunces headings / Inter body on a consistent eyebrow→H2→body→caption
    scale; stop ad-hoc sizes.
  - **Spacing rhythm** — roomy section padding on an 8-pt grid.
  - **Colour discipline** — cocoa = primary, olive = sale/active/brand, cream = surface.
    Retire stray bright red/amber/green/blue (stock chips, confirm screen, etc.).
  - **Buttons & states** — one primary per view, quiet secondary, consistent
    hover/focus-ring/disabled.
  - **Imagery** — 4:5 product imagery, consistent rounded corners + gentle hover zoom across
    cards, tiles, galleries.
  - **Mobile & a11y** — sticky add-to-cart, ≥44px touch targets, visible focus states,
    proper labels.

## Dependencies & backend impact (NOT just CSS)

These items require more than styling and must be sequenced/scoped in the plan:

1. **Size selector → cart/order.** Product `sizes` exist; selection must flow into
   add-to-cart, the cart line item, and the order. Confirm how size is currently captured
   (the card already passes `sizes`; the buy box must enforce a selection before add).
2. **Second contact number.** "Alternate mobile" needs: a field in the checkout form + the
   `processOrder` action + the order schema/persistence (Prisma migration) + courier/email
   surfaces that show a phone. This is the largest backend touch.
3. **Colour swatches.** Require colour-variant data per product. If the data model has no
   colour variants, swatches are **cut** (or shown only where data exists) — do not fake them.
4. **Category sub-labels / grouping.** Only if category grouping data exists; otherwise omit.
5. **BNPL "Pay in 3" amounts** are display-only (total ÷ 3) — no backend, but only show for
   Koko/Mintpay-eligible totals if a min/max applies.
6. **Logo assets.** `koko_logo.jpg` is a 417 KB white-background JPEG; `mintpay_logo.png` is a
   dark icon. For production, source **trimmed/transparent SVG or PNG** so logos sit cleanly
   on any surface and load fast. Store under `public/`.

## Non-goals
- No change to the cream/cocoa/olive palette identity or the dark-mode decision.
- No re-platforming, no new component library — extend shadcn + existing tokens.
- No checkout flow/logic changes beyond the fields and visual treatment above (payment
  initiation, finalization, Koko/Mintpay/PayHere integration stay as-is).

## Suggested implementation phasing (for the plan)
1. **Global tokens & primitives** — type scale, spacing, button/badge variants, retire stray
   colours. (Foundation everything else builds on.)
2. **Product card** (highest reuse) → grid → category tiles.
3. **Top of page** (announcement bar, header wordmark, hero).
4. **Product page** buy box (incl. size selector — backend touch).
5. **Cart** + **Checkout** (incl. second contact number — backend touch).
6. **Footer** + final global a11y/mobile pass.

This is large enough that the plan may split into more than one implementation pass; the
foundation phase (1) should land first.
