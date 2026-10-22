# Simple shop POS catalogue — 2026-10-22

The register shows all published products once, grouped by existing inventory
category. Category buttons and local search lead to a simple colour/size
chooser; single-option products add directly. Removing the 60-option cutoff
makes the complete catalogue available while selecting only register fields.

Scanner, cart recovery, cash/card checkout, authoritative stock checks and
pending-sale retry protection remain covered by cashier browser tests. No
schema or product-data changes are required.

Validation: 1,257 unit tests, 10 isolated PostgreSQL tests, six Chromium flows,
scoped POS/Next configuration TypeScript and lint, and a constrained production
webpack build. The full repository type-check was stopped by the memory guard.

Design: [simple catalogue](../../docs/superpowers/specs/2026-10-22-pos-simple-categories-design.md).
Plan: [implementation and validation](../../docs/superpowers/plans/2026-10-22-pos-simple-categories.md).
