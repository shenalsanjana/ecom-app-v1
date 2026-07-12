<!-- Condensed tracking checklist. Full bite-sized TDD steps (test → implement →
verify → commit, with complete code) live in
docs/superpowers/plans/2026-07-11-tshirt-raw-material-inventory.md — that plan
is the source of truth for HOW; this file tracks WHICH of its 21 tasks are done. -->

## 1. Schema and shared helpers

- [x] 1.1 Add `PlainTshirtStock`, `DtfDesign`, `Product.dtfDesignId`, `OrderItem.plainTshirtStockId`/`dtfDesignId` to `prisma/schema.prisma`; write hand-authored Migration A (Plan Task 1)
- [x] 1.2 Add shared `acquireItemPools`/`restoreItemPools` transaction helpers in `app/_lib/inventory-pools.ts` (Plan Task 2)
- [x] 1.3 Rewrite `app/_lib/variants.ts` derived-availability helpers on the two-pool model (Plan Task 3)

## 2. Checkout and order-lifecycle restore paths

- [x] 2.1 Rewrite `app/_lib/order-validation.ts` to validate against both pools (Plan Task 4)
- [x] 2.2 Rewire `app/checkout/actions.ts` to acquire both pools and snapshot pool ids onto `OrderItem` (Plan Task 5)
- [x] 2.3 Simplify `applyItemChanges` in `app/_lib/admin-orders.ts` to pure item math (Plan Task 6)
- [x] 2.4 Rewire `cancelOrderTx`/`editItems` in `app/admin/orders/actions.ts` onto the shared pool helpers (Plan Task 7)
- [x] 2.5 Rewire `finalizeFailedPayment` in `app/_lib/payments/order-finalization.ts` onto the shared pool helpers (Plan Task 8)

## 3. Admin Inventory section

- [ ] 3.1 Add `app/_lib/admin-inventory.ts` read queries (Plan Task 9)
- [ ] 3.2 Add `app/admin/inventory/actions.ts` CRUD server actions (Plan Task 10)
- [ ] 3.3 Build the `/admin/inventory` page and its Plain T-Shirt Stock grid + DTF Designs table components (Plan Task 11)
- [ ] 3.4 Add "Inventory" to the admin nav (Plan Task 12)

## 4. Product editor

- [ ] 4.1 Add required `dtfDesignId` to product create/update; drop `stock` from the size-input schema in `app/admin/products/actions.ts` (Plan Task 13)
- [ ] 4.2 Add the DTF Design dropdown, drop the per-size stock input, add a color datalist across `variant-draft.ts`/`variant-editor.tsx`/`product-form.tsx`/the new+edit pages (Plan Task 14)

## 5. Admin dashboard and product list

- [ ] 5.1 Recompute the dashboard low-stock KPI from the two pools in `app/_lib/admin-kpis.ts` (Plan Task 15)
- [ ] 5.2 Rework the admin products low-stock tab (`getLowStockProductIds`/`resolveProductWhere`) and the "Total stock" column → "Available" badge (Plan Task 16)

## 6. Storefront

- [ ] 6.1 Rewire `app/_lib/products.ts` (`cardSelect`, `attachAggregates`, `getProductDetail`, `getProducts`) onto the two pools (Plan Task 17)
- [ ] 6.2 Wire `buy-box-client.tsx`, `product-jsonld.tsx`, and the PDP page onto the two pools (Plan Task 18)
- [ ] 6.3 Wire the Meta catalog feed route onto the two pools (Plan Task 19)

## 7. Seed data and cleanup migration

- [ ] 7.1 Seed demo raw-material pools and per-product design assignment in `prisma/seed.ts` / `app/_data/mock.ts` (Plan Task 20)
- [ ] 7.2 Full-project `tsc --noEmit` and `npm run test` pass with zero errors/failures (Plan Task 20, Step 3-4)
- [ ] 7.3 Write Migration B (drop `VariantSizeStock.stock`) — do not apply until Tasks 1–20's app code is deployed and confirmed live (Plan Task 21)

## 8. Rollout (post-merge, outside this codebase change)

- [ ] 8.1 Apply Migration A via the deploy pipeline and deploy the app code
- [ ] 8.2 One-time admin pass: enter real Plain T-Shirt Stock and DTF Design quantities in `/admin/inventory`; assign a design to every existing product in `/admin/products`
- [ ] 8.3 Apply Migration B once 8.1–8.2 are confirmed live
- [ ] 8.4 Browser spot-check: PDP size greys out/selects correctly; Inventory grid saves; a design set to 0 takes every product using it out of stock end-to-end
