# Product Color Variants (Shopify-style)

**Date:** 2026-07-04
**Status:** Approved design

## Problem

Every color of a garment is currently a **separate `Product` row** — `cat-white`, `cat-ivory`, `cat-baby-pink`, `dino-*` — with the color baked into `Product.name` (e.g. "Oversize Cat T-Shirt — White") and a 1:1 relationship between product, PDP, and URL. There is **no color/variant concept anywhere** in the schema or code (verified: all `color`/`variant`/`swatch` matches are CSS or shadcn props).

Consequences:
- The shop/category grid is repetitive — the same design appears once per color.
- Reviews and ratings **fragment per color** (each color aggregates its own reviews).
- There is no way to switch colors on a card or PDP; a shopper must navigate between sibling products that aren't even linked (relation is only "same category").

## Goal

Model each **design as a single product with multiple color variants** (Shopify-style), so:
- The shop shows **one card per design** with **color swatches**; clicking a swatch swaps the card image with a smooth transition, no reload. Title stays constant.
- The PDP shows the same swatches; selecting a color updates the gallery, SKU, price, stock, size availability, and the Add-to-Cart target — all on **one canonical PDP** (`?color=` deep-links a color).
- Each color variant carries **two separate image sets** (card-slider images and PDP-gallery images), a SKU, per-size inventory, and an optional price override.
- Admins manage all of the above from the product editor.

## Decisions (resolved during brainstorming)

1. **Inventory grain — real per-size counts per color.** A color × size quantity grid. Checkout decrements the exact cell; a size shows out-of-stock at 0. This is net-new (today `stock` is a single product-level int and size is display-only).
2. **Existing data — reseed from scratch.** The catalog is demo/seed data with no real orders/reviews tied to it. No data-collapse migration; the seed is restructured to define products with nested variants. The schema migration can be a clean structural change.
3. **Color in the URL — `?color=<colorSlug>` via shallow routing.** One canonical PDP; a color is shareable/bookmarkable and indexable. JSON-LD emits per-color offers; the Meta feed groups colors under a shared `item_group_id`.

### Assumptions (defaults; revisit only if wrong)
- **Reviews are shared across all colors** of a product (key on product, not color). Fixes today's fragmented ratings.
- **Wishlist stays per-product** (heart the design, not a specific color) — `WishlistItem` unique key unchanged.
- **Color filtering in search/category is out of scope** for this change (clean future add; not built now).
- **SKU is optional** per variant (unique when set); **price/originalPrice override is optional** (falls back to the product base values).

## Data model

Color-specific data moves down from `Product` into a variant layer.

### `Product` (now a color-free *design*)
Keeps: `id`, `name`, `price` (base), `originalPrice?`, `description`, `categorySlug`, `archived`, `slugHistory`, `reviews`, `wishlistItems`, `orderItems`, `category`.
**Removes:** `image`, `stock`, `sizes` (these move to the variant/grid).
Adds: `variants ProductVariant[]`.

### `ProductVariant` (one row per color)
- `id` (cuid), `productId`
- `color` (display, "Baby Pink"), `colorSlug` (url-safe, "baby-pink" — used in `?color=`)
- `swatchHex?` (swatch dot color; when null, fall back to the first CARD image as the swatch)
- `sku?` (`@unique` when set)
- `price?`, `originalPrice?` (optional overrides; null ⇒ inherit product base)
- `sortOrder` (default 0; lowest = default color), `archived`
- `@@unique([productId, colorSlug])`, `@@index([productId])`
- Relations: `product`, `images VariantImage[]`, `sizeStocks VariantSizeStock[]`

### `VariantImage` (replaces `ProductImage`)
- `id` (cuid), `variantId`, `url`, `role` (`"CARD" | "DETAIL"`, `@db.VarChar(8)`), `sortOrder`
- `@@index([variantId, role, sortOrder])`
- Carries the **two image sets per color**: `CARD` (shop card slider) and `DETAIL` (PDP gallery).

