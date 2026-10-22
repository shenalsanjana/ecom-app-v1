# Inventory hierarchy and centralized blank stock

Status: deployed and verified in production as
`dressingbear-app:inventory-hierarchy-20261016`, with migration
`20261016090000_inventory_hierarchy` applied.

## Review findings

The original catalog has Department → Design → Product relationships. `Design`
is also used as a storefront category, so changing it into a stock hierarchy
would alter existing category pages and product assignments. Individual printed
designs, including Keep Smiling, Stitch and Pooh tote bags, are separate store
products sharing the same physical blank.

Blank stock was globally unique by colour and size. That prevents independent
white M balances for regular, oversized and raglan shirts. Checkout, stock
availability, admin order edits and seed data all used that implicit match.
There was no independent inventory category tree or physical product parent.

The new structure keeps storefront taxonomy intact and adds explicit links from
each offered variant/size to its shared blank stock record.

| Existing gap | Improvement |
| --- | --- |
| Colour/size was globally unique across all physical item types | Scoped uniqueness and explicit blank IDs distinguish shirt styles and accessory families |
| Store categories doubled as inventory grouping | Separate inventory categories and physical parents preserve storefront merchandising |
| Designs were separate products without a common physical parent | Existing designs appear beneath their shared parent without changing their store pages |
| A category tree could create ambiguous totals | Parent/category totals count each physical stock ID once |
| A size change could match another style's colour/size | Order edits resolve within the original frozen blank family |
| No category/subcategory lifecycle controls | Create, rename, move and delete-empty controls with cycle and stale-edit guards |

## Resulting structure

```text
T-Shirts
  Regular T-Shirts
    Regular T-Shirt
      Shared blank stock by colour / size
      Designs → existing store products → colour variants / sizes
  Oversized T-Shirts
    Oversized T-Shirt
      Shared blank stock by colour / size
      Designs → existing store products → colour variants / sizes
  Oversized Raglan T-Shirts
    Oversized Raglan T-Shirt
      Shared blank stock by colour / size
      Designs → existing store products → colour variants / sizes
Accessories
  Bags
    Premium Canvas Cotton Tote Bag with Zipper
      Shared Natural Ivory blank stock
      Designs
        Keep Smiling Canvas Cotton Tote Bag
        Stitch Canvas Cotton Tote Bag
        Pooh / other existing tote designs
  Pouches
    Cotton Canvas Zipper Pouch
    Pouch
```

Categories, subcategories, physical parents and individual designs expand and
collapse using native keyboard-accessible disclosure controls. Inventory has
search, stock status, separate print inventory and an assignment review queue.
Staff can create, rename, move or delete empty custom categories and physical
parents. Built-in shirt groups remain stable. Category writes reject cycles,
stale edits and moves across the T-Shirts/Accessories boundary. T-shirt parents
must be placed under one of the three styles so they remain visible.

Existing product pages and checkout identifiers stay unchanged. The product
editor now selects its physical parent and the blank used by every colour/size.
Several designs, or several compatible parents within one shirt style, can
deliberately reference the same stock ID. Cross-style and apparel/accessory
stock mismatches are rejected. Unconfigured cells remain unavailable for sale.

## Stock invariants

- A blank's balance lives only in its existing `PlainTshirtStock` row. Categories,
  physical parents and printed designs do not receive duplicate balances.
- Uniqueness is scoped to physical parent + colour + size. Different shirt
  styles may therefore have identical colour/size labels without sharing stock.
- Offered sizes use `VariantSizeStock.plainTshirtStockId`; checkout and admin
  order changes consume that exact record. Order items retain their frozen
  stock IDs for restoration and order history.
- Admin size changes resolve the new size inside the original blank's physical
  family, using its frozen colour rather than the product's current mapping.
- Restocking increments the latest balance atomically. Count edits require the
  displayed stock version; both operations advance the version. Integer limits
  are checked. Linked stock and stock with order history cannot be deleted.
- Adding a new blank configures matching unconfigured variant/size cells under
  its physical parent. Existing explicit shared links are preserved during edits.
- Available units exclude stock already allocated to orders, preserving the
  existing order-reservation semantics. The interface labels counts accordingly.
  These figures are not a separate on-hand or warehouse valuation ledger.
- Category/parent totals count each physical stock ID once. Per-design
  availability is derived from its blank and shared DTF print balances and is
  never summed as additional physical stock.

## Database changes and migration

