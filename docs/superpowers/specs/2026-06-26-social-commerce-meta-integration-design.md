# Social Commerce & Meta Integration

**Date:** 2026-06-26
**Status:** Approved design

## Problem

Dressing Bear products cannot yet be promoted or sold effectively through Facebook
and Instagram. Specifically:

- **No share affordance** on product pages — customers can't easily share a product
  to Facebook, WhatsApp, or via their device's native share sheet.
- **Weak shared-link previews** — the product page emits only minimal Open Graph
  tags. Shared links don't reliably show the price, and there is no structured data
  for Google/Meta to read.
- **No ad attribution** — there is no Meta Pixel, so Facebook/Instagram ads can't be
  optimized or attributed against on-site behaviour (product views, add-to-cart,
  checkout, purchase).
- **No product catalog feed** — there is nothing for Meta Commerce Manager / Facebook
  Shop to ingest, so the catalog can't stay in sync with the live store.

## Goal

Make products ready to promote and sell on Facebook/Instagram **without changing the
existing checkout, payment, courier, or order flow**. Every change is additive: new
components, new client-side tracking calls, a new feed route, and richer meta tags.

## Non-goals / scope guardrails

- **No payment provider changes** (PayHere / Koko / MintPay / COD untouched).
- **No Server Action changes** unless strictly needed.
- **No DB schema changes.**
- **No courier (Royal Express / Curfox) flow changes.**
- **No server-side Conversions API (CAPI)** — browser Pixel only for this change.
- **No cookie-consent banner** — the Pixel loads unconditionally when configured.
  (Consent gating is a deliberate future add, not part of this change.)
- **Existing checkout/order e2e tests must stay green.**

## Key decisions (approved)

1. **Browser Pixel only** — no server/CAPI, no changes to Server Actions.
2. **Auto CSV product feed** Meta pulls on a schedule, **plus JSON-LD** Product schema
   on product pages. (CSV chosen over XML for simplicity for now.)
3. **Share buttons:** native Web Share sheet + explicit Facebook / WhatsApp / Copy-link
   buttons. No dedicated Instagram button (Instagram has no web share-link URL); IG is
   reachable via the native share sheet on mobile.
4. **Config via `NEXT_PUBLIC_META_PIXEL_ID`.** When unset, all Pixel behaviour
   **no-ops** — dev, preview, and CI never pollute ad data and the build never breaks.
   The site behaves **exactly as today** when the variable is absent.
5. **Price in the OG preview is folded into the title** (e.g. `Product Name — LKR 1,990`),
   because standard link cards have no dedicated price slot.
6. **Currency: `LKR`** throughout (Pixel values + feed prices).

## Core invariant

> **`content_ids` (Pixel) == feed `id` == `product.id`** — the same product identifier
> is used in every Pixel event (`ViewContent`, `AddToCart`, `InitiateCheckout`,
> `Purchase`) and as the `id` column in the catalog feed.

If these diverge, Meta's dynamic retargeting / Advantage+ catalog matching silently
breaks and no test or build error will flag it. This invariant is asserted by unit
tests on the feed and by e2e assertions on Pixel payloads.

---

## Design

### 1. Meta Pixel module (`app/_lib/meta-pixel.ts`)

A small client-only module wrapping `window.fbq`:

- `META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID` (read once).
- `isPixelEnabled()` → `true` only when the ID is a non-empty string.
- `track(event, payload?)` → calls `window.fbq('track', event, payload)` **only when
  enabled and `window.fbq` exists**; otherwise a silent no-op. Wrapped in try/catch so
  a Pixel failure can never break the page.
- Typed event names: `'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase'`.
- A typed `ContentPayload` shape: `{ content_ids: string[]; content_type: 'product'; value: number; currency: 'LKR'; num_items?: number; }` (plus `eventID` passed as the 3rd-arg options object where needed).

This module is the **single source of truth** for whether tracking is active. No
component reads the env var directly.

### 2. Base Pixel script (root layout)

In `app/layout.tsx`, add a `<MetaPixelScript />` client component rendered only when
the Pixel ID is set:

- Loads the standard `fbevents.js` base code via **`next/script`** (`strategy="afterInteractive"`).
- Fires the initial `fbq('init', ID)` + `fbq('track', 'PageView')`.
- **App-Router navigation fix:** route changes don't reload the page, so the base
  `PageView` under-counts. A small client hook fires `PageView` on `usePathname()`
  change (skipping the very first render, which the base code already counts).

