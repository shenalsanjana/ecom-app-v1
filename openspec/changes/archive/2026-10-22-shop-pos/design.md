# Design

The canonical design and validation scope are recorded in
[the shop POS design](../../../../docs/superpowers/specs/2026-10-22-shop-pos-design.md).
The implementation sequence is in
[the plan](../../../../docs/superpowers/plans/2026-10-22-shop-pos.md).

The register reuses terminal Order status, shared stock allocation, audit
context and database-verified admin guards. Prices and tender/change are checked
in integer cents. A serializable transaction and canonical request hash make
retries safe across concurrent online sales. Browser session storage preserves
unconfirmed submissions for retry. Receipts use saved order snapshots and the
current store identity, and print within an 80 mm paper width.
