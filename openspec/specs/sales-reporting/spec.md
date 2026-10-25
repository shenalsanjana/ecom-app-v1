# Sales reporting specification

## Purpose

Provide accurate, private POS and online sales reporting without changing checkout, payment or inventory behavior.

## Requirements

### Requirement: Unified sales use payment receipt dates

The system SHALL report each non-cancelled PAID or COD_COLLECTED order once, using its payment receipt date in Asia/Colombo. POS and online totals SHALL reconcile to the combined total. Pending and failed payments SHALL remain separate from sales. Where exact historical payment evidence is unavailable, dates SHALL be explicitly marked as estimates.

#### Scenario: Duplicate payment callbacks

- **WHEN** a payment provider repeats a successful callback
- **THEN** the original receipt timestamp remains unchanged and the order is counted once

### Requirement: Costs and refunds preserve accounting history

The system SHALL snapshot unit costs, original selling prices, product and category identifiers when saving order items. A missing cost SHALL remain unknown and SHALL prevent a fabricated gross profit. Authorized historical cost corrections SHALL be audited. Verified refund records SHALL enforce remaining paid-value and return-quantity limits, idempotency and unique active references per order. Recording or voiding a refund SHALL NOT issue payments or change physical stock.

#### Scenario: Partial merchandise and delivery refund

- **WHEN** an admin records a completed refund with its reference and date
- **THEN** merchandise and delivery credits affect their respective totals on that refund date
- **AND** only explicitly recorded resellable units already returned to inventory recover their saved cost
- **AND** a cancelled-order refund is shown separately without reducing already-excluded sales twice

### Requirement: Reports remain simple, private and bounded

Admins SHALL have today, Monday-based week, calendar month and inclusive custom ranges; revenue, net merchandise sales, paid order count, discounts, refunds and gross profit; daily, channel, payment, product, category/collection and size breakdowns; best sellers; and shared-material low-stock alerts. Matching CSV and native XLSX reports SHALL be downloadable only by admins. Cost data SHALL remain private. The visible dashboard SHALL refresh every 15 seconds, pause polling in hidden tabs, and retain clearly labelled stale data on temporary errors.

#### Scenario: Oversized report

- **WHEN** a range exceeds 366 days, 5,000 paid orders, 2,000 refunds or 20,000 combined lines
- **THEN** the system asks the admin to narrow the range instead of returning partial figures
- **AND** read-only database transactions, timeouts, a short cache and deduplicated concurrent reads protect normal order processing