When the ID is unset, the component renders `null` — no script, no global, identical
to today's behaviour.

### 3. Event firing points

All additive; none change existing control flow.

| Event | Location | Trigger | Payload |
|---|---|---|---|
| `PageView` | root layout + path-change hook | initial load + client navigations | — |
| `ViewContent` | `BuyBoxClient` (`app/_components/product/buy-box-client.tsx`) | `useEffect` on mount, per `productId` | `content_ids:[productId]`, `value:price`, `currency:'LKR'`, `content_type:'product'` |
| `AddToCart` | plain `trackAddToCart(...)` helper called from `AddToCartButton.handleAdd` and `BuyBoxClient.handleBuyNow` | on successful add | `content_ids:[productId]`, `value:price*qty`, `num_items:qty` |
| `InitiateCheckout` | `CheckoutClient` (`app/checkout/checkout-client.tsx`) | `useEffect` on mount when cart non-empty | `content_ids:[...cart ids]`, `value:subtotal`, `num_items:totalItems` |
| `Purchase` (online) | new `<TrackPurchase>` client component nested in `OrderDetails` on `/checkout/success` | only when order confirmed (see below) | `content_ids:[...order item productIds]`, `value:order.total`, `currency:'LKR'`, `eventID:order.id` |
| `Purchase` (COD) | `CheckoutClient` inline success block (`app/checkout/checkout-client.tsx`) | when a COD order is placed (terminal immediately) | `content_ids:[...cart productIds]`, `value:order total`, `currency:'LKR'`, `eventID:order.id` |

