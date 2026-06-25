## Why

Dressing Bear products can't yet be effectively promoted or sold through Facebook and Instagram: there is no Meta Pixel (so ads can't be optimized or attributed), shared product links show weak previews with no price, there are no share buttons, and nothing for Meta Commerce Manager / Facebook Shop to ingest. Adding standard social-commerce plumbing unlocks paid social advertising and a synced catalog without disturbing the existing checkout.

## What Changes

- Add an **env-gated browser Meta Pixel** (`NEXT_PUBLIC_META_PIXEL_ID`) that fires `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, and `Purchase`. When the env var is unset, no Pixel loads and the site behaves exactly as today.
- Fire **Purchase** correctly across both payment paths: COD (inline success in `CheckoutClient`) and online (PayHere/Koko/MintPay return to `/checkout/success`), deduplicated by order id via a shared `localStorage` guard so refresh/back-nav never double-counts.
- Enrich **shared-link previews**: Open Graph tags with the price folded into the title (`Name — LKR 1,990`), absolute image URLs, plus `Product` JSON-LD (with `Offer` and `AggregateRating`).
- Add **share buttons** on the product page: native Web Share sheet (exposes Instagram/Messenger on mobile) + explicit Facebook, WhatsApp, and Copy-link buttons.
- Add a **CSV catalog feed** at `/feed/meta-catalog.csv` for Meta Commerce Manager / Facebook Shop, with Meta's inverted on-sale price mapping, archived exclusion, and `availability` from stock.
- Enforce the invariant **`content_ids` (Pixel) == feed `id` == `product.id`** so dynamic retargeting and catalog matching stay aligned.
- Document `NEXT_PUBLIC_META_PIXEL_ID` and the feed URL in `README.md`.

Non-goals (explicit guardrails): no server-side Conversions API, no cookie-consent banner, no DB schema changes, no payment provider changes, no courier flow changes, and no Server Action changes unless strictly needed.

## Capabilities

### New Capabilities

- `meta-pixel-tracking`: Browser Meta Pixel base script and the funnel-event tracking model (PageView, ViewContent, AddToCart, InitiateCheckout, Purchase), including env-gating/no-op behavior, the COD-inline + online-success Purchase firing points, and order-id dedupe.
- `social-sharing`: Product-page share buttons (native + Facebook/WhatsApp/Copy-link) and rich shared-link previews via enriched Open Graph tags (price-in-title) and `Product` JSON-LD structured data.
- `product-catalog-feed`: Public CSV catalog feed at `/feed/meta-catalog.csv` for Meta Commerce Manager / Facebook Shop, with price/sale/availability mapping and the shared product-id invariant.

### Modified Capabilities

<!-- None — this change is purely additive; no existing spec requirements change. -->

## Impact

- **New code:** `app/_lib/absolute-url.ts`, `app/_lib/meta-pixel.ts`, `app/_lib/meta-feed.ts`, `app/_components/analytics/meta-pixel-script.tsx`, `app/_components/product/share-buttons.tsx`, `app/_components/product/product-jsonld.tsx`, `app/checkout/success/track-purchase.tsx`, `app/feed/meta-catalog.csv/route.ts`.
- **Modified code (additive):** `app/layout.tsx` (mount Pixel script), `app/products/[id]/page.tsx` (OG/JSON-LD), `app/_components/product/buy-box-client.tsx`, `app/_components/cart/add-to-cart-button.tsx`, `app/_components/cart/add-to-cart-dialog.tsx`, `app/checkout/checkout-client.tsx` (InitiateCheckout + COD Purchase), `app/checkout/success/page.tsx` (render `<TrackPurchase>`), `README.md`.
- **Config:** new optional env var `NEXT_PUBLIC_META_PIXEL_ID`; existing `APP_URL` reused for absolute URLs.
- **External:** Meta Commerce Manager scheduled feed pulls `<APP_URL>/feed/meta-catalog.csv`; Facebook/Instagram ad attribution via the Pixel.
- **Unchanged:** Prisma schema, payment providers, courier (Royal Express / Curfox) flow, and Server Actions (`app/checkout/actions.ts`). Existing checkout/order e2e tests must stay green.
- **Reference:** design spec `docs/superpowers/specs/2026-06-26-social-commerce-meta-integration-design.md` and implementation plan `docs/superpowers/plans/2026-06-26-social-commerce-meta-integration.md`.
