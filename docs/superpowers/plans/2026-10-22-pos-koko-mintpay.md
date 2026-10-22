# Plan

Extend shared validation, draft restore, register choices, stored payment identity and receipts. Cover provider references, exact amount, retry safety, draft restore and printed provider names with unit, isolated PostgreSQL and cashier browser checks. Build under OVH memory/CPU limits and deploy only the verified app with rollback.

Validation passed: 1,259 unit tests, 12 isolated PostgreSQL tests, eight Chromium cashier flows, scoped TypeScript for POS/order pages and lint. Production compile and generation passed sequentially in a 640 MiB container. Regenerate production static data after isolated browser checks before packaging. Release uses a private candidate, read-only smoke verification, app-only replacement and retained rollback image. No schema changes or live provider charges.
