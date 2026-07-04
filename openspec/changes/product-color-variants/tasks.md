# Tasks — Product Color Variants

Each task maps to a task in the implementation plan `docs/superpowers/plans/2026-07-04-product-color-variants.md`, which holds the code-level TDD steps. Gate after every task: `npx tsc --noEmit` + `npm run test` (no local DB). Commit per task.

## 1. Schema (additive) + migration

- [ ] 1.1 Add `ProductVariant` / `VariantImage` (role CARD|DETAIL) / `VariantSizeStock` models and `OrderItem` `variantId`/`color`/`sku` + back-relation to `prisma/schema.prisma`; `prisma generate` + `tsc`
- [ ] 1.2 Hand-author the additive migration `<ts>_add_product_variants/migration.sql` (re-runnable; keeps legacy `Product.image/stock/sizes` + `ProductImage`)

## 2. Variant helpers (pure) + seed restructure

- [ ] 2.1 Create `app/_lib/variants.ts` (effective price, in-stock, available sizes, default-variant resolution) with unit tests (TDD)
- [ ] 2.2 Restructure `app/_data/mock.ts` into products-with-nested-variants (`MockProduct`/`MockVariant`)
- [ ] 2.3 Rewrite `prisma/seed.ts` to seed variants + two image sets + size-stock, back-filling legacy scalar columns

## 3. Admin editor

- [ ] 3.1 Nested `ProductInputSchema` + `create`/`update` actions writing variants in a transaction (back-fill legacy scalars); remove dead `updateStock`
- [ ] 3.2 Create `variant-editor.tsx` (color, swatch, SKU, price override, two image sets, size-stock grid; add/remove/reorder/duplicate)
- [ ] 3.3 Rewrite `product-form.tsx` to use the variant editor
- [ ] 3.4 Update `admin-products.ts` (`getProduct`/`listProducts`/`buildProductWhere`), `products-table.tsx` (colors + total stock), edit/new pages, and the `buildProductWhere` test; delete `stock-quick-edit.tsx`

## 4. PDP: variant selection + `?color=`

- [ ] 4.1 Reshape `getProductDetail` to return `VariantDetail[]` (effective price, detail images, size stock)
- [ ] 4.2 Create shared `color-swatches.tsx`
- [ ] 4.3 Rewrite `image-gallery.tsx` to be variant-aware (reads `?color=`)
- [ ] 4.4 Rewrite `buy-box-client.tsx` (color selector, per-color price/SKU/stock/size-availability, `?color=` shallow routing)
- [ ] 4.5 Wire `products/[id]/page.tsx` to variants

## 5. List `ProductView` reshape + card + all list consumers

- [ ] 5.1 Reshape list reads in `products.ts` (`ProductCardVariant`/`ProductView`, `cardSelect`, `attachAggregates`, all list queries, in-stock filter, `getWishlistProductCards`)
- [ ] 5.2 Rewrite `product-card.tsx` as a swatch client card (per-color image swap)
- [ ] 5.3 Update all consumers: home grid, deals-section, `categories/[slug]`, `categories/page`, `deals/page` (default-variant pricing), `search`, `wishlist`, `related-strip`

## 6. Cart + checkout

- [ ] 6.1 `cart-context.tsx`: `variantId::size` key, `variantId`/`color` on `CartItem`, storage-key bump, validator
- [ ] 6.2 `add-to-cart-button.tsx` + `add-to-cart-dialog.tsx` carry `variantId`/`color`
- [ ] 6.3 Add `id` to `ProductCardVariant`; pass `variantId`/`color` from buy box + card
- [ ] 6.4 Create `order-validation.ts` (`validateCartItems`, TDD) and wire checkout: variant-based validation, per-cell decrement, `OrderItem` snapshot

## 7. SEO / feed / JSON-LD + contract

- [ ] 7.1 Per-color JSON-LD offers + color-aware PDP metadata
- [ ] 7.2 Per-variant Meta feed rows (`variantToFeedRow`, TDD) + feed route
- [ ] 7.3 Contract: drop legacy `Product.image/stock/sizes` + `ProductImage` (schema + drop migration + remove back-fills in seed/actions + PDP fallback image)

## 8. Final verification

- [ ] 8.1 Run `npx prisma generate && npx tsc --noEmit && npm run test`; confirm both migrations present/ordered; grep for stray legacy `Product.image/stock/sizes` refs
