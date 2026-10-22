# Inventory stock groups

Deployed on 2026-10-15 at 14:37 UTC as
`dressingbear-app:inventory-groups-20261015`, digest beginning `d3cb84d26927`.

## Using inventory

Inventory now has separate Plain T-Shirts, Accessories and DTF Designs tabs.
The Accessories tab shows linked product names, colour/item, dimensions,
quantity and stock status. Expand a product name to see the other products
using the same blank. Each blank balance appears once, even when several
printed designs use it.

The existing data grouped into 20 T-shirt stock entries and five accessory
entries during verification. Grouping follows linked product departments and
supports renamed accessory departments through slug history. New blanks not
yet linked to an accessory product remain in the original Plain T-Shirt group.

An active accessory size without a stock record shows "Not set". Entering its
first quantity creates that colour/size stock record. Existing quantities use
the stock version check, so a count made before a sale cannot overwrite it.
Archiving products retains their existing accessory stock; discontinued offers
without a stock record do not generate new stock setup rows.

If the same colour and size is used by both T-shirts and accessories, it appears
in a separate Shared stock tab with links to both product types. Quantity edits
are disabled in that view so staff can review the mapping before adjusting it.

This release groups the existing stock records. It preserves their IDs and
order references and does not introduce a new stock model or migrate data.

## Validation and rollout

- 26 focused tests passed, covering grouping and the existing stock actions.
- TypeScript and targeted lint checks passed before deployment.
- The release used the previously deployed base plus the six approved inventory
  files. All 53 overlaid source files were checked before cutover; unrelated
  local image, product UI and nginx edits were excluded.
- One successful production build used a disk-backed workspace, a 512 MiB Node
  heap, one sequential compiler worker, 0.75 CPU and a 1,100 MiB container limit.
  Existing dependencies were reused.
- Candidate and live checks verified database health, storefront responses,
  authentication redirects for every inventory tab, and the new inventory
  component and JavaScript asset. The asset also returned 200 through HTTPS.
- The reconciliation endpoint still rejects unauthenticated requests, and its
  existing schedule remains active with exactly one cron entry.

Only the app container was replaced. No database migration or reconciliation
configuration change was needed. Source changes remain uncommitted in the
shared checkout.

Private release hashes, build settings and validation logs are retained under
`tmp/operations/inventory-rollout-20261015/`. Generated webpack cache is retained
there when available for reuse in later isolated builds. Copied release source,
packaging files and the candidate container were removed after verification.

The previous app is retained as
`dressingbear-app:before-inventory-groups-20261015`, which includes the Stage 01
transaction fixes. To roll back this UI release, retag that image as
`dressingbear-app:latest`, recreate only the app through Compose with `--no-build`,
and verify health. Keep the current database schema and reconciliation schedule.
Check CPU, available RAM and Docker usage first, and run operational steps
sequentially.
