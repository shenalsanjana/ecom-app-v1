## Why

Every finished T-shirt is made from two raw materials — a plain tee (color + size) and a DTF print design — but today's stock is a single number per `(ProductVariant, size)` cell, independent per product. That can't express the real constraint: a specific blank (e.g. White, size M) and a specific print design (e.g. "Cats") are each a shared, finite pool consumed by *every* product that uses them. Running out of White M blanks should disable size M everywhere it's used; running out of the Cats design should take every Cats product fully out of stock. Neither is representable when stock lives independently on each product.

## What Changes

- Add two new admin-managed raw-material pools: `PlainTshirtStock` (quantity per color+size, shared across every product using that color+size) and `DtfDesign` (quantity per print design, shared across every product built on that design).
- **BREAKING**: `VariantSizeStock.stock` is removed. A `VariantSizeStock` row now only declares "this color offers this size" (a structural fact); the quantity comes from `PlainTshirtStock`.
- `Product` gains a `dtfDesignId` field (one design per product, shared by every color variant).
- Finished-product size availability becomes derived, not stored: purchasable only when both the color+size blank and the assigned design have quantity > 0.
- Checkout, admin order cancel/edit, and the payment-failure webhook all acquire/restore from the exact raw-material rows an order consumed (frozen on `OrderItem` at order-creation time), not from the product's current state.
- New admin "Inventory" section: CRUD for both pools, with low-stock/out-of-stock indicators.
- Product editor: replaces the per-size stock input with a required DTF Design picker; sizes remain editable as "offered" only.
- Admin dashboard low-stock KPI and the products-list low-stock tab are recomputed from the two pools instead of per-product stock.
- Storefront (PDP, product cards, JSON-LD, Meta catalog feed) all read derived availability from the two pools.
- Rollout: every pool starts empty and every existing product starts with `dtfDesignId = null` (i.e. unavailable) — no fabricated numbers. Admins do a one-time real stock count + design assignment after this ships.

## Capabilities

### New Capabilities
- `raw-material-inventory`: the two shared stock pools (`PlainTshirtStock`, `DtfDesign`), their admin CRUD/Inventory UI, the derived two-pool availability rule, and the checkout/cancel/edit/payment-failure acquire-and-restore behavior built on it.

### Modified Capabilities
- `admin-product-management`: products require a `dtfDesignId`; the per-color size-stock grid loses its quantity input (now declares offered sizes only); the low-stock product-list tab and admin dashboard KPI are recomputed from the raw-material pools instead of per-product stock.
- `product-color-variants`: `VariantSizeStock` stops storing a quantity — a row means "this color offers this size," with the actual stock count now owned by `raw-material-inventory`. Size availability shown on the PDP/product cards is derived from the two pools instead of read directly off the variant.
- `product-catalog-feed`: the Meta catalog feed's per-variant `availability` (in stock / out of stock) is computed from the two raw-material pools instead of the variant's own stock cells.

## Impact

- **Schema**: `prisma/schema.prisma` — new `PlainTshirtStock`/`DtfDesign` models, `Product.dtfDesignId`, `OrderItem.plainTshirtStockId`/`dtfDesignId`, dropped `VariantSizeStock.stock` (two hand-authored migrations, the drop sequenced after the app code is live).
- **Checkout & order lifecycle**: `app/checkout/actions.ts`, `app/_lib/order-validation.ts`, `app/admin/orders/actions.ts`, `app/_lib/admin-orders.ts`, `app/_lib/payments/order-finalization.ts` — all stock acquire/restore rewired onto two new shared helpers (`app/_lib/inventory-pools.ts`).
- **Admin**: new `/admin/inventory` section; `app/admin/products/actions.ts`, product editor components, `app/_lib/admin-products.ts`, `app/_lib/admin-kpis.ts`.
- **Storefront**: `app/_lib/products.ts`, `app/_components/product/buy-box-client.tsx`, `app/_components/product/product-jsonld.tsx`, `app/feed/meta-catalog.csv/route.ts`.
- **Derived-availability core**: `app/_lib/variants.ts` (rewritten helpers consumed by nearly every file above).
- **Seed data**: `prisma/seed.ts`, `app/_data/mock.ts` (dev/demo only — seeds non-zero pool data; production starts at zero per the rollout decision).
- No new external dependencies. No changes to payment providers, courier integration, or auth.
