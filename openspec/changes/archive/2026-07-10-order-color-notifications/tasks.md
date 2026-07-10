## 1. Checkout snapshots

- [x] 1.1 Update `app/checkout/__tests__/actions.test.ts` to expose the product variant mock and cover database color/SKU snapshots, prepaid notification details, and product/variant mismatch rejection.
- [x] 1.2 Update `app/checkout/actions.ts` to select variant `productId`, `color`, and `sku`, reject mismatched product/variant pairs before writes, and create order items from the database variant snapshot.
- [x] 1.3 Run `npm.cmd run test -- app/checkout/__tests__/actions.test.ts` and confirm the checkout snapshot tests pass.

## 2. Order detail propagation

- [x] 2.1 Extend the shared `OrderItem` notification type in `app/_lib/mailer.ts` with nullable `color` and `sku`.
- [x] 2.2 Update `app/_lib/payments/__tests__/order-finalization.test.ts` and `app/admin/orders/__tests__/actions.test.ts` to assert color/SKU survive prepaid finalization and admin resend details.
- [x] 2.3 Update `app/_lib/payments/order-finalization.ts` and `app/admin/orders/actions.ts` so every `OrderDetails.items` mapper preserves `color` and `sku`.
- [x] 2.4 Run `npm.cmd run test -- app/_lib/payments/__tests__/order-finalization.test.ts app/admin/orders/__tests__/actions.test.ts` and confirm mapper propagation tests pass.

## 3. Customer confirmation notifications

- [x] 3.1 Add `app/_lib/__tests__/mailer-confirmation.test.ts` to verify customer confirmation email includes color, includes size, omits SKU, and handles legacy missing color/size.
- [x] 3.2 Update `app/_lib/__tests__/order-sms.test.ts` and `app/_lib/__tests__/order-notifications.test.ts` to verify SMS item summaries and notification dispatcher item passing.
- [x] 3.3 Update `app/_lib/mailer.ts` customer confirmation formatting to render color/size attributes while omitting SKU.
- [x] 3.4 Update `app/_lib/sms.ts` to support bounded confirmation item summaries with at most two product-color pairs and `+N more`.
- [x] 3.5 Update `app/_lib/order-notifications.ts` to pass `{ name, color }` items into `sendOrderConfirmationSms` without changing idempotency.
- [x] 3.6 Run `npm.cmd run test -- app/_lib/__tests__/mailer-confirmation.test.ts app/_lib/__tests__/order-sms.test.ts app/_lib/__tests__/order-notifications.test.ts` and confirm customer notification tests pass.

## 4. Admin email item snapshots

- [x] 4.1 Update `app/_lib/__tests__/mailer-dispatch.test.ts` to assert dispatch, pending-payment, and failure-alert emails show product, color, size, SKU, quantity, unit price, and line total.
- [x] 4.2 Update `app/_lib/mailer.ts` admin item text/HTML helpers so dispatch, pending-payment, and failure-alert emails share full snapshot formatting.
- [x] 4.3 Run `npm.cmd run test -- app/_lib/__tests__/mailer-dispatch.test.ts` and confirm admin email tests pass.

## 5. Admin order views

- [x] 5.1 Add `app/_lib/order-item-display.ts` and `app/_lib/__tests__/order-item-display.test.ts` for compact admin item summaries and em-dash fallback formatting.
- [x] 5.2 Update `app/_lib/__tests__/admin-orders-queries.test.ts` and `app/_lib/admin-orders.ts` so `listOrders()` selects the first two item snapshots plus `_count.items`.
- [x] 5.3 Update `app/_components/admin/orders/orders-table.tsx` to render compact `Product - Color xquantity` item lines and `+N more`.
- [x] 5.4 Update `app/_components/admin/orders/order-items-editor.tsx` and `app/admin/orders/[id]/page.tsx` to show each item's saved color and SKU as read-only detail fields.
- [x] 5.5 Run `npm.cmd run test -- app/_lib/__tests__/order-item-display.test.ts app/_lib/__tests__/admin-orders-queries.test.ts` and confirm admin view tests pass.

## 6. Validation

- [x] 6.1 Run the focused Vitest command from `docs/superpowers/plans/2026-07-09-order-color-notifications.md` Task 6 and confirm all targeted files pass.
- [x] 6.2 Run `npm.cmd run test` and confirm the full Vitest suite passes.
- [x] 6.3 Run `npm.cmd run build`; if restricted font/network behavior or another environment-only condition blocks completion, capture the exact output.
- [x] 6.4 Run `npm.cmd run test:e2e -- tests/e2e/order-confirmation.spec.ts tests/e2e/admin-orders.spec.ts`; if local environment requirements are missing, capture the exact output.
- [x] 6.5 Run `git diff --check` and `git status --short`; confirm only intentional feature files and pre-existing unrelated files remain.
