# Permanent size identities and sale SKUs — Stage 2A

User-approved scope: stable product/colour/size records and permanent sale SKUs.
Additional collections, draft publishing, stock modes and POS remain later stages.

Status: deployed on 18 October 2026 at 22:16 Asia/Colombo as
`dressingbear-app:catalogue-sku-stage2a-20261018`.

## Behaviour

- Existing offered size IDs and shared blank bindings are preserved by migration.
- Each size receives a database-generated unique DBV- code. Codes are permanent,
  contain at least six digits and may have gaps; they do not depend on names.
- Product saves update retained sizes in place. Removed sizes are archived;
  re-adding the same size under the same colour restores its ID and SKU.
- The editor shows/copies size SKUs. Product, inventory and admin-order product
  searches accept SKUs and exclude archived sizes from saleable results.
- New checkout/admin order lines snapshot the selected size SKU. Size changes
  on new SKU-bearing order lines resolve the matching SKU within the frozen
  stock family, or clear it when no such sale identity exists. Quantity-only
  edits and legacy order snapshots retain their SKU.
- Shared blanks and prints keep their existing balances and transactional
  allocation/restoration rules. Size records do not own inventory quantities.
- The optional legacy colour SKU and marketing-feed identifiers remain compatible.
  The DBV- namespace is reserved for generated sale SKUs.
- Database guards reject identity rewrites and direct size-row deletion. Existing
  explicit product deletion still cascades; order snapshot strings survive it.

## Release safety

The additive migration is 20261018090000_stable_size_skus. Its backfill changes
only the new SKU/archive columns and migration metadata, not original size IDs,
stock quantities, product URLs or order records. A database sequence generates
codes safely under concurrent writes, including beyond six digits.

Readers and writers must ship together. Stage 1 is not a general rollback once
sizes are archived: it cannot filter those rows and attempts destructive size
rebuilds, which the new database guard rejects. Use an archive-aware compatible
release or a validated fix forward; never drop sale identities to run old code.

Build from the exact deployed Stage 1 archive, with reviewed feature overlays.
Pre-existing local gallery, image and nginx edits remain excluded. The product
reader receives only the archived-size filters, preserving its deployed image
behaviour. No dependency install, seed or unrelated service rebuild is needed.

Private baseline, test and release evidence is retained under
`tmp/operations/catalogue-sku-stage2a-20261018/`.

## Validation and deployment

- 1,146 distinct regression checks passed across the full run and corrected
  targeted runs; six existing opt-in checks were skipped. The initial full run
  had four payment-configuration failures from inherited live-mode settings.
  Both affected test files passed with an isolated unit-test environment;
  payment implementation was unchanged.
- The regression run includes 24 real PostgreSQL checks: 16 hierarchy checks
  and eight SKU checks covering IDs, archive/re-add, ownership, concurrent
  last-unit allocation, immutable identities and admin order SKU snapshots.
- All 509 source files passed TypeScript validation in 26 sequential batches.
  Monolithic checks exceeded the bounded heap; batching retained compiler
  options and shared global declarations. Final changed-file lint passed.
- One build attempt was stopped when server headroom fell. The successful
  retry disabled the old webpack cache, used one worker, 0.5 CPU, 640 MiB RAM
  and a 384 MiB heap, and kept at least 444 MiB available RAM. A resource guard
  monitored the retry. No dependencies were installed.
- Candidate HTTP checks passed for stable IDs/SKUs through editing, immediate
  archive visibility in admin and the cached storefront, restored identities,
  SKU search/copy controls, authentication and unchanged shared quantities.
- Fresh before/after migration backups were validated. All 357 size IDs and
  bindings survived, with 357 unique SKUs. Original data across all 26 compared
  application tables was identical before and after migration and app restart.
- Read-only live checks passed for SKU controls/search, all inventory tabs,
  existing deleted-order handling, checkout action registration and HTTPS
  health/storefront/feed/assets. Authentication and database settings remained
  unchanged. No negative blank/print stock was found.
- The homepage and feed were revalidated against current production stock
  because balances changed after the test snapshot. The existing reconciliation
  cron remains active with exactly one entry.
- Browser visual review remains pending; this environment has no browser.

The source archive retains the exact build source and its 30-file manifest.
This deployment record was added afterward. The current release is the first
archive-aware recovery baseline; the older Stage 1 image is not a general
rollback for archived size records. Original stock quantities and order/payment
records were preserved; no stock-lifecycle or POS changes were introduced.
