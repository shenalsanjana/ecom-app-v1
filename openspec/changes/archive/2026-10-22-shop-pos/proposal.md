# Shop POS

## Why

The shop needs to record counter sales against the same stock as its online
store, with a cashier-friendly register and printable receipt.

## Changes

- Add an admin register using existing published products and size SKUs.
- Record cash and externally approved card payments as paid, collected orders.
- Allocate shared stock and staff audit movements atomically with retry protection.
- Add numbered receipts, receipt printing and order sales-channel filtering.

## Impact

Adds optional POS metadata to Order and a separate receipt-number sequence.
Existing orders default to ONLINE. Requires applying the database migration
before rolling out the updated app. No new dependencies or payment integrations.

Design: [2026-10-22-shop-pos-design.md](../../../../docs/superpowers/specs/2026-10-22-shop-pos-design.md).
