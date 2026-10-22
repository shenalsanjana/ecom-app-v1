# Simple POS catalogue implementation

Design: [Simple shop POS catalogue](../specs/2026-10-22-pos-simple-categories-design.md).

1. Return category/product identities and the complete set of published size
   options, selecting only register fields.
2. Group options into one product card and provide simple category navigation,
   local search, and a colour/size chooser. Preserve payment and retry behaviour.
3. Cover full-catalogue grouping and multi-option/category browser flows.
4. Run tests, types, lint and a constrained production build sequentially.
   Validate a candidate against an isolated test database, then perform a
   rollback-protected app-only release and read-only live checks.

Validation completed: 1,257 unit tests, 10 isolated PostgreSQL tests, and all six
Chromium cashier flows (categories, colour/size, scanner/cart recovery, cash,
card, receipt printing, lost-response recovery and phone layout). Changed POS
code and Next configuration pass scoped TypeScript and lint checks. The full
repository type-check was stopped by the host-memory guard; it is not reported
as passing.

The production webpack build passed sequential compile and generate stages in
a 640 MiB container. Generation is repeated with production settings after the
isolated browser run so test database caches never enter the release package.
The app-only rollout retains the previous image and checks candidate health,
authentication, catalogue, assets, order history and storefront before release.
