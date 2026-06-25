## Context

Dressing Bear (Next.js 16 App Router, Prisma/PostgreSQL, NextAuth v5) has a working catalog, cart, and multi-provider checkout (COD + PayHere/Koko/MintPay) plus a Royal Express/Curfox courier flow. It has no Meta Pixel, weak Open Graph tags, no share buttons, and no product feed. This change adds standard social-commerce plumbing so products can be advertised and sold via Facebook/Instagram — additively, without touching the order, payment, or courier logic.

The authoritative, line-level design is `docs/superpowers/specs/2026-06-26-social-commerce-meta-integration-design.md`, and the task-by-task plan is `docs/superpowers/plans/2026-06-26-social-commerce-meta-integration.md`. This document summarizes the decisions and risks.

## Goals / Non-Goals

**Goals:**

- Browser Meta Pixel firing PageView, ViewContent, AddToCart, InitiateCheckout, Purchase — env-gated and no-op when `NEXT_PUBLIC_META_PIXEL_ID` is unset.
- Correct, deduplicated Purchase across both COD (inline success) and online (success page) paths.
- Rich shared-link previews (OG price-in-title + Product JSON-LD) and product-page share buttons (native + Facebook/WhatsApp/Copy-link).
- A CSV catalog feed at `/feed/meta-catalog.csv` for Meta Commerce Manager.
- Maintain the invariant `content_ids == feed id == product.id`.

**Non-Goals:**

- No server-side Conversions API (CAPI) — browser Pixel only.
- No cookie-consent banner.
- No DB schema, payment provider, or courier changes; no Server Action changes unless strictly needed.
- No product-page redesign (targeted mobile/share polish only).

## Decisions

- **Browser Pixel only, env-gated via a single module.** `app/_lib/meta-pixel.ts` is the only place that reads `NEXT_PUBLIC_META_PIXEL_ID` and touches `window.fbq`; all components call typed helpers. Chosen over per-component env reads (scattered, error-prone) and over CAPI (server work, out of scope). No-op behavior is guaranteed because `window.fbq` only exists when the base script loads, which only happens when the env var is set.

- **Purchase fires from two client surfaces, deduped by a shared helper.** COD never navigates to `/checkout/success` — `CheckoutClient` renders an inline success view and clears the cart — so COD Purchase fires there (capturing content_ids/value before `clearCart()`). Online payments return to `/checkout/success`, where a `<TrackPurchase>` leaf (mirroring the existing `ClearCartOnPaid`) fires after the existing `PaymentStatusPoll` `router.refresh()` flips the order to confirmed. Both call `trackPurchaseOnce(orderId, value, contentIds)`, which dedupes by order id in `localStorage` and passes `eventID`. Chosen over instrumenting the cart reducer or the Server Action (would over-fire / would change server code).

- **Price in the OG title.** Standard link cards have no price slot, so the price is folded into the title (`Name — LKR 1,990`) using the existing `formatPrice`. Product JSON-LD additionally carries structured price/availability/rating for Google/Pinterest.

- **Native Web Share + explicit buttons; no Instagram button.** Instagram has no web share-link URL, so IG is reached only via the native sheet on mobile; explicit Facebook/WhatsApp/Copy-link cover all devices. Copy feedback is an inline "Copied" state (no `sonner` toast — the storefront layout has no Toaster and adding one would double up with the admin Toaster).

- **CSV feed via a Route Handler + pure mapping module.** `app/_lib/meta-feed.ts` holds pure `productToFeedRow`/`feedRowsToCsv` (unit-tested for the inverted on-sale price mapping, availability, archived exclusion, CSV escaping); `app/feed/meta-catalog.csv/route.ts` (Node runtime) queries Prisma and serves cached CSV. CSV chosen over XML for simplicity; Meta accepts both.

- **Shared `absoluteUrl()` helper.** One source of truth for canonical absolute URLs across OG images, JSON-LD, share URLs, and feed links, so they never diverge.

## Risks / Trade-offs

- **Purchase double-counting** → dedupe by order id in `localStorage` + `eventID` + confirmed-only gate; both firing points share the one helper.
- **Purchase missed for online payments** (confirmation arrives after first render) → fire from a client leaf nested in the poll-refreshed server subtree, not from server-rendered initial state.
- **Purchase missed for COD** (never hits the success page) → fire from the `CheckoutClient` inline success, capturing data before the cart is cleared.
- **content_ids / feed id / sku drift** breaking dynamic retargeting → single `product.id` source enforced by unit tests and an e2e assertion on JSON-LD `sku`.
- **Pixel script breaking the page** → all `fbq` calls guarded by `window.fbq` existence and wrapped in try/catch.
- **Feed DB load from frequent Meta polls** → route-level `revalidate` caching + `s-maxage` headers.
- **Browser Pixel coverage loss** (ad-blockers/iOS) accepted as a known trade-off of the browser-only decision; CAPI remains a future option.

## Migration Plan

- Purely additive; deploy with `NEXT_PUBLIC_META_PIXEL_ID` unset first (zero behavior change), then set the env var in the target environment to activate tracking.
- Set `APP_URL` to the public origin so absolute URLs are correct, then register `<APP_URL>/feed/meta-catalog.csv` as a scheduled feed in Meta Commerce Manager.
- Rollback: unset `NEXT_PUBLIC_META_PIXEL_ID` (disables Pixel instantly) and/or revert the additive commits; no data migration is involved.

## Open Questions

- None blocking. Future considerations (not in scope): server-side Conversions API for higher attribution accuracy, and cookie-consent gating if EU traffic becomes material.
