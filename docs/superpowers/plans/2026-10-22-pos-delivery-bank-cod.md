# Implementation plan

1. Extend validation and transactional order creation with optional delivery, authoritative delivery pricing and COD/bank rules.
2. Add compact delivery/customer fields, totals and draft recovery to POS.
3. Expose existing dispatch, address, tracking and collection actions for shop delivery orders; update receipts and rate labels.
4. Verify references, delivery zones, stale quotes, inventory/retries, COD lifecycle and existing methods in isolated tests and browsers.
5. Run constrained checks/build, verify candidate, deploy app only with rollback, and run read-only live checks.

Validation completed 2026-10-23: the full unit suite passed 1,261 tests. Two additional mocked courier payload regressions then passed with the existing eight courier cases. All 16 isolated PostgreSQL tests passed. All ten cashier browser flows passed across runs (seven payment/catalogue/receipt flows, followed by the COD delivery lifecycle, lost-response recovery and mobile flows after correcting test selectors). Changed-code TypeScript and lint passed. Production webpack compilation and generation passed in a 640 MiB container.

The COD browser run exercised both delivery zones, draft recovery, truthful unpaid receipts, editing the delivery address/contact, Royal Express manual dispatch, tracking updates, delivered status and COD collection. API booking payloads were mocked; no real courier booking, customer notification or production sale was made for testing. Production generation is repeated after isolated browser execution to remove test caches before packaging. Candidate and live checks are read-only; activation replaces only the app and retains the prior image.
