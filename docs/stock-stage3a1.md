# Stage 3A.1 — plain-item sales and available-stock history

Approved first slice of the [Stage 3A proposal](stock-stage3a-review.md), deployed **21 October 2026 at 10:45 Asia/Colombo (05:15 UTC)**. Production/ready-made stock and mixed fulfilment remain Stage 3A.2 and require review before implementation.

## Behaviour

The product editor offers **Printed to order — shared blank + print** and **Plain item — shared blank only**. Existing products and historical order items default to printed-to-order. Plain products still require a physical family, media, offered sizes and valid shared blank links before publication; a print is not required. Stock remains in the existing shared pools.

Availability follows the chosen rule in public lists, detail/size selection, structured data, marketing feeds, admin availability/low-stock lists and the inventory hierarchy. Draft and archive rules remain unchanged. Checkout and new admin lines save the effective rule with their exact stock IDs. Historical edits/cancellations/payment releases use those saved references, even after the product changes. A transaction rechecks publication and the selected product rule before new allocation.

Staff count adjustments require an explicit save, the displayed version and a 3–250 character reason. Receive-stock actions increment the latest balance. Current and retained legacy inventory controls send stable operation keys; a retry after a lost response cannot create another successful receipt/count. A changed payload or different actor cannot reuse an existing operation key. Serializable staff writes retry bounded serialization conflicts.

**Inventory → Movements** shows paginated available-balance history, searchable by item, reason or internal order ID. Times use Asia/Colombo. Actor IDs remain recorded; current names are displayed when available. The initial migration records current available balances as **Opening recorded available balance**. Those events are not historical receipts, physical stocktakes or reconstructed production.

## Audit guarantees

- PostgreSQL triggers record opening stock and every actual quantity change on both existing pools, in the same transaction as the balance change. Equal quantities and name-only edits create no quantity movement.
- Application transactions attach authenticated staff/customer identity or a system source, reason, order reference and operation key. Direct database quantity changes are explicitly labelled as system/database changes.
- Typed foreign keys identify the blank or print; exactly one is required. Checks enforce nonnegative before/after quantities and a matching signed delta. Pool version/event uniqueness prevents conflicting history identities.
- Quantity-changing direct database updates advance the version when necessary, preserving stale-count protection. Existing guarded sale decrements remain authoritative.
- Audit rows reject updates/deletes. Pools with movement history cannot be deleted; history is not silently removed when stock reaches zero. Empty newly created pools without movements/links/history can still be removed.
- Staff intent keys, balance changes and movements commit together. Failed allocations or audit inserts roll back the entire transaction.

Fixture teardown may truncate audit tables **only in an explicitly supplied local database ending in `_test`**. That helper lives in the test directory and has no production endpoint. Mutation tests never target production.

## Deliberate boundary

This slice does not track physical production, finished stock, on-hand quantities, returns, costing or POS checkout. Existing printed-order cancellation still releases its recorded components under the existing undispatched-order rules. Staff must not treat this as consumed-material/finished-goods support; those states and their restoration rules ship together in Stage 3A.2. Existing supplier/process work cannot be inferred from today's available balances.

Once a plain product/line or a new staff operation exists, the previous application is not a general rollback: it requires both pools and ignores receipt intent keys. Keep a compatible release and use a verified fix forward. Never change new stock modes, remove audit data or drop columns merely to make old code run.

## Validation and release

Evidence is kept in the ignored private directory `tmp/operations/stock-stage3a1-20261019/`. Only feature patches against the exact deployed Stage 2C source are included; unrelated workspace changes remain excluded. Resource checks precede commands, and tests/type checks/builds run sequentially in capped containers.

The regression evidence records **1,203 distinct passing tests**, zero remaining failures and six existing opt-in tests skipped. The passing coverage includes 70 PostgreSQL cases, 20 new in this slice. Those new cases cover plain/printed sales, shared-pool concurrency, frozen historical rules, admin changes, retries, audit atomicity/immutability and verified payment-release idempotency. A test-only product-reader option and duplicate fixture property were corrected during type checking.

All **520 TypeScript files passed in 25 sequential batches**. Schema validation passed. Changed-file lint passed with a documented exception for the unchanged `react-hooks/set-state-in-effect` issue in the live baseline buy-box component. That file retains all other lint rules; other changed files use the full lint rules.

The production image was built once, with 668 MiB minimum available server memory during the build. Verification paused during unrelated server memory pressure; no additional rebuild or dependency installation was needed. Candidate HTTP verification subsequently ran inside the capped release container against the isolated database, with 440 MiB minimum available memory and no resource stop.

Candidate checks exercised authenticated opening stock and receipts, repeat-request deduplication, required adjustment reasons, movement attribution, plain publication without a print, warm feed/structured-data availability changes, failed printed-mode rollback and preservation of unrelated balances. Successful HTTP orders were not created; order mutation tests used the isolated PostgreSQL database and mocked external providers.

Fresh backups were taken around the additive migration. All **27 original application tables** compared equal after excluding only the newly added stock-mode defaults. Preserved data includes **42 products, 357 size IDs/SKUs, 25 blank rows, 40 print rows, existing quantities and order history**. The migration added 65 opening available-balance records and retained printed-to-order defaults for existing products/order items.

Read-only live checks passed for protected admin access, product stock-mode controls, every inventory view, movement history, unique SKUs and the new product-editor JavaScript. Public HTTPS checks passed for health, home, the existing tote product, the catalogue feed and a JavaScript asset. Home/feed caches were refreshed successfully. Interactive browser visual QA remains outstanding; no browser was installed on the VPS.

Release image: `sha256:819764175197bbebe81a956cb16755fa68a8fa2bda491dc860b7a6a45b17136a`. Migration: `20261019120000_plain_sales_movements`.

The isolated test database and candidate container were removed after verification. Temporary environment files, build output and copied runtime directories were removed. Private backups, logs, the exact built-source archive and a previous host generated-client backup are retained. The live app has no mounts into this operations directory.
