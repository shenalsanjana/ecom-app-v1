# Tasks

> Implemented and committed to `main` (cb14f2f, f3f6a5b, 33a9a27) prior to OpenSpec registration. All boxes reflect completed work.

## 1. Server Action

- [x] 1.1 Add `deleteProduct(id)` to `app/admin/products/actions.ts`: `requireAdmin()`, guard on `prisma.orderItem.count`, refuse with the order-history message when `> 0`, else `prisma.product.delete`, then `revalidate(id)`
- [x] 1.2 Wrap the count + delete in a single try/catch returning the generic error on failure
- [x] 1.3 Add Vitest cases: blocks when count > 0 (no delete call), deletes when count 0, generic error on throw

## 2. UI

- [x] 2.1 Create `app/_components/admin/products/delete-product-button.tsx` (client): `confirm()` → `deleteProduct(id)`, `alert()` on failure, `router.refresh()` on success
- [x] 2.2 Add an Actions column (header + per-row cell) to `app/_components/admin/products/products-table.tsx` rendering the button in every row

## 3. Verification

- [x] 3.1 `npm run test` green; `npx tsc --noEmit` exit 0
- [ ] 3.2 Browser manual verification: delete a product with vs. without order history (deferred — requires admin login + database)
