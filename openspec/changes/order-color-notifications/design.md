## Context

The product color-variants capability already models color and SKU on `ProductVariant`, and `OrderItem` already has nullable `variantId`, `color`, and `sku` snapshot columns. The current checkout flow validates stock by variant/size, but it does not load the variant's `productId` or display `color`, and it writes `OrderItem.color` from the cart payload.

The notification layer then narrows order items to name, size, price, and quantity. As a result, confirmation emails, confirmation SMS, admin dispatch emails, pending-payment emails, failure alerts, and admin order views cannot reliably show the saved color/SKU snapshot even when the database row has it.

## Goals / Non-Goals

**Goals:**

- Make checkout snapshot `OrderItem.color` and `OrderItem.sku` from the selected database variant.
- Reject product/variant mismatches before order creation or stock decrement.
- Preserve `color` and `sku` through COD checkout, prepaid payment finalization, admin resend, dispatch, pending-payment, and failure-alert mappers.
- Show color in customer order-confirmation email and a bounded confirmation SMS item summary.
- Show full item snapshots in itemized admin emails and admin order list/detail views.
- Keep legacy null color/SKU values safe to render.

**Non-Goals:**

- Add new database columns or migrate historical null snapshots.
- Change customer dispatch or cancellation messages, which remain status-only.
- Add color to customer account order-history pages.
- Let admins edit an order item's variant, color, or SKU.
- Change courier payload descriptions.

## Decisions

### Use server-authoritative variant snapshots

Checkout will load each selected `ProductVariant` with `id`, `productId`, `color`, `sku`, and size-stock cells. The order item row and notification details will use the database `color`/`sku`, not the cart-provided color.

Alternative considered: pass the cart color through. That is weaker because the cart can be stale or manipulated.

Alternative considered: resolve live variant data every time an order is displayed. That is weaker because old orders must remain historically accurate if product variants are renamed, archived, or deleted.

### Validate variant ownership before writes

Checkout will compare each cart line's claimed `productId` with the selected variant's `productId`. A mismatch returns a validation error before entering the order transaction.

This keeps stock decrement and order creation atomic for valid carts while preventing a client from pairing one product name/price with another product's variant.

### Keep nullable item snapshots in shared detail types

The mailer-facing `OrderItem` type will add optional nullable `color` and `sku`. Every mapper that builds `OrderDetails` will pass the fields through.

This keeps legacy rows valid and avoids forcing admin/customer templates to query live product data.

### Split customer and admin formatting

Customer confirmation copy will show product name, color, size, quantity, and line total. It will not show SKU. Confirmation SMS will show at most two `Product (Color)` pairs, append `+N more` for omitted order lines, and enforce a 160-character application-level body budget.

Admin itemized emails and admin order views will show product name, color, size, SKU, quantity, unit price, and line total. Missing admin fields will render as an em dash.

This split keeps customer copy concise while giving staff the detail needed for fulfillment and support.

### Keep notification idempotency unchanged

The confirmation dispatcher will pass item summaries into `sendOrderConfirmationSms`, but it will not change the `confirmationSmsSentAt`, `emailSent`, or release-on-failure behavior.

The change is content-only for notifications, not a retry or delivery-semantics change.

## Risks / Trade-offs

- SMS length pressure → The SMS formatter will shorten product names before color names and will include only two order lines plus `+N more`.
- Legacy null snapshots → Customer templates will omit missing optional attributes; admin templates and screens will render em dashes.
- Wider admin order-list query → The list query will select only the first two item snapshots plus `_count.items`, not every item on every row.
- Email HTML injection risk → New color and SKU values will go through the existing HTML escaping helpers before rendering.
- Environment-only validation failures → Build or e2e failures caused by blocked font network access, unavailable PostgreSQL, or missing browser dependencies will be reported with exact commands and observed output.

## Migration Plan

No schema migration is required. Deployment is a code-only change that begins writing authoritative color/SKU snapshots for new orders after release.

Rollback is a normal code rollback. Existing nullable `OrderItem.color` and `OrderItem.sku` data remains compatible with both old and new code paths.

## Open Questions

None.
