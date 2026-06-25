# Tasks

Detailed TDD steps, exact code, and commands live in
`docs/superpowers/plans/2026-06-26-social-commerce-meta-integration.md`.
Each numbered group below maps to one plan task and ends in a commit.

## 1. Shared helpers + Meta Pixel module

- [x] 1.1 Write failing tests for `absoluteUrl` (`app/_lib/__tests__/absolute-url.test.ts`) and implement `app/_lib/absolute-url.ts` (joins `APP_URL` + path, single slash, localhost fallback)
- [x] 1.2 Write failing tests for `app/_lib/__tests__/meta-pixel.test.ts` (no-op when unset, fires with payload when set, `trackPurchaseOnce` dedupe)
- [x] 1.3 Implement `app/_lib/meta-pixel.ts`: `pixelId`, `isPixelConfigured`, `track`, `trackViewContent`, `trackAddToCart`, `trackInitiateCheckout`, `trackPurchaseOnce`, `PURCHASE_DEDUPE_KEY` (gated on `window.fbq`, try/catch, LKR)
- [x] 1.4 Run `npm test -- absolute-url meta-pixel` (green) and commit

## 2. Base Pixel script + PageView on navigation

- [x] 2.1 Create `app/_components/analytics/meta-pixel-script.tsx` (next/script base code, `fbq init` + PageView, PageView on `usePathname` change, renders null when unconfigured)
- [x] 2.2 Mount `<MetaPixelScript />` in `app/layout.tsx` `<body>`
- [x] 2.3 Verify `npm run build` (or `npx tsc --noEmit` if DB-blocked) and commit

## 3. ViewContent + AddToCart tracking

- [x] 3.1 Fire `trackViewContent` on mount and `trackAddToCart` in Buy Now in `app/_components/product/buy-box-client.tsx`
- [x] 3.2 Fire `trackAddToCart` in `app/_components/cart/add-to-cart-button.tsx` `handleAdd`
- [x] 3.3 Fire `trackAddToCart` in `app/_components/cart/add-to-cart-dialog.tsx` `handleAdd` and `handleBuyNow`
- [x] 3.4 Verify `npx tsc --noEmit` and commit

## 4. InitiateCheckout tracking

- [x] 4.1 Add a fired-once ref + effect in `app/checkout/checkout-client.tsx` to fire `trackInitiateCheckout` when the form first has items (content_ids, subtotal, num_items)
- [x] 4.2 Verify `npx tsc --noEmit` and commit

## 5. Purchase tracking (COD inline + online success) with dedupe

- [x] 5.1 In `app/checkout/checkout-client.tsx` COD branch: capture content_ids + total before `clearCart()`, then call `trackPurchaseOnce`
- [x] 5.2 Create `app/checkout/success/track-purchase.tsx` (`<TrackPurchase>` leaf; fires `trackPurchaseOnce` from an effect when `confirmed`)
- [x] 5.3 Render `<TrackPurchase>` in `app/checkout/success/page.tsx` `OrderDetails` (confirmed = `isPaid || isCod`), beside `ClearCartOnPaid`
- [x] 5.4 Verify `npx tsc --noEmit` and commit

## 6. OG price-in-title + Product JSON-LD

- [x] 6.1 Enrich `generateMetadata` in `app/products/[id]/page.tsx` (price-in-title via `formatPrice`, absolute OG/twitter image)
- [x] 6.2 Create `app/_components/product/product-jsonld.tsx` (Product + Offer + conditional AggregateRating; `sku` = product.id)
- [x] 6.3 Render `<ProductJsonLd>` on the product page; verify `npx tsc --noEmit` and commit

## 7. Share buttons

- [x] 7.1 Create `app/_components/product/share-buttons.tsx` (native share when supported + Facebook (inline SVG) / WhatsApp / Copy-link with inline "Copied" state; no toast)
- [x] 7.2 Render `<ShareButtons>` in `app/_components/product/buy-box-client.tsx`; verify `npx tsc --noEmit` and commit

## 8. CSV catalog feed

- [x] 8.1 Write failing tests `app/_lib/__tests__/meta-feed.test.ts` (price/sale inversion, availability, CSV escaping, header)
- [x] 8.2 Implement pure `app/_lib/meta-feed.ts` (`productToFeedRow`, `feedRowsToCsv`, `FEED_COLUMNS`, types)
- [x] 8.3 Create `app/feed/meta-catalog.csv/route.ts` (Node runtime, Prisma, archived excluded, cached, `text/csv`)
- [x] 8.4 Run `npx tsc --noEmit && npm test -- meta-feed` (green) and commit

## 9. README documentation

- [x] 9.1 Add `NEXT_PUBLIC_META_PIXEL_ID` to the `.env.local` example and a "Social Commerce / Meta Integration" section in `README.md`; commit

## 10. Playwright e2e tests

- [ ] 10.1 Create `tests/e2e/meta-pixel.spec.ts`: stub `window.fbq` via `addInitScript`; assert ViewContent, AddToCart, InitiateCheckout, and COD Purchase-fires-once
- [ ] 10.2 Create `tests/e2e/meta-share-seo.spec.ts`: assert OG price-in-title, absolute OG image, Product JSON-LD (`sku` = product.id), and share buttons present + Copy "Copied" state
- [ ] 10.3 Create `tests/e2e/meta-feed.spec.ts`: assert `/feed/meta-catalog.csv` 200, `text/csv`, header row, and rows present
- [ ] 10.4 Run `npm run test:e2e -- meta-pixel meta-share-seo meta-feed` (green) and commit

## 11. Full regression

- [ ] 11.1 Run `npm test` (existing 418 + new unit tests) — all green
- [ ] 11.2 Run `npm run test:e2e` — existing `order-confirmation` / `payhere-*` specs stay green (or record env-blocked, to run in CI before merge)
- [ ] 11.3 Run `npx tsc --noEmit && npm run lint` — no type or new lint errors
- [ ] 11.4 Verify no-op-when-unset: with `NEXT_PUBLIC_META_PIXEL_ID` unset, no `fbevents.js` request and no `meta-pixel-base` script tag
