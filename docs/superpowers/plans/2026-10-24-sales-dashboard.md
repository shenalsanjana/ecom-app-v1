# Plan

1. Add backward-compatible reporting metadata, costs and refund tables; generate a private Prisma client.
2. Snapshot costs/category/list price and settlement timestamps in existing order/payment paths.
3. Build deterministic cents-based reporting/allocation, bounded read service/cache and admin API/exports.
4. Add product/historical cost controls and audited refund recording/voiding without payment or inventory side effects.
5. Build the simple live sales page using existing admin components and shared inventory alerts.
6. Validate meaningful unit/database/browser flows, types/lint and resource-limited build. Archive, merge, migrate safely, canary, activate app only and verify read-only live data/health.
