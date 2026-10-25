# Design

Use the existing order and inventory sources, integer-cent immutable sales metadata, an audited refund ledger, a bounded/cached read-only reporting service and a foreground-only live admin view. Paid dates are confirmed as the reporting basis. Missing historical costs/dates remain visible and are not fabricated. Refund recording does not issue provider refunds or restock inventory.
