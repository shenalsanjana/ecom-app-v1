## Why

Today every color of a garment is a separate `Product` row (e.g. `cat-white`, `cat-ivory`, `cat-baby-pink`), with the color baked into the product name. The shop grid repeats the same design once per color, ratings fragment per color, and there is no way to switch colors on a card or product page. This change models each design as a single product with color variants (Shopify-style), so one card and one page represent a design and its colors.

Full design and step-by-step plan (referenced, not duplicated here):
- Design spec: `docs/superpowers/specs/2026-07-04-product-color-variants-design.md`
- Implementation plan: `docs/superpowers/plans/2026-07-04-product-color-variants.md`

## What Changes

- **New data model:** `ProductVariant` (one row per color: color, colorSlug, swatchHex, SKU, optional price override, sortOrder), `VariantImage` (role `CARD` | `DETAIL` — the two image sets per color), and `VariantSizeStock` (real color × size stock grid). `OrderItem` gains `variantId` / `color` / `sku` snapshot columns.
- **Storefront cards:** one card per design with color swatches; clicking a swatch swaps the card image (no reload). Card and PDP each use their own image set per color.
- **Product detail page:** a color selector updates the gallery, SKU, price, per-size availability, and Add-to-Cart target on a single canonical PDP; the selected color is reflected as `?color=<slug>` via shallow routing.
- **Inventory:** real per-color-per-size stock counts. Checkout validates and decrements the exact color+size cell (replaces the single product-level `stock`).
- **Cart:** cart line identity becomes `variantId::size`; lines carry `variantId` + `color`.
- **SEO/feed:** per-color JSON-LD offers and one Meta feed row per color sharing `item_group_id`; color-aware OG metadata.
- **Reseed from scratch** — the demo catalog is redefined with nested variants; no data-collapse migration.
- **BREAKING** (internal, contract phase): `Product.image`, `Product.stock`, `Product.sizes`, and the `ProductImage` table are removed after all reads/writes migrate to the variant model.
- Reviews are shared across a product's colors; wishlist stays per-product. Color search facets are out of scope.

## Capabilities

### New Capabilities
- `product-color-variants`: the color-variant data model, swatch product cards, PDP color selection with `?color=` deep-linking, variant-keyed cart, and per-color-size stock validation/decrement at checkout.

### Modified Capabilities
- `admin-product-management`: the product editor manages a repeatable color-variant editor (color, swatch, SKU, optional price override, two image sets, size-stock grid) and per-design stock/image derivation, replacing the single image/stock/sizes fields.
- `product-catalog-feed`: the Meta catalog feed emits one row per color variant sharing `item_group_id = product.id` (was one row per product), and product JSON-LD emits per-color offers.

## Impact

- **Schema/DB:** `prisma/schema.prisma` (+ two hand-authored migrations: additive, then contract-drop of legacy columns/`ProductImage`). No local DB — gate is `tsc --noEmit` + Vitest; migrations apply in the deploy pipeline.
- **Data access:** `app/_lib/products.ts` (`ProductView`/`ProductDetail` reshape, list selects), `app/_lib/admin-products.ts`, new `app/_lib/variants.ts` + `app/_lib/order-validation.ts`.
- **Storefront:** product card + all list consumers (home grid, deals, category pages, search, wishlist, related), PDP buy box + image gallery, new color-swatch component.
- **Cart/checkout:** `app/_lib/cart-context.tsx`, add-to-cart button/dialog, `app/checkout/actions.ts`.
- **Admin:** product form, variant editor, product list, server actions/validation.
- **SEO/feed:** `product-jsonld.tsx`, `meta-feed.ts`, feed route, PDP metadata.
- **Seed:** `app/_data/mock.ts`, `prisma/seed.ts`, per-variant image folders under `public/products/<product>/<colorSlug>/card|detail/`.