### `VariantSizeStock` (the inventory grid)
- `id` (cuid), `variantId`, `size` (e.g. "S"/"M"/"L"/"XL"), `stock` (int, default 0)
- `@@unique([variantId, size])`, `@@index([variantId])`
- One row per color+size cell.

### `OrderItem` (snapshot additions)
- Adds `variantId?` (nullable; `onDelete: SetNull` like `productId`), `color?`, `sku?`.
- Keeps `name`, `size`, `price`, `quantity` so history survives product/variant deletion.
- Optional `variant ProductVariant?` relation with `SetNull`.

### Derived rules
- A product is **in stock** iff any of its variants' size-stock cells is `> 0`.
- **Effective price** of a variant = `variant.price ?? product.price` (same for `originalPrice`).
- **Default variant** = lowest `sortOrder` among non-archived variants; drives card image, PDP initial state, and price display when no `?color=` is present.

## Storefront design

### Product card (shop / category / search / home)
Today `product-card.tsx` renders a single `<Image>` — no slider. New:
- A **small client leaf** holds `selectedColorSlug`. The server page passes plain variant data down (respects CLAUDE.md: no async server component nested in a client component).
- **Swatch row** below the image: one dot per color (`swatchHex`, else first CARD image thumb). Title/layout constant across colors.
- The image area shows the selected color's **CARD image set** as a slider; a swatch click cross-fades/slides to that color's first card image (CSS transition, no reload). All colors' card images are provided up front so switching is instant.
- Price reflects the selected variant's effective price; wishlist heart stays product-level.
- Card "Add to cart" / "Buy it now" carry the selected color; size chosen in the existing `AddToCartDialog`.
- **`ProductView`** (`products.ts`) reshapes: per-product base fields + rating aggregate + a `variants[]` array (color, colorSlug, swatchHex, effective price, ordered CARD images). List `select`s and `attachAggregates` update accordingly; rating aggregation stays per-product (and is now unfragmented).

### Product detail page
One PDP per design. `buy-box-client.tsx` gains a **color selector** above the size selector. Selecting a color:
- Swaps `image-gallery.tsx` to that color's **DETAIL** image set,
- Updates SKU, effective price, stock, and **per-size availability** (a size with 0 stock in that color renders disabled),
- Updates the URL to `?color=<slug>` via shallow routing (bookmarkable),
- Sets the **Add-to-Cart target variant**.
- Initial color = valid `?color=` param, else the default variant.
- `getProductDetail` returns the product with ordered variants, each with its DETAIL images and size-stock; slug-redirect machinery (`ProductSlugHistory`) is unchanged (still product-level).

### Cart & checkout
- Cart line identity changes from `productId::size` to **`variantId::size`** — update `cart-context.tsx` `deriveKey` and the duplicated key logic in `add-to-cart-button.tsx` and `buy-box-client.tsx`.
- `CartItem` gains `variantId` + `color`; the cart row shows color alongside size.
- `processOrder` (`checkout/actions.ts`):
  - Validation: chosen size exists **and has stock in that specific variant**.
  - Stock decrement hits the **exact `VariantSizeStock` cell** (conditional decrement / oversell guard, at cell level instead of product level).
  - `OrderItem` snapshots `variantId`, `color`, `sku`.

## Admin design

`product-form.tsx` becomes a design + **repeatable variant editor**.
- **Product-level fields:** name, slug (= id), category, base price, originalPrice, description, archived. Old single `image`/`stock`/`sizes` removed from product level.
- **Variant editor** (add / remove / reorder colors); each variant manages:
  - `color` + `colorSlug` (auto-slugified, editable) + optional `swatchHex` (blank ⇒ first CARD image as swatch),
  - optional `sku`, optional `price`/`originalPrice` override,
  - **two image managers** reusing `GalleryEditor` + Vercel Blob upload — "Card images" (`CARD`) and "Detail images" (`DETAIL`), each reorderable,
  - **size-stock grid** — sizes with a numeric stock input each (color × size counts); add/remove size adds/removes its cell,
  - `sortOrder` via reorder (first = default); a "duplicate variant" button copies sizes/images to speed entry.
