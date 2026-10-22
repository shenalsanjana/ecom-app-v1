# Stage 2B — additional store collections

Approved and deployed on 19 October 2026. The app was healthy at 02:20:17 UTC.

Products retain their existing primary collection (`designSlug`), department,
URL, variants and shared stock links. `ProductCollection` stores only additional
placements, with a unique product/collection key. Existing products start with
no additional memberships.

The product editor has **Primary collection** and a searchable, department-grouped
**Also show in** checkbox selector. Selected collections can be removed directly.
Changing the primary removes a redundant additional membership. Primary breadcrumbs
and existing URLs retain their established behaviour.

Store collection/department lists, search filters, sidebar counts, home collection
tiles and admin collection filters include additional memberships. Product-level
queries use `EXISTS`, so matching several collections still returns one product.
Department counts count a product once even when it belongs to several collections
inside the department. Archived products remain excluded from public lists.

Product saves reconcile memberships in the same transaction as the product and
variants. Older callers omitting memberships preserve them; an explicit empty array
removes them. Unknown collections fail the whole edit. Product and collection slug
renames cascade through membership links. Moving a collection changes its placement
department without changing products' primary department. Deleting an in-use
collection is blocked and reports affected products, including archived products.
Deleting a product removes its membership links and retains existing order/stock
deletion behaviour.

This stage does not add quantities, alter stock allocation, change order/payment
records, add draft publishing or introduce a POS checkout.

## Verification and deployment

- 1,160 distinct regression checks passed: 1,144 in the full suite plus the 16
  opt-in inventory hierarchy checks. Six existing Stage 1 opt-in checks were
  skipped. This includes nine new real PostgreSQL collection tests, eight SKU
  database tests, count/media checks and selector interaction tests.
- All 512 TypeScript source files passed in 26 sequential batches. Final lint
  and Prisma schema validation passed.
- One production build passed, with one worker, 0.5 CPU, 640 MiB container RAM
  and a 384 MiB Node heap. At least 1,445 MiB of server RAM remained available.
  Existing dependencies were used; no installation was required.
- The packaged candidate passed real authenticated HTTP product creation and
  editing, primary promotion, deduplication, collection/public/admin filtering,
  counts, deletion protection and immediate membership removal. IDs, size SKUs
  and blank/print balances stayed unchanged. All mutation fixtures used the
  isolated database, and were removed.
- Migration `20261019090000_additional_product_collections` was applied after a
  fresh cutover backup. All 26 original application tables compared identically
  before migration, after migration and after app startup. All 42 products and
  357 size IDs/SKUs were preserved, along with stock, orders and payment records.
  The new join table started empty.
- Only the app was recreated, using the tested image. PostgreSQL and nginx were
  not restarted or rebuilt. Unrelated workspace changes were excluded using
  feature patches against the archived Stage 2A source.
- Read-only live checks passed for public pages, protected admin routes, the
  editor, SKU search and every inventory tab. HTTPS health, home, feed, existing
  tote page and the new editor JavaScript all returned 200. Homepage and feed
  caches were explicitly refreshed against current production data.

Browser visual review remains pending; automated UI and HTTP checks are recorded
above. The archive-aware Stage 2A image is retained for recovery. Returning to it
would temporarily hide additional placements; the additive membership table can
remain. Do not return to the older Stage 1 image, which ignores archived sizes.

Release evidence, exact built source, before/after snapshots and private backups
are retained in `tmp/operations/catalogue-collections-stage2b-20261019/`.
