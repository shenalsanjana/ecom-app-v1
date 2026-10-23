# POS additional costs and discounts — 2026-10-23

Added compact fixed-LKR/percentage adjustment inputs per item quantity line and for the entire bill. Costs apply first, then discounts; bill adjustments use the adjusted product total and exclude delivery, as requested. Shared integer-cent calculations drive live totals and authoritative server validation. Existing free-delivery eligibility retains its original-product-subtotal basis.

Signed amount snapshots with item/SKU and rate labels save atomically with the order and stock changes, display on receipts/order details, and remain fixed to their original pricing. Drafts and pending retries preserve adjustments. Fully discounted cash sales use zero payment, and over-discounting is rejected. No schema migration; old pending payloads remain compatible.

Validation: 1,269 unit tests, 19 isolated PostgreSQL tests, scoped types/lint, 11 cashier Chromium flows and a constrained production build. Corrected a mobile intrinsic-width overflow and verified the rebuilt app.

Design: [adjustments](../../docs/superpowers/specs/2026-10-23-pos-costs-discounts-design.md).
Plan: [implementation and validation](../../docs/superpowers/plans/2026-10-23-pos-costs-discounts.md).
