## Why

Admins can hide products via Archive, but there is no way to permanently remove a product that was created in error or should never have existed. A hard delete is needed — but it must never destroy order history, which legally and operationally must be preserved.

## What Changes

- Add a `deleteProduct(id)` admin Server Action that **permanently deletes** a product **only when it has no order history** (zero `OrderItem` rows). If the product has ever been ordered, deletion is refused with a message directing the admin to Archive instead.
- Deleting a product cascades to its `ProductImage`, `Review`, and `WishlistItem` rows (existing `onDelete: Cascade` relations); the `OrderItem → Product` foreign key (`onDelete: Restrict`) is the database backstop that guarantees order history can never be orphaned.
- Add a **Delete** button to every row of the admin products table (both Active and Archived tabs) with a `confirm()` dialog; failures surface via `alert()`.
- No database schema change — deletion is blocked before any `OrderItem` could be orphaned.

## Capabilities

### New Capabilities
- `admin-product-management`: admin-side product lifecycle operations. This change introduces the **safe hard-delete** requirement (delete permitted only when no order history exists; archive remains the path for ordered products).

### Modified Capabilities
<!-- None — no existing capability's requirements change. -->

## Impact

- Code: `app/admin/products/actions.ts` (new `deleteProduct` action), `app/_components/admin/products/products-table.tsx` (Actions column), new `app/_components/admin/products/delete-product-button.tsx`.
- Data: no schema/migration change. Relies on existing FK behavior (`OrderItem`→`Product` is `Restrict`; images/reviews/wishlist `Cascade`).
- Auth: gated by the existing `requireAdmin()` guard.
- Already implemented and committed to `main` (cb14f2f, f3f6a5b, 33a9a27); this change registers it retroactively in OpenSpec.
