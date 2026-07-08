# Order Color Snapshots and Notifications Design

**Date:** 2026-07-08  
**Status:** Approved during brainstorming  
**Related capability:** `openspec/specs/product-color-variants/spec.md`

## Context

The product-color-variants change added nullable `color` and `sku` snapshots to `OrderItem`, and checkout currently writes those columns. However, checkout takes `color` from the cart payload instead of the selected database variant. The shared notification `OrderItem` type omits both fields, so confirmation emails, SMS messages, admin emails, and admin order views either lose the selected color or cannot display it.

This change makes the saved color authoritative and carries the historical item snapshot through the messages and admin screens where item details are shown.

## Goals

- Snapshot the database variant's display color and SKU on every new order item.
- Reject a cart line when its claimed product does not own its selected variant.
- Show color in the customer order-confirmation email.
- Show a bounded product-color summary in the customer confirmation SMS.
- Show complete item snapshots in itemized admin emails and admin order views.
- Preserve existing notification idempotency, retry behavior, and legacy-order compatibility.

## Non-goals

- Adding color to customer dispatch or cancellation messages, which are status-only messages and do not currently list items.
- Changing customer account order-history pages.
- Changing courier payload descriptions or permitting admins to replace an order item's variant/color.
- Adding new order columns or migrating historical null color/SKU values.
- Broad checkout price or product-name hardening unrelated to the color snapshot.

## Chosen approach

Use a server-authoritative historical snapshot. At checkout, load each selected `ProductVariant` with its `productId`, `color`, `sku`, and size-stock cells. Validate that the variant belongs to the cart line's product, then write the database color and SKU to `OrderItem`.

This is preferred over passing through the cart color because client data can be stale or manipulated. It is preferred over resolving the live variant whenever an order is displayed because variant names can change and variant relations can later become null. The snapshot keeps old orders historically accurate.

## Data model and propagation

No Prisma schema or database migration is required. `OrderItem.color` and `OrderItem.sku` already exist and remain nullable for legacy orders and deleted historical relations.

Checkout's variant query will select:

- `id`
- `productId`
- `color`
- `sku`
- the size-stock cells used by existing inventory validation

The checkout flow will use the selected variant record as the source for `OrderItem.color` and `OrderItem.sku`. A product/variant mismatch will return a validation error before order creation or stock decrement.

The shared mailer-facing `OrderItem` type will add nullable `color` and `sku`. Every mapper that creates `OrderDetails` will preserve those fields, including:

- initial checkout and COD confirmation;
- prepaid payment finalization;
- admin resend-confirmation actions;
- admin dispatch booking and notification actions;
- pending-payment and failure-alert paths.

Nullable fields keep existing orders valid. Customer messages omit unavailable attributes; admin views display an em dash for missing historical values.

## Customer notifications

### Confirmation email

Each item line will show:

- product name;
- color when present;
- size when present;
- quantity;
- line total.

SKU remains out of customer-facing copy. Both plain-text and HTML email bodies use the same attributes, and all HTML values remain escaped.

Example:

```text
Cat Tee (Color White, Size M) x2 - Rs 4,000
```

### Confirmation SMS

The confirmation SMS will retain the order reference and total, and add a compact item summary. The summary contains at most the first two order lines as `Product (Color)` pairs. If more lines exist, it appends `+N more`.

Product names may be shortened to fit the configured one-segment character budget, but a present color must not be truncated away. The formatter calculates the available summary budget from the fixed message text so the full message remains within one SMS segment.

Example:

```text
Dressing Bear: order WEB1001 confirmed. Cat Tee (White), Dino Tee (Pink) +1 more. Total Rs 6240. We'll text you when it ships.
```

If a legacy item has no color, its product name is still included. Dispatch and cancellation email/SMS templates remain unchanged.

## Admin emails

Itemized admin emails will display the complete snapshot for every item:

- product name;
- color;
- size;
- SKU;
- quantity;
- unit price;
- line total.

This applies to dispatch-booking notifications, pending-payment notifications, and failure alerts. Shared plain-text and HTML item-formatting helpers should be used so these templates cannot drift. Customer confirmation formatting remains separate because it intentionally omits SKU and unit price.

## Admin order views

### Orders list

The existing Items column will replace its count-only value with up to two compact lines in the form `Product · Color ×quantity`. When an order has more than two lines, the cell appends `+N more`. The order query will select the item fields needed for this summary rather than only `_count.items`.

This keeps the table scannable while letting staff identify common single- and two-line orders without opening each order.

### Order detail

The item editor/view will show every item's:

- product name;
- color;
- size;
- SKU;
- quantity;
- unit price;
- line total.

Color and SKU are read-only historical snapshots. Existing quantity and size editing remains available under the current lifecycle rules. Changing an item's variant or color is outside this change.

## Error handling and compatibility

- A product/variant mismatch fails validation before any write or inventory change.
- Missing legacy `color` or `sku` never prevents a view or notification from rendering.
- Customer messages omit missing optional attributes.
- Admin screens and admin emails render missing color/SKU as an em dash.
- Existing notification claim/release logic and idempotency timestamps remain unchanged.
- Existing email HTML escaping also applies to color and SKU.

## Testing

Automated coverage will include:

- checkout replaces a spoofed cart color with the database variant color;
- checkout rejects a product/variant ownership mismatch;
- COD and prepaid order-detail mappers preserve color and SKU;
- admin resend, dispatch, pending-payment, and alert paths preserve item snapshots;
- confirmation email plain text and HTML include color and omit customer-facing SKU;
- admin email plain text and HTML include color, size, SKU, quantity, unit price, and line total;
- confirmation SMS includes at most two product-color pairs, appends `+N more`, respects its character budget, and handles missing legacy colors;
- admin list summaries and detail rows render colors and legacy null fields correctly.

Repository validation for implementation is:

```text
npm run build
npm run test
npm run test:e2e
```

Any environment-only failure, such as an unavailable local PostgreSQL database during build or end-to-end testing, must be reported with the successful checks rather than silently skipped.

## Success criteria

The change is complete when a newly placed order always stores the selected database variant's color, customer confirmation messages identify the ordered colors, and admins can see the saved color and full item details in itemized emails, the compact orders list, and the full order page without breaking legacy orders.
