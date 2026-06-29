## Context

Products already support a soft-delete (`Product.archived`) with Archive/Unarchive actions and storefront filtering. The gap is permanent removal. The risk is order history: `OrderItem` references `Product`, and that history must never be destroyed. Full design rationale: `docs/superpowers/specs/2026-06-29-admin-delete-product-design.md`.

## Goals / Non-Goals

**Goals:**
- Let an admin permanently delete a product that has no order history.
- Guarantee order history is never orphaned or destroyed.
- Reuse the existing admin action conventions (`requireAdmin`, `ActionResult`, `revalidate`).

**Non-Goals:**
- Deleting/anonymizing products that have been ordered (Archive remains the path).
- Any Prisma schema/migration change.
- A bulk-delete UI.

## Decisions

- **Guard on `OrderItem` count, not a schema change.** `deleteProduct(id)` counts `OrderItem` rows for the product; if `> 0` it returns a refusal message ("...has order history... Archive it instead."), else `prisma.product.delete`. Chosen over adding an `onDelete` rule because blocking-before-delete is simpler and keeps order history fully intact. The existing `OrderItem → Product` FK (`onDelete: Restrict`) is a database backstop that converts any TOCTOU race into a caught generic error rather than data loss.
- **Cascade the dependent rows.** `ProductImage`, `Review`, and `WishlistItem` are already `onDelete: Cascade`, so they clean up automatically — no extra code.
- **Confirm/alert UX in a table-row client component.** A `DeleteProductButton` leaf client component mirrors `StockQuickEdit`: `useTransition`, `confirm()` before acting, `alert()` on failure, `router.refresh()` on success. It sits in a new Actions column rendered for every row (both tabs).

## Risks / Trade-offs

- [Guard enforced only in the Server Action, not at the DB level] → Acceptable: all writes go through the action; the FK `Restrict` is the hard backstop. A DB-level rule would be a larger, separate migration.
- [TOCTOU: an order created between the count and the delete] → The FK `Restrict` makes `delete` throw, which is caught and returned as a generic error; no orphaned data. Only cost is the generic message instead of the specific one.
