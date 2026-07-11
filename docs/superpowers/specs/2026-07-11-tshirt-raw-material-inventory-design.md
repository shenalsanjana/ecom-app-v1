# T-Shirt Raw-Material Inventory (Plain Tees + DTF Designs)

**Date:** 2026-07-11
**Status:** Approved design

## Problem

Every finished T-shirt is made from two raw materials: a plain tee (color + size) and a DTF print design. Today, stock is tracked as a single number per `(ProductVariant, size)` cell (`VariantSizeStock.stock`) — independent per product. That model can't express the real constraint: a specific blank (e.g. White, size M) and a specific print design (e.g. "Cats") are each a **shared, finite pool** consumed by *every* product that uses them. Running out of White M blanks should disable size M everywhere it's used, not just on one product; running out of the Cats design should take every Cats product fully out of stock — none of that is representable when stock lives independently on each product.

## Goal

Split inventory into two admin-managed raw-material pools, and make finished-product availability a **derived** fact rather than a stored one:

- `PlainTshirtStock` — quantity per (color, size), shared across every product that uses that color+size.
- `DtfDesign` — quantity per print design, shared across every product built on that design.
- A product's size is purchasable only when **both** its color+size blank and its design have stock > 0.
- Orders deduct from both pools atomically; cancellations/edits/payment failures restore both pools, targeting the exact raw-material rows an order consumed — not whatever a product currently points to.
- Admins manage both pools from a new Inventory section, see low-stock/out-of-stock at a glance, and the storefront/PDP/cards reflect availability automatically.

## Decisions (resolved during brainstorming)

1. **Shared pooling, not per-product stock.** The spec's own framing ("every product that uses white M", "every product using the Cats design") only makes sense with shared pools. `VariantSizeStock.stock` is retired as a quantity; the row's *existence* becomes a structural fact ("this color comes in size M"), and the number comes from `PlainTshirtStock`.
2. **Rollout starts every pool at zero.** This is a live store; the real blank-tee and DTF-sheet counts aren't in "shared pool" shape today. Rather than fabricate numbers by guessing from old per-product counts, every pool starts empty and every product starts with no design assigned. Everything reads as unavailable until an admin does a one-time real stock count + design-assignment pass in the new Inventory panel. (Local dev/demo seed data is unaffected — see Migration.)
3. **One DTF design per product**, not per color variant. A print design doesn't change by shirt color; all of a product's colors share `Product.dtfDesignId`.
4. **Fixed 1:1 consumption.** One unit sold consumes exactly one matching blank and one design credit. No per-product multiplier field.

### Assumptions (defaults; revisit only if wrong)
- The entire catalog is T-shirts built from exactly these two raw materials — no non-apparel products that should skip this gating.
- Color matching between a product variant and its raw-material pool is by `colorSlug` string match (the same convention `colorSlug` already uses for images/routing), not a hard foreign key — an autocomplete on the color field suggests existing pool colors to curb typos, but doesn't enforce them.
- `VariantSizeStock` keeps its table/relation name (`variant.sizeStocks`) even though it no longer stores a quantity — renaming is cosmetic and would touch ~15 files for no functional gain.

## Data model

### `PlainTshirtStock` (new)
- `id` (cuid), `color` (display, "White"), `colorSlug`, `size`, `quantity` (int, default 0)
- `@@unique([colorSlug, size])`

### `DtfDesign` (new)
- `id` (cuid), `name`, `slug` (`@unique`), `quantity` (int, default 0)

