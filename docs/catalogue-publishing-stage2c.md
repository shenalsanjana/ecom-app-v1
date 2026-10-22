# Stage 2C — draft and published products

Approved and deployed on 19 October 2026. Production became healthy at
16:35 Asia/Colombo (11:05 UTC).

Publication is independent of archiving. Existing products migrate as published
and keep their archive flags; new records default to draft. Published product
edits keep their publication state unless staff explicitly unpublish or save
as draft. Existing product IDs, size SKUs, collection memberships and physical
stock links are retained.

The editor provides **Save draft**, **Publish**, **Save changes** and **Unpublish**
as applicable. Drafts require a name, primary collection and positive base price.
Physical family, description, print, media, colours and sizes can be completed
later. The existing creation steps remain, with optional family setup for drafts.
Products can be filtered by All, Published, Draft, Low stock and Archived. Legacy
`tab=active` links resolve to Published.

Publishing validates saved state in the product transaction: description,
physical family, required DTF print, active colours, card/detail images, offered
sizes, and matching shared blank links. Zero stock is valid and displays as
out of stock. Failed publication rolls back the whole edit.

Drafts are excluded from public product readers, direct product pages and slug
redirects, related/featured/deal lists, collection listings/counts/images, feeds,
public reviews, wishlists and new-order product pickers. New online/admin order
lines re-check publication inside their transaction using product share locks.
Unpublishing and archiving serialize with these checks, so an old cart cannot
bypass publication. Existing orders retain saved pool references; historical
edits, cancellation, restoration and payment callbacks keep their existing paths.

Publication writes expire catalogue caches immediately and invalidate the home,
product and feed paths. No public draft preview route or additional inventory
quantity is introduced.

## Validation and deployment

- 1,183 distinct tests passed across the full regression and corrected targeted
  run; six existing opt-in tests were skipped. The full run had two outdated
  query expectations, corrected and verified in its ten-test file. Original
  run results are retained alongside `regression-summary.json`.
- Fifty tests exercised PostgreSQL, including seventeen publication cases.
  All 42 existing products passed the publish-readiness audit.
- Changed-file lint, Prisma validation and all 514 TypeScript source files
  passed. Type checks used 23 successful sequential batches. One initial
  32-file batch hit its 512 MiB Node heap cap; its remaining files passed in
  groups of eight without raising the cap. Available server RAM remained
  above 1.3 GiB during that failed task.
- One production compilation succeeded in a 0.5 CPU / 640 MiB container;
  minimum available server RAM was 1,436 MiB. Packaging reused that build.
- The packaged candidate passed authenticated HTTP draft creation, incomplete
  publish rollback, complete publish, additional collection visibility,
  warm homepage/feed invalidation, ordinary published edits, unpublish,
  stale-cart rejection, stable size SKUs and unchanged physical balances.
- Next.js can stream a not-found page with HTTP 200 after sending headers.
  Direct draft checks require the not-found marker, `noindex`, and absence
  of private product content. This existing routing behavior was verified;
  a literal HTTP 404 is not asserted for streamed responses.
- Fresh production backups were saved before and after migration. All rows
  from 27 application tables were compared before migration, after migration
  and after startup, excluding only the new publication field. Original data
  was unchanged: 42 products and all 357 size IDs/SKUs were preserved. All
  existing products were backfilled as published; the new-record default is
  draft. Migration: `20261019100000_product_publication`.
- Read-only live admin/public checks passed. Homepage and feed caches were
  refreshed against production. Public HTTPS health, home, tote detail,
  catalogue feed and a JavaScript asset returned HTTP 200.
- Interactive browser visual QA remains pending; component tests and HTTP
  checks passed. No browser was installed on the VPS.

Every command was preceded by CPU, RAM and Docker checks. Tests and builds
ran sequentially with resource caps. Only feature patches against the exact
Stage 2B source were packaged; unrelated workspace changes were excluded.

Isolated fixtures/database, temporary credential files and extracted build
directories were removed after successful live checks. Backups, evidence,
source archive and the publication-aware release image were retained. The
workspace Prisma client now matches the deployed schema.

Release image: `dressingbear-app:publishing-stage2c-20261019`.
Evidence, backups, source hashes and the exact release source archive are in
`tmp/operations/catalogue-publishing-stage2c-20261019/` (private, ignored).

Once any draft exists, the previous Stage 2B image is not a general rollback:
its public readers ignore publication state. Retain the tested publication-aware
release and prefer a validated fix forward. Never drop the status column or
publish/modify drafts just to make an older image compatible.
