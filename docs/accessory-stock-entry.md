# Accessory stock entry

Status: deployed as `dressingbear-app:accessory-stock-20261015`, image digest
beginning `66fa78026e94`. This release includes the existing inventory grouping
and Stage 01 transaction safety changes.

In Admin → Inventory → Accessories, **Add accessory stock** opens two options:

- **New accessory:** enter item/colour, size/dimensions, and an opening quantity
  of zero or more. Include the accessory type in the description when different
  blanks would otherwise have the same colour and size.
- **Restock existing:** select an existing accessory and enter the quantity to
  add. The action increments the current balance atomically, preserving sales
  that occurred after the form loaded. It also increments the stock version so
  older absolute count edits cannot overwrite the result.

Existing quantity cells remain available for correcting a physical count.
Shared T-shirt/accessory entries remain read-only in the shared view and cannot
be restocked through the accessory form. Uninitialized accessory variants get
their original colour/size key when their first quantity is entered.

The new `StockGroup` field retains an accessory's classification before it has
any linked products. Migration
`20261015150000_accessory_stock_group` marks existing accessory-only stock using
the same department and department-history rules as the inventory page.
It preserves stock IDs, balances, versions and order references. Shared entries
continue to be identified from product mappings. The existing colour/size
uniqueness rule remains in effect; creating a duplicate never overwrites stock.

## Verification and rollout

All 49 focused tests passed, covering new-item validation, duplicates, stock grouping, admin
authorization, additive restocking, integer limits, stale count versions, shared
stock rejection and existing variant keys. Targeted lint and incremental
TypeScript checks also passed, running sequentially in a resource-limited container.

The exact migration was also exercised in an isolated temporary PostgreSQL
database with accessory, T-shirt, renamed department, shared and unlinked stock
fixtures. Checks confirmed unchanged original balances/IDs, correct defaults,
additive quantities, version guards and overflow protection. That test database
was removed. A fresh production backup also restored successfully into a
separate database, and the migration preserved all 25 stock records and balances
on that copy before production rollout.

The production build passed with 0.75 CPU, a 1,100 MiB memory limit, a 512 MiB
Node heap and sequential compiler workers. It reused the existing toolchain
and build cache. Only the 55 approved source files were overlaid on the previous
release base; unrelated workspace changes were excluded.

Candidate HTTP checks exercised authenticated creation, duplicate rejection,
restocking, an intervening sale, stale count rejection and invalid quantities
against the restored test database. Anonymous creation was rejected. The live
migration then applied successfully, preserving stock IDs, quantities and
versions: 20 T-shirt entries and five accessory entries remained, with no
negative balances. Only the app container was replaced.

Live HTTPS health, storefront and inventory JavaScript checks returned 200.
Read-only authenticated checks confirmed the add button and both options.
Anonymous inventory access redirects to login; anonymous reconciliation remains
401. The existing reconciliation schedule remains active with exactly one entry.

Release metadata, source hashes, validation logs, protected database backups and
the reusable webpack cache are retained in the ignored private directory
`tmp/operations/accessory-stock-rollout-20261015/`. The temporary candidate,
restored database, copied source, packaging files and credentials were removed.
Source changes remain uncommitted in the shared workspace.

The previous image is retained as
`dressingbear-app:before-accessory-stock-20261015`. For an app rollback, retag that
image as `dressingbear-app:latest`, recreate only the app through Compose with
`--no-build`, and verify health. Keep the additive migration and reconciliation
schedule in place. Check CPU, RAM and Docker usage first and run steps sequentially.