### `Product`
- Adds `dtfDesignId String?` (nullable at the DB level — see Migration; the product-editor form requires it going forward), relation `dtfDesign DtfDesign?` `onDelete: Restrict` (a design in use can't be deleted).

### `VariantSizeStock`
- Drops the `stock` column. `(variantId, size)` existence now means "this product offers this color in this size" — a structural/design fact, not a quantity. Quantity is looked up from `PlainTshirtStock` by the parent variant's `colorSlug` + this row's `size`.

### `OrderItem` (snapshot additions)
- Adds `plainTshirtStockId String?` and `dtfDesignId String?` (both `onDelete: SetNull`, same pattern as the existing `productId`/`variantId`).
- These are set once, at order-creation time, to the exact raw-material rows consumed. Every restore path (cancel, edit, payment-failure) increments *these* rows, never re-derives "what pool does this belong to" from the product's current state — protecting against the same bug class that hit `variantId` restore in [[product-color-variants-change]] when a product's variants were later recreated. If a row is later deleted, `SetNull` makes the snapshot `null` and restore skips it gracefully (same as today's `if (!variantId || !size) continue` guard).

### Derived rules
- `sizeAvailable(colorSlug, size, dtfDesignId)` = `PlainTshirtStock(colorSlug, size).quantity > 0 AND DtfDesign(dtfDesignId).quantity > 0`. No caching — computed on read; this is a low-traffic store and correctness matters more than shaving a join.
- Because the design check is per-product (not per-size), a design hitting zero makes every size of every variant of that product unavailable automatically — "mark product out of stock" is a consequence of the AND, not a separate flag to maintain.
- A product is in stock iff *any* of its offered (color, size) combinations is available by the rule above.

## Data flow

### Checkout (`app/checkout/actions.ts`)
Alongside today's variant fetch, also fetch each item's product `dtfDesignId`. Inside the existing order-create transaction, per item: guarded-decrement the matching `PlainTshirtStock` row (`colorSlug` + `size`, `quantity >= qty`) and the `DtfDesign` row (`quantity >= qty`) — same "0 rows affected → throw insufficient stock" pattern used today, just against two tables instead of one. The resolved row ids are written onto `OrderItem.plainTshirtStockId`/`dtfDesignId` at create time. Two lines in the same cart hitting the same pool (two colors of one design; two sizes of one color) are still correct because each guarded update runs sequentially inside the transaction and re-checks the row's *current* quantity — no pre-aggregation needed, matching how two lines against one `VariantSizeStock` row already work today.

Pre-transaction validation (`order-validation.ts`) keeps its current level of rigor: a best-effort per-line check against current pool quantities to return a friendly error early. It does not aggregate same-pool quantities across lines — the transaction's guarded decrement remains the actual oversell authority, exactly as today's documented (accepted) limitation.

### Restore (cancel / edit / payment failure)
All four existing restore sites — `admin/orders/actions.ts` (`cancelOrderTx`, `editItems`), `payments/order-finalization.ts` (`finalizeFailedPayment`) — currently key restore off `OrderItem.variantId + size`. They switch to reading `OrderItem.plainTshirtStockId`/`dtfDesignId` directly and incrementing those rows by id, skipping when either is `null` (sizeless line, or the pool row was since deleted). `editItems`' quantity-increase path reuses the *original* snapshotted ids rather than re-deriving from the product's current state.

## Admin design

### New "Inventory" section
Separate nav item from Products — it manages shared pools, not per-product data.

- **Plain T-Shirt Stock:** a color × size grid (same visual pattern as today's per-variant stock editor: rows = colors, columns = sizes). Inline-editable quantity per cell; add a color row or size column; delete a cell. Cells at 0 render greyed/out-of-stock; at or below the existing `LOW_STOCK_THRESHOLD` (5, from `admin-products.ts`) render as low-stock. Deleting a color+size that's still in use by product variants shows a warning ("N products use this — they'll show unavailable") but isn't hard-blocked, since there's no FK enforcing that link (see Decisions).
- **DTF Designs:** a table — name, quantity, low/out-of-stock badge, count of products currently assigned. Add/edit inline. Delete is blocked with a friendly message if any product still references it (checked proactively before hitting the DB `Restrict` constraint).

### Product editor
- The per-size numeric stock input is removed from the variant editor. Sizes remain editable as "offered" chips (add/remove which sizes a color comes in) with no quantity attached.
- A new required **DTF Design** dropdown is added to the product form (existing designs, plus inline "+ new design" quick-create).
- The color field keeps its existing freeform text + auto-slugify behavior; a datalist suggests existing `PlainTshirtStock` colors without forcing selection from it.

### Dashboard
- `admin-kpis.ts`'s `lowStock` KPI is recomputed from the two pool tables (count of rows at/below threshold in each) instead of scanning `VariantSizeStock`.
- The product list's "low stock" filter (`buildProductWhere`) can no longer be a DB `where` clause, since stock isn't stored on the product side. It becomes an in-app computation: fetch products with their variants' colorSlugs + dtfDesignId, cross-reference against the two pool tables — acceptable at this catalog's size (tens of products).

## Storefront design

Four existing consumers of the old `sizeStocks[].stock`-based helpers (`app/_lib/variants.ts`: `variantInStock`, `productInStock`, `availableSizes`, `stockForSize`) are rebuilt on top of the two-pool derived rule above. Visual behavior (greyed-out disabled sizes, out-of-stock badges) is unchanged — only what feeds those booleans changes:

- `buy-box-client.tsx` (PDP size selector)
- `product-jsonld.tsx` (structured-data `availability`)
- `products.ts` (catalog/card listing — out-of-stock badge, available sizes on cards)
- `app/feed/meta-catalog.csv/route.ts` (Meta product feed availability)

Since the catalog is small, each of these fetches the *entire* `PlainTshirtStock` + `DtfDesign` tables once and joins in-app, rather than a per-product/per-variant query.

## Migration

Two hand-authored migrations, same pattern as [[product-color-variants-change]] (`..._add_product_variants` then a separate `..._drop_legacy_product_columns`):

1. **Migration A (additive, ships with the new code):** create `PlainTshirtStock` and `DtfDesign` (empty), add `Product.dtfDesignId` (nullable), add `OrderItem.plainTshirtStockId`/`dtfDesignId` (nullable, `SetNull`). Fully additive — safe to apply ahead of the code deploy.
2. **Migration B (cleanup, ships once Migration A + new code are confirmed live):** drop `VariantSizeStock.stock`. This must wait — the old code is still reading/writing that column until the new code is actually serving traffic; dropping it early would break the running app mid-deploy.

`Product.dtfDesignId` is nullable at the DB level (existing products start unassigned) but required by the product-editor form for anything created or edited going forward — the same one-time admin pass that populates real stock counts naturally also assigns designs. Historical `OrderItem`s predating this change simply have `null` snapshot ids, which the restore paths already treat as "nothing to restore."

`seed.ts`/`mock.ts` are dev-only tooling (confirmed: `seed.ts` destructively rebuilds `VariantSizeStock` on every run, so it's not something re-run against a live production database). They're updated to seed both pools with deterministic non-zero demo values (same `stockFor()`-style pseudo-random helper already used), so local dev/demo isn't left fully out-of-stock. This doesn't conflict with the production rollout starting at zero — the two are unrelated code paths.

## Testing

Per CLAUDE.md: `npm run build` + Vitest before merge; Playwright for user flows touching checkout/PDP. No local DB — hand-authored migrations + `tsc` gate, validated on build (per [[no-local-database]]).

- **Unit (Vitest):** derived availability rule (blank zero, design zero, both nonzero, both zero); checkout guarded double-decrement (blank + design) including the "0 rows affected → throw" oversell path; two same-order lines against one pool; all four restore paths incrementing by snapshotted id and skipping on `null`; admin low-stock/out-of-stock computations for both pools.
- **E2E (Playwright):** a design hitting zero stock takes every size of every product using it out of stock (greyed, add-to-cart blocked); a blank color+size hitting zero disables just that size elsewhere it's used, leaving other sizes selectable; admin can add/edit both pools and see low/out-of-stock indicators; cancelling an order restores both pools.

## Phased implementation plan (one spec, sequenced so each phase builds green)

1. **Schema + Migration A** — `PlainTshirtStock`, `DtfDesign`, `Product.dtfDesignId`, `OrderItem` snapshot columns; regenerate Prisma client.
2. **Derived availability helpers** — rewrite `app/_lib/variants.ts` on top of the two-pool rule; unit tests for the derived-rule matrix.
3. **Checkout + restore wiring** — dual guarded decrement in `checkout/actions.ts`; snapshot ids onto `OrderItem`; all four restore sites (`cancelOrderTx`, `editItems`, `finalizeFailedPayment`) switched to increment-by-snapshotted-id.
4. **Admin Inventory section** — Plain T-Shirt Stock grid + DTF Designs table, CRUD actions, low/out-of-stock badges.
5. **Product editor** — remove per-size stock input, add required DTF Design dropdown, color datalist autocomplete.
6. **Storefront wiring** — swap the four consumers (PDP, JSON-LD, catalog/cards, Meta feed) onto the new helpers.
7. **Dashboard KPIs + low-stock product filter** — recompute from the two pools.
8. **Seed data** — `mock.ts`/`seed.ts` updated with demo pool data and per-product design assignment.
9. **Migration B** — drop `VariantSizeStock.stock`, shipped once phases 1–8 are live and confirmed.

## Out of scope (future)
- Configurable consumption ratios (e.g. a design needing 2 DTF sheets per unit).
- A hard FK from `VariantSizeStock`/`ProductVariant` to `PlainTshirtStock` (currently a `colorSlug` string match by convention).
- Automatic reallocation/waitlisting when a pool is restocked (admin restocks manually; availability just recomputes on next read).
- Per-size or per-design low-stock email/SMS alerts to admins (dashboard badges only, for now).