`20261016090000_inventory_hierarchy` adds indexed `InventoryCategory` and
`InventoryProduct` relationships, optional parent links on existing products and
blank records, and explicit blank links on offered sizes. It scopes stock
uniqueness to the physical parent. A partial unique index retains the old
colour/size rule for unassigned legacy rows.

The migration assigns clear existing products to their physical parents and
freezes their current colour/size stock matches before relaxing the old global
index. A blank receives an owner only when all linked products agree. Ambiguous
or orphan records stay in the review queue; quantities are never divided,
merged or invented.

On the restored production snapshot, all 20 T-shirt entries mapped to Oversized
T-Shirts, including Salmon Pink. Five accessory entries mapped to their three
existing physical families. Every offered size retained a valid stock link.
Regular and Raglan start empty. All original blank quantities, versions, IDs,
catalog URLs/prices, print assignments and historical order stock references
were verified unchanged. The seed script also uses scoped stock keys and
explicit size bindings; it was not run against production.

## Standards and practical scope

[Shopify's inventory item model](https://shopify.dev/docs/api/admin-graphql/latest/objects/InventoryItem)
separates an inventory item from its quantities at locations.
[Odoo's variant model](https://www.odoo.com/documentation/19.0/applications/sales/sales/products_prices/products/variants.html)
tracks stock per variant, including attributes such as size and colour. Here,
the existing shared raw-material pools remain the stock authority: store designs
reference physical blanks rather than each carrying another count. This is a
project-specific design suited to the existing made-to-order blank/print model.

The system currently uses one shared stock location. The reviewed repository
has online checkout and admin order operations, but no separate POS checkout
module. Existing sales/restoration paths continue using the centralized pool
helpers; a future POS must use the same transactional acquire/restore helpers
and recorded stock IDs. This change does not claim to implement a POS.

Separate finished-goods balances, purchasing/receipts, an adjustment audit
ledger, barcode/SKU management per stockable size, multiple locations and
offline POS reconciliation remain separate improvements. They should be added
when those workflows are defined, rather than inferred from category labels.

## Verification and release

- The full regression run passed 1,108 tests across 129 files. Six existing
  opt-in PostgreSQL tests were skipped in that run.
- The final focused run passed 85 checks, including 16 real PostgreSQL tests for
  hierarchy, style placement, independent store merchandising and shared stock.
- Targeted lint, schema validation and the full TypeScript check passed. An
  initial smaller checker heap exhausted its limit without affecting production;
  the successful check used the existing fixed 0.75 CPU / 1,100 MiB container
  limit and an 896 MiB Node heap.
- Migration snapshots compare original stock records, catalog identifiers and
  order stock references before and after migration.
- Checks run sequentially in capped containers after checking CPU, available
  RAM and Docker usage. The release compiled once in an isolated container,
  reusing installed dependencies and the existing tooling image.
- The isolated release source passed another 70 focused checks, including 16
  PostgreSQL checks, and the full TypeScript check. Its production build passed.
- Candidate HTTP checks verified separate style balances, two designs sharing
  one blank, restocking after a simulated allocation, stale-count rejection,
  category lifecycle guards and unauthenticated mutation rejection. All fixture
  changes were confined to a restored test database and cleaned up afterward.
- A fresh backup preceded the brief app-only cutover. Migration comparisons
  preserved all 25 stock entries, 42 catalog products and 92 order-item stock
  references. The stock entries held 184 available units at verification.
- Live read-only checks passed for all six authenticated inventory tabs, the
  product binding editor, public storefront and existing tote page, the new
  inventory JavaScript asset, login protection and the protected reconciliation
  endpoint. Docker health passed and the existing reconciliation cron remained
  active with exactly one scheduled entry.

The release includes the migration, regenerated client and stock-reader/write
paths together. Its 79 staged file hashes were verified before packaging.
Unrelated local image/UI/nginx changes were excluded. The rollback image is
retained as `dressingbear-app:before-hierarchy-20261016`; private rollout
evidence, backups and the release manifest are under
`tmp/operations/hierarchy-rollout-20261016/`.

After separate style pools exist, a rollback to the old colour/size-based app
is unsafe: it cannot distinguish those pools. Prefer a compatible fix forward,
or verify that no duplicate colour/size pools exist before reverting app code.
Do not drop the new data or merge balances to make rollback work.

Private validation artifacts and pre-change snapshots are retained under
`tmp/operations/inventory-hierarchy-20261016/`. Baseline copies of previously
modified files use `.before.txt` extensions to keep them out of TypeScript's
source scope and document the narrowly scoped release changes.