**AddToCart placement note:** the two existing call sites (`AddToCartButton` and
`BuyBoxClient`'s Buy Now) both call `addItem`. Rather than instrument the cart reducer
(which also runs for quantity merges and hydration), fire `AddToCart` explicitly at the
two user-initiated add points. This keeps the event semantically "user added to cart",
not "cart state changed".

### 4. Purchase event correctness (highest-risk piece)

The two payment paths reach success **differently** — both must fire `Purchase`, and
both must share one dedupe store:

- **COD** never navigates to `/checkout/success`. `CheckoutClient` renders an inline
  "Order Confirmed!" view (`if (orderId)` block) and clears the cart in `handleSubmit`.
  So COD `Purchase` fires from `CheckoutClient`: capture `contentIds` (cart product ids)
  and `value` (`total`) **before** `clearCart()`, then on the inline-success render call
  the shared `trackPurchaseOnce(orderId, value, contentIds)` helper.
- **Online payments** (PayHere/Koko/MintPay) redirect to the gateway and return to
  `/checkout/success?order_id=...`, so their `Purchase` fires there.

Both call the same `trackPurchaseOnce` helper (in `meta-pixel.ts`) which owns the
localStorage dedupe + `eventID`, so the two firing points can never double-count a
shared order id.

#### Online success page (`<TrackPurchase>`)

The success page (`app/checkout/success/page.tsx`) is **revisitable** (refresh,
back-nav) and, for online payments, starts in an unconfirmed state that flips later via
the existing `PaymentStatusPoll` (which calls `router.refresh()`).

`<TrackPurchase>` mirrors the existing `ClearCartOnPaid` pattern:

- Rendered **inside** the server `OrderDetails` component, receiving props derived
  server-side: `orderId`, `value` (`order.total`), `contentIds` (order item productIds),
  and `confirmed` (= `isPaid || isCod`, computed from the existing `checkoutPaymentState`).
- Fires `Purchase` **only when `confirmed === true`** — never while `isConfirming` or
  `isCancelled`. For PayHere, `confirmed` is false on first render and becomes true after
  the poll triggers `router.refresh()`, which re-renders `OrderDetails` with updated
  props — the component then fires.
- **Dedupe (shared helper):** `trackPurchaseOnce(orderId, value, contentIds)` maintains a
  `localStorage` set of already-fired order ids (key e.g. `db-purchase-tracked`). It fires
  `Purchase` (with `eventID: orderId`) only when the id is not already in the set, then
  records it. Both `<TrackPurchase>` (online) and `CheckoutClient` (COD) call it, so
  repeated visits/refreshes — and the COD-then-revisit-success edge — never double-count.
  Browser Pixel does **not** auto-dedupe, so this guard is required.
- Like `ClearCartOnPaid`, `<TrackPurchase>` returns `null` and is a leaf client component;
  it calls `trackPurchaseOnce` from an effect when `confirmed` is true.

### 5. Shareable link previews — Open Graph + JSON-LD

In `app/products/[id]/page.tsx` `generateMetadata`:

- **Price in the title:** build the OG/page title as `"<name> — LKR <price>"` (using the
  existing price formatter, integer LKR). Standard link cards (FB/WhatsApp) render
  image + title + description only — folding price into the title is the only way it
  shows. On-sale products show the current (sale) price.
- **OpenGraph block:** `type: 'website'` is kept at the layout level; the product page
  sets `openGraph.title`, `openGraph.description` (stripped markdown, trimmed to a
  reasonable length), and `openGraph.images` with explicit `url`, `width`, `height`,
  and `alt`. `metadataBase` (already set in the root layout to `APP_URL`) resolves the
  relative image path to an absolute URL automatically.
- **Twitter card** already `summary_large_image` at layout level; product page inherits.

**JSON-LD Product schema:** a new presentational component
`app/_components/product/product-jsonld.tsx` renders a `<script type="application/ld+json">`
with:

- `@type: 'Product'`, `name`, `image` (absolute), `description`, `sku`/`mpn` = product id,
  `brand: 'Dressing Bear'`.
- `offers`: `@type: 'Offer'`, `price`, `priceCurrency: 'LKR'`, `availability`
  (`InStock`/`OutOfStock` from `stock`), `url` (absolute canonical).
- `aggregateRating` (only when `ratingCount > 0`): `ratingValue: ratingAvg`,
  `reviewCount: ratingCount` — reusing the existing aggregates already loaded by
  `getProductDetail`.

The JSON-LD uses the same absolute URL helper as the feed and share buttons, so all
three agree on canonical URLs.

### 6. Share buttons component (`app/_components/product/share-buttons.tsx`)

Client component, placed in the buy box (inside `BuyBoxClient`'s layout, near the
title/price), receiving `{ productId, name, price }` (or a prebuilt `url` + `title`):

- **Canonical URL:** `${APP_URL}/products/${productId}` via a shared
  `absoluteUrl()` helper (see §8).
- **Native Share** button → `navigator.share({ title, url })` when
  `typeof navigator.share === 'function'`; the button is hidden when unsupported
  (most desktop browsers). This is the IG/Messenger path on mobile.
- **Facebook** → opens `https://www.facebook.com/sharer/sharer.php?u=<url>` in a new tab.
- **WhatsApp** → opens `https://wa.me/?text=<title + url>` (encoded).
- **Copy link** → `navigator.clipboard.writeText(url)` then a transient "Copied!" state
  (reuse existing toast/feedback idiom; ~1.5s like the Add-to-cart button).
- Buttons are icon+label, ≥44px touch targets, keyboard-accessible with `aria-label`s.

### 7. Meta catalog feed (`app/feed/meta-catalog.csv/route.ts`)

A dynamic Route Handler (Node.js runtime — uses Prisma) returning `text/csv`:

- **Columns (Meta catalog schema):**
  `id, title, description, availability, condition, price, sale_price, link, image_link,
  brand, google_product_category, item_group_id`.
- **Rows:** all `Product` where `archived === false`. (Out-of-stock products are still
  included with `availability: out of stock`, per Meta's recommendation, so ad history
  is retained — only archived products are excluded.)
- **Price mapping (Meta's convention is inverted from our model):**
  - Our model: `price` = current price, nullable `originalPrice` = struck-through "was".
  - On sale (`originalPrice != null && originalPrice > price`):
    `price = originalPrice`, `sale_price = price`.
  - Not on sale: `price = price`, `sale_price` empty.
  - Format: `"1990.00 LKR"` (two decimals + space + currency).
- `availability`: `in stock` when `stock > 0`, else `out of stock`.
- `condition`: `new` (constant).
- `link` / `image_link`: absolute URLs via `absoluteUrl()`.
- `brand`: `Dressing Bear`.
- `item_group_id`: `product.id` (sizes are variants of one sellable item; no separate
  variant rows in this iteration — size is not a distinct SKU in our schema).
- `google_product_category`: a sensible apparel constant (e.g. `Apparel & Accessories > Clothing`).
- **CSV safety:** values are quoted and internal quotes escaped (`"` → `""`); newlines in
  descriptions normalized to spaces.
- **Caching:** `export const revalidate = 3600;` (or `dynamic`/cache headers) so Meta's
  scheduled pulls are cheap and don't hammer the DB.
- **Public:** the route is unauthenticated (the data is already public on product pages).

### 8. Shared URL helper (`app/_lib/absolute-url.ts`)

A tiny helper `absoluteUrl(path: string): string` that joins `APP_URL`
(`process.env.APP_URL ?? 'http://localhost:3000'`) with a path, used by the feed,
JSON-LD, and share buttons so canonical URLs are identical everywhere.

### 9. Mobile / social-visitor polish

The product page is already largely responsive (sticky mobile buy bar exists). Targeted
touch-ups only:

- Share buttons: thumb-friendly spacing, ≥44px targets, wrap gracefully on narrow widths.
- Confirm the OG image aspect ratio reads well as a feed card (no new image pipeline).
- No layout rewrite, no redesign of the buy box.

## Component boundaries

- `meta-pixel.ts` — knows `window.fbq` + env gating; nothing about React or specific events' call sites.
- `MetaPixelScript` — owns base-code injection + PageView-on-navigation; renders nothing visible.
- `TrackPurchase` — pure tracking leaf; knows only confirmed/value/contentIds/orderId + dedupe.
- `ShareButtons` — pure UI; knows the canonical URL + share targets, nothing about cart/Pixel.
- `ProductJsonLd` — pure presentational; serializes one product to JSON-LD.
- `meta-catalog.csv/route.ts` — owns feed serialization + price/availability mapping.
- `absolute-url.ts` — single source of truth for canonical absolute URLs.

Each unit is independently testable and none reach into the others' internals.

## Configuration

| Env var | Required? | Effect |
|---|---|---|
| `NEXT_PUBLIC_META_PIXEL_ID` | Optional | When set, the Pixel loads and all events fire. When unset/empty, **all Pixel behaviour no-ops** and the site is identical to today. |
| `APP_URL` | Already exists | Base for absolute canonical URLs (OG images, feed links, share URLs). |

Documented in `README.md` (env table) alongside the existing variables.

## Testing

### Unit (Vitest)

- **Feed generation:** extract the row-mapping logic into a pure function and test:
  price/sale mapping (on-sale inverts, not-on-sale empty `sale_price`), `availability`
  from stock, archived exclusion, `LKR` formatting, CSV escaping, and the
  `id == product.id` invariant.
- **`meta-pixel`:** `track()` no-ops when the ID is unset; calls `fbq` with the exact
  event + payload when set (with `window.fbq` mocked). `trackPurchaseOnce` fires once per
  order id and skips repeats (localStorage mocked).
- **`absolute-url`:** joins base + path correctly (leading slash, trailing slash cases).

### e2e (Playwright)

- **Pixel events:** stub/spy `window.fbq` (inject before navigation), assert the right
  event name + payload on:
  - product page load → `ViewContent`,
  - add to cart → `AddToCart`,
  - checkout page → `InitiateCheckout`,
  - COD inline success → `Purchase` fires once,
  - online success page (confirmed) → `Purchase` fires once,
  - cancelled success state → `Purchase` does **not** fire,
  - refresh of a confirmed success page → `Purchase` does **not** fire again (dedupe).
- **Share buttons:** assert Facebook/WhatsApp anchor URLs contain the encoded canonical
  product URL; assert Copy-link writes the URL (clipboard mock) and shows feedback.
- **Meta tags:** assert OG title contains the price, OG image is absolute, and a
  `Product` JSON-LD script is present with matching `price`/`priceCurrency`.
- **Feed route:** `request.get('/feed/meta-catalog.csv')` → 200, `text/csv` content-type,
  header row present, an archived product absent, a known product's row has correct
  price/sale/availability.
- **Regression:** existing checkout/order e2e specs must remain green (the Purchase
  tracking and InitiateCheckout effects must not alter navigation or order creation).

## Risks & mitigations

- **Purchase double-counting** → localStorage dedupe + `eventID` + confirmed-only gate.
- **Purchase missed for PayHere** → fire from a client component nested in the
  poll-refreshed server subtree, not from server-rendered initial state.
- **content_ids / feed id drift** → single `product.id` source + tests asserting the
  invariant.
- **Pixel breaking the page** → all `fbq` calls wrapped in try/catch and gated on
  `isPixelEnabled()`.
- **Feed DB load from Meta polls** → route-level revalidate caching.
