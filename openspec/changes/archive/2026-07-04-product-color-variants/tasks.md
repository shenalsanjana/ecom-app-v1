# Tasks — Product Color Variants

Each task maps to a task in the implementation plan `docs/superpowers/plans/2026-07-04-product-color-variants.md`, which holds the code-level TDD steps. Gate after every task: `npx tsc --noEmit` + `npm run test` (no local DB). Commit per task.

## 1. Schema (additive) + migration

- [x] 1.1 Add `ProductVariant` / `VariantImage` (role CARD|DETAIL) / `VariantSizeStock` models and `OrderItem` `variantId`/`color`/`sku` + back-relation to `prisma/schema.prisma`; `prisma generate` + `tsc`
- [x] 1.2 Hand-author the additive migration `<ts>_add_product_variants/migration.sql` (re-runnable; keeps legacy `Product.image/stock/sizes` + `ProductImage`)

## 2. Variant helpers (pure) + seed restructure

- [x] 2.1 Create `app/_lib/variants.ts` (effective price, in-stock, available sizes, default-variant resolution) with unit tests (TDD)
- [x] 2.2 Restructure `app/_data/mock.ts` into products-with-nested-variants (`MockProduct`/`MockVariant`)
- [x] 2.3 Rewrite `prisma/seed.ts` to seed variants + two image sets + size-stock, back-filling legacy scalar columns

## 3. Admin editor

- [x] 3.1 Nested `ProductInputSchema` + `create`/`update` actions writing variants in a transaction (back-fill legacy scalars); remove dead `updateStock`
- [x] 3.2 Create `variant-editor.tsx` (color, swatch, SKU, price override, two image sets, size-stock grid; add/remove/reorder/duplicate)
- [x] 3.3 Rewrite `product-form.tsx` to use the variant editor
- [x] 3.4 Update `admin-products.ts` (`getProduct`/`listProducts`/`buildProductWhere`), `products-table.tsx` (colors + total stock), edit/new pages, and the `buildProductWhere` test; delete `stock-quick-edit.tsx`

## 4. PDP: variant selection + `?color=`

- [x] 4.1 Reshape `getProductDetail` to return `VariantDetail[]` (effective price, detail images, size stock)
- [x] 4.2 Create shared `color-swatches.tsx`
- [x] 4.3 Rewrite `image-gallery.tsx` to be variant-aware (reads `?color=`)
- [x] 4.4 Rewrite `buy-box-client.tsx` (color selector, per-color price/SKU/stock/size-availability, `?color=` shallow routing)
- [x] 4.5 Wire `products/[id]/page.tsx` to variants

## 5. List `ProductView` reshape + card + all list consumers

- [x] 5.1 Reshape list reads in `products.ts` (`ProductCardVariant`/`ProductView`, `cardSelect`, `attachAggregates`, all list queries, in-stock filter, `getWishlistProductCards`)
- [x] 5.2 Rewrite `product-card.tsx` as a swatch client card (per-color image swap)
- [x] 5.3 Update all consumers: home grid, deals-section, `categories/[slug]`, `categories/page`, `deals/page` (default-variant pricing), `search`, `wishlist`, `related-strip`

## 6. Cart + checkout

- [x] 6.1 `cart-context.tsx`: `variantId::size` key, `variantId`/`color` on `CartItem`, storage-key bump, validator
- [x] 6.2 `add-to-cart-button.tsx` + `add-to-cart-dialog.tsx` carry `variantId`/`color`
- [x] 6.3 Add `id` to `ProductCardVariant`; pass `variantId`/`color` from buy box + card
- [x] 6.4 Create `order-validation.ts` (`validateCartItems`, TDD) and wire checkout: variant-based validation, per-cell decrement, `OrderItem` snapshot

## 7. SEO / feed / JSON-LD + contract

- [x] 7.1 Per-color JSON-LD offers + color-aware PDP metadata
- [x] 7.2 Per-variant Meta feed rows (`variantToFeedRow`, TDD) + feed route
- [x] 7.3 Contract: drop legacy `Product.image/stock/sizes` + `ProductImage` (schema + drop migration + remove back-fills in seed/actions + PDP fallback image)

## 8. Final verification

- [x] 8.1 Run `npx prisma generate && npx tsc --noEmit && npm run test`; confirm both migrations present/ordered; grep for stray legacy `Product.image/stock/sizes` refs
