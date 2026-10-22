# Shop POS integration

Add an admin-only in-store register at `/admin/pos` to the existing Dressing Bear
application. With no external POS vendor identified, use the app's own catalogue,
inventory and order records. Cash and separately approved card terminal payments
are the initial tender methods; the register does not call a card gateway.

## Workflow

Search published product/colour/size options or submit a size SKU from a keyboard
scanner. Build a cart, enter cash received or an approved terminal reference, and
complete a paid, collected order. Store optional walk-in customer names without
requiring an online customer account or delivery address. Produce a numbered
receipt using store settings and frozen order-item snapshots. Add sales-channel
filtering and receipt links to the existing Orders screens.

## Transaction rules

- Read prices and exact stock mappings in the sale transaction; compare selected
  prices with the server so a changed price cannot be silently charged.
- Calculate totals/change in integer LKR cents and persist amounts using the
  existing order money format. Require sufficient cash or an exact card amount.
- Allocate existing physical and DTF pools with their shared guarded decrement
  helpers. Plain sales consume physical stock only. Stock movements include the
  authenticated cashier, order and operation key.
- Save the order, stock movements and receipt reference in one serializable
  transaction. Retry serialization conflicts up to three times.
- Use a UUID intent key and canonical payload hash to return the same receipt
  for a retry. Reject a reused key for another cashier or different details.
- Keep uncertain requests locked to their original payload in browser session
  storage until confirmed. Cache invalidation failure after commit remains a
  successful sale.
- Completed sales use the existing terminal `DELIVERED` status and `PAID`
  payment state. No online dispatch, emails, SMS or gateway actions run.

## Data and access

Add backwards-compatible optional POS fields to Order and default salesChannel
to ONLINE. Use a separate Postgres sequence for POS receipt numbers. Both pages
and server actions use the existing database-verified admin guard. Receipts stay
available with retained order history; search results exclude unpublished and
archived products, and disable unconfigured stock options.

## Validation

Validate schemas, authorization, integer money, atomic rollback, retry identity,
plain/printed allocation and shop/online last-unit contention. Browser tests use
an explicitly isolated local database and cover scanner input, cart recovery,
cash change, terminal references, receipt printing, order history and mobile
layout. Deployment must apply the included migration before the updated app.

## Scope

External POS vendors, automatic card capture, online promotions, refunds,
returns, shift accounting and offline sales are outside this initial change.
