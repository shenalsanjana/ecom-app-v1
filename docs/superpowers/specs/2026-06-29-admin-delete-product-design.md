# Admin Product Deletion (safe hard-delete) — Design Spec

- **Date:** 2026-06-29
- **Change name:** admin-delete-product
- **Status:** Approved design, pending implementation plan

## Goal

Let an admin permanently delete a product from the catalog, but **only when the
product has no order history**. Products that have ever been ordered must be
Archived (the existing soft-delete) instead of deleted.

## Background / Current State

- Products already support a soft-delete via `Product.archived: Boolean`
  (`archiveProduct` / `unarchiveProduct` in
  [app/admin/products/actions.ts](../../../app/admin/products/actions.ts));
  storefront queries filter `archived: false`.
- `OrderItem` references `Product` **with no `onDelete` rule**, so a raw hard
  delete would violate the foreign key and break order history. `OrderItem`
  stores a denormalized `name`/`price`/`size` snapshot, but the FK constraint
  still blocks deletion.
- These relations to `Product` are `onDelete: Cascade` today and will clean up
  automatically: `ProductImage`, `Review`, `WishlistItem`.

## Decisions

1. **Safe hard-delete only.** Delete is permitted only if the product has zero
   `OrderItem` rows. Otherwise the action returns an error telling the admin to
   Archive instead.
2. **Safety boundary = orders only.** Reviews and wishlist entries are allowed
   to cascade away with the product (they belong to the product being removed).
   They do **not** block deletion.
3. **UI placement = table row, all products.** A Delete button appears in every
   product row in the admin products table, on both the Active and Archived
   tabs.
4. **Confirmation = `confirm()` / `alert()`** matching the existing admin
   pattern — no new modal component.
5. **No schema change.** Because deletion is blocked before any `OrderItem`
   could be orphaned, the un-constrained `OrderItem → Product` FK is never
   violated. Adding a DB-level constraint is intentionally out of scope.

## Design

### Server Action — `deleteProduct(id)`

Location: [app/admin/products/actions.ts](../../../app/admin/products/actions.ts)

- `await requireAdmin()` (same guard as every other mutation).
- Guard: `prisma.orderItem.count({ where: { productId: id } })`. If `> 0`,
  return `{ success: false, error: "This product has order history and can't be
  deleted. Archive it instead." }`.
- Otherwise `prisma.product.delete({ where: { id } })`. Cascade relations
  (`ProductImage`, `Review`, `WishlistItem`) are removed automatically.
- On success call the existing `revalidate()` helper
  (`revalidatePath("/admin/products")` + `revalidateTag("catalog", "max")`),
  then `return { success: true }`.
- Wrap in try/catch returning `{ success: false, error }`, matching the other
  actions' `ActionResult` shape.

### UI — Delete button

Location:
[app/_components/admin/products/products-table.tsx](../../../app/_components/admin/products/products-table.tsx)

- A **Delete** button in every product row, next to Archive/Unarchive, on both
  tabs.
- On click: `confirm("Delete '<name>'? This cannot be undone.")`. If confirmed,
  call `deleteProduct(id)`.
- On `{ success: false }`: `alert(r.error)`. On success: `router.refresh()` so
  the row disappears.

## Testing

- Action test: deleting an order-free product succeeds and removes the row.
- Action test: deleting a product that has an `OrderItem` returns the guard
  error and leaves the product intact.
- Action test: a non-admin caller is rejected (`requireAdmin`).
- Cascade test: deleting a product with images/reviews/wishlist entries removes
  those rows too.
- E2E optional (admin-only table action).

## Trade-offs / Notes

- The order-history guard is enforced only in the Server Action, not at the DB
  level. Acceptable because all writes go through the action; a DB constraint
  would be a separate, larger migration.