- **Server actions & validation:** `ProductInputSchema` becomes nested — `product` + `variants[]` (`color`, `colorSlug`, `sku?`, price overrides, `cardImages[]`, `detailImages[]`, `sizeStocks[{size, stock}]`). `createProduct`/`updateProduct` run in a **transaction**: upsert product, diff variants (create/update/archive), rebuild `VariantImage` + `VariantSizeStock` per variant (delete-and-recreate, matching today's gallery pattern). Slug-rename redirect handling stays product-level.
- Admin product **list** shows each design with color count + total stock (sum of cells); `updateStock` quick-edit becomes per-cell.

### Seed (`mock.ts` + `seed.ts`)
Restructured so the demo designs each define nested color variants with card/detail image folders and per-size stock, replacing today's six separate color-rows. Seed images move to per-variant folders, e.g. `public/products/<product>/<colorSlug>/card/` and `/detail/`.

## SEO / feed / structured data

- **`generateMetadata`** (PDP): read `?color=`, set OG/Twitter image to that color's first DETAIL image; canonical stays the bare product URL.
- **`product-jsonld.tsx`:** emit one `Product` with `hasVariant` / per-color `offers` (each offer: variant SKU, effective price, availability from its size-stock) instead of a single synthesized `sku=id`.
- **Meta catalog feed** (`meta-feed.ts`): today one row per product with `item_group_id = p.id`. Becomes **one row per color variant** sharing `item_group_id = product.id` (Meta/Google's native color-grouping mechanism); each row uses the variant SKU/image/effective price.

## Testing

Per CLAUDE.md: `npm run build` + Vitest before merge; Playwright for user flows. No local DB — schema is a **hand-authored migration** + `tsc` gate, validated on build.

- **Unit (Vitest):** effective price/originalPrice resolution (override vs. base); "in stock" derivation across the grid; cart `deriveKey` with `variantId::size`; per-cell checkout decrement + oversell guard; admin variant diff logic.
- **E2E (Playwright):** shop card swatch swaps image without reload; PDP color select updates gallery/SKU/stock/size-availability + `?color=` URL; add-to-cart carries the right variant; admin creates a multi-color product with both image sets + stock grid and it renders end-to-end.

## Component boundaries

- **Card color switcher** — small client leaf; owns `selectedColorSlug` + preloaded per-color CARD image sets; knows nothing about server data fetching.
- **Variant selector (PDP)** — client; owns selected variant, drives gallery/buy-box, syncs `?color=`.
- **Variant image manager (admin)** — reuses `GalleryEditor`, parameterized by role (`CARD`/`DETAIL`).
- **Inventory resolver (`products.ts` helpers)** — pure functions for effective price and in-stock derivation, unit-testable in isolation.

## Phased implementation plan (one spec, sequenced so each phase builds green)

1. **Schema + migration + types** — models above, hand-authored SQL, reshape `ProductView`/`ProductDetail`.
2. **Data-access + seed** — `products.ts` selects/aggregation/derived helpers; restructured `mock.ts`/`seed.ts`.
3. **Admin editor** — variant editor, two image sets, stock grid, nested actions/validation, per-cell stock edit.
4. **PDP** — color selector, gallery/SKU/stock wiring, `?color=` shallow routing.
5. **Product card** — swatch + slider client leaf.
6. **Cart + checkout** — variant cart key, per-cell decrement, `OrderItem` snapshot.
7. **SEO / feed / JSON-LD** — variant-aware metadata, `hasVariant` offers, feed `item_group_id`.

## Out of scope (future)
- Color/size **facets** in search and category filtering.
- Per-color wishlist and per-color review filtering.
- Non-color option axes (e.g. material, fit) — the model is color-only for now, though `ProductVariant` could generalize later.
