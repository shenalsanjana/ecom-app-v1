## Context

Full design rationale lives in `docs/superpowers/specs/2026-07-11-tshirt-raw-material-inventory-design.md` (brainstormed and approved separately per this repo's combined workflow); this document summarizes the technical decisions for the OpenSpec record. The step-by-step implementation is `docs/superpowers/plans/2026-07-11-tshirt-raw-material-inventory.md` (21 tasks).

Today, `VariantSizeStock.stock` is an independent per-product-color-size count, decremented at checkout and restored on cancel/edit/payment-failure. It cannot express a shared raw-material pool: the spec's own framing ("every product that uses white M," "every product using the Cats design") only makes sense if a blank tee's and a design's quantity are each single numbers shared across the whole catalog.

## Goals / Non-Goals

**Goals:**
- Model two shared, admin-managed stock pools (`PlainTshirtStock`, `DtfDesign`) that gate finished-product availability.
- Make every acquire/restore path (checkout, admin cancel, admin edit, payment-failure webhook) correct and consistent by routing them through two shared transaction helpers.
- Freeze which raw-material rows an order consumed on `OrderItem` at order-creation time, so a later product/design change never corrupts a restore.
- Give admins CRUD + low-stock/out-of-stock visibility over both pools from a new Inventory section.

**Non-Goals:**
- Configurable consumption ratios (fixed 1:1 — one unit sold consumes one blank + one design credit).
- A hard foreign key from `ProductVariant`/`VariantSizeStock` to `PlainTshirtStock` (matched by `colorSlug` string convention instead, consistent with how `colorSlug` is already used for image/routing matching).
- Automatic reallocation, waitlisting, or restock alerts beyond dashboard badges.
- Migrating or estimating real stock numbers from today's per-product counts — the rollout starts every pool at zero (see Migration Plan).

## Decisions

1. **Shared pooling, not per-product stock.** `VariantSizeStock` keeps its table/relation name but drops its `stock` column; row existence becomes "this color offers this size" (structural), and quantity comes from `PlainTshirtStock`, matched by the variant's `colorSlug` + the row's `size`.
2. **One `DtfDesign` per `Product`**, not per color variant (`Product.dtfDesignId`) — a print design doesn't change by shirt color, and the spec's own language ("the Cats design") treats it as a single per-product fact.
3. **`OrderItem` snapshots the exact pool ids consumed** (`plainTshirtStockId`, `dtfDesignId`, both nullable/`SetNull`), frozen at order-creation time. Every restore path increments *these* rows, never re-derives "which pool" from the product's current state — this avoids the same bug class that broke stock-restore in the prior product-color-variants change when variant recreation nulled `variantId`.
4. **Two shared transaction helpers** (`acquireItemPools`/`restoreItemPools` in `app/_lib/inventory-pools.ts`) back every stock-touching path. `editItems` (admin order edit) is reframed as restore-every-original-line then reacquire-every-surviving-line, rather than computing deltas — this collapses what would otherwise be the hardest piece of logic (mixed size+quantity changes) into reuse of the same two primitives checkout and cancel already need.
5. **Availability is computed on read, not cached.** `stockForSize(colorSlug, size, dtfDesignId, plainStock, designStock)` = `designAvailable ? min(plainQty, designQty) : 0`; every other availability helper (`variantInStock`, `productInStock`, `availableSizes`) is built on top of it. No denormalized cache — acceptable at this catalog's traffic and size.
6. **Null design / missing pool row means unavailable, never an error.** Every existing product ships with `dtfDesignId = null`; every availability, validation, feed, and JSON-LD path must treat that (and a missing `PlainTshirtStock` row) as zero/unavailable, not a thrown exception.

## Risks / Trade-offs

- **[Risk] Every product goes unavailable on launch** (empty pools, no `dtfDesignId` assigned) → **Mitigation**: this is a deliberate, accepted trade-off (see Migration Plan) over fabricating numbers from data that no longer means what it used to; documented and communicated as a required one-time admin pass, not a defect.
- **[Risk] `colorSlug` string matching (no FK) between `ProductVariant`/`VariantSizeStock` and `PlainTshirtStock` could silently drift** (typo'd color, or an admin deletes a raw-material row still referenced by a product) → **Mitigation**: the product editor's color field offers a datalist of existing `PlainTshirtStock` colors; deleting a plain-tee row that's still in use shows a warning (not a hard block, since there's no FK to enforce it) naming how many products it affects.
- **[Risk] `editItems`' size-change path resolves a new pool via a second DB round-trip inside the transaction** → **Mitigation**: resolves from the *frozen* old row's `colorSlug`, not the variant's live color, keeping the same freeze-at-order-time guarantee; acceptable extra latency for a low-volume admin action.
- **[Trade-off] The admin products-list "Total stock" column becomes a boolean "Available" badge** instead of a number, since summing a *shared* pool across products would overstate real availability — a deliberate simplification, not an oversight.

## Migration Plan

Two hand-authored Postgres migrations (no `prisma migrate dev` — this environment has no reachable database; see `docs/superpowers/plans/2026-07-11-tshirt-raw-material-inventory.md` Task 1 and Task 21 for the exact SQL):

1. **Migration A (additive, ships with the app code)**: create `PlainTshirtStock` and `DtfDesign` (empty), add `Product.dtfDesignId` (nullable), add `OrderItem.plainTshirtStockId`/`dtfDesignId` (nullable). Fully additive — safe to apply ahead of or alongside the code deploy.
2. **Deploy the app code** (all 20 implementation tasks).
3. **One-time admin pass**: visit `/admin/inventory` and enter real Plain T-Shirt Stock and DTF Design quantities; visit each product in `/admin/products` and assign its design. Every product reads as unavailable until this is done — expected, not a bug.
4. **Migration B (cleanup, ships only after 1–3 are confirmed live)**: `ALTER TABLE "VariantSizeStock" DROP COLUMN "stock"`. Must wait — the pre-deploy app code still reads/writes that column until the new code is actually serving traffic.

**Rollback**: reverting the app code alone is safe at any point before Migration B (the additive columns are simply unused by old code). Reverting after Migration B would require re-adding the column, which is why it's sequenced strictly last and separately.

## Open Questions

None outstanding — all decisions above were resolved during brainstorming (see the design spec's "Decisions" section for the recorded user confirmations on pooling/rollout, design linkage, and consumption ratio).
