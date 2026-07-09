## Why

Order items already have nullable `color` and `sku` snapshot columns, but the checkout and notification flow does not consistently treat those fields as historical order data. Checkout currently accepts the cart's color value, and the shared notification/admin mappers drop color/SKU before emails, SMS, and admin screens render the order.

This makes color visibility unreliable for customers and staff, especially when product variants are renamed, deleted, or manipulated client-side.

## What Changes

- Checkout will load each selected variant's `productId`, `color`, `sku`, and size-stock cells from the database.
- Checkout will reject a cart line when the selected variant does not belong to the claimed product.
- New order items will snapshot the database variant color and SKU.
- Order-detail mappers for COD checkout, prepaid payment finalization, admin resend, admin dispatch, pending-payment, and admin failure-alert paths will preserve item color/SKU.
- Customer confirmation email will show item color and size while continuing to omit SKU.
- Customer confirmation SMS will include a bounded summary of up to two `Product (Color)` pairs and `+N more` when needed.
- Itemized admin emails will show product, color, size, SKU, quantity, unit price, and line total for every item.
- Admin order list rows will show compact product-color summaries, and the admin order detail page will show all saved item colors and SKUs.
- Legacy order items with missing color/SKU will keep rendering safely.
- Customer dispatch and cancellation notifications remain status-only and will not gain item details.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `product-color-variants`: Strengthens the existing order-line snapshot requirement so saved variant color/SKU are authoritative at checkout and visible in customer confirmations, itemized admin notifications, and admin order views.

## Impact

- Affected code: checkout server action, shared mailer types/templates, SMS templates, notification dispatcher, prepaid payment finalization, admin order actions, admin order list/detail components, and pure admin item-display helpers.
- Affected data: no schema change; existing nullable `OrderItem.color` and `OrderItem.sku` columns are reused.
- Affected tests: checkout action tests, mailer tests, SMS tests, notification dispatcher tests, prepaid finalization tests, admin order action/query tests, and item-display helper tests.
- Affected operations: implementation validation must run unit tests, build, and relevant checkout/admin Playwright flows; environment-only build/e2e failures must be reported explicitly.
