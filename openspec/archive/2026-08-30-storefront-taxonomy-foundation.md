# 2026-08-30 — storefront-taxonomy-foundation

Replaced the flat `Category` model with a two-level **Department → Design** taxonomy: schema,
migration, seed, routing and redirects. Everything else the storefront canvas layers on top of
this taxonomy (home sections, mega-menu, filter tree, PDP breadcrumbs) was deliberately left out
of scope and is unblocked by this landing.

## Highlights

- **Rename, not drop-and-recreate.** The live `Category` rows already *were* designs (`cat`,
  `dino`, `bear` map 1:1 onto the canvas tints), so `Category` → `Design` preserves rows, FKs and
  the slug-history cascade, and a `Department` parent was added above it. `Product.categorySlug`
  → `designSlug`; `departmentSlug` is denormalised onto `Product`.
- **Nested URLs are derived, not stored.** `/categories/[...slug]` builds
  `/categories/{dept}/{design}` from a design's *current* department. Live indexed URLs survive:
  `/categories/cat` 308s (not a meta refresh) to `/categories/women/cat`. `cat` and `dino` are
  deliberately left unrenamed, which holds the redirect surface at one row per design — so
  single-segment resolution must check current designs **before** either history table.
- **Seed:** 4 departments, 23 designs, from the same shared source the tints come from.
- **Contrast gate widened** to every department and design tint. `Cap` ships as `#A59585`, not the
  canvas's `#8E7A66`, which measures 3.51:1 and fails AA; the suite pins it so a revert fails loudly.
- **Admin:** design image became optional (persists as `NULL`) and department is required on create
  and update. `updateCategory` now re-stamps `Product.departmentSlug` inside the transaction — it
  was the second write path to that invariant and had been silently leaving products behind when a
  design moved department. That is exactly the first post-deploy action an operator takes, since the
  migration backfills every pre-existing design to `women`.
- **`/categories` no longer advertises empty departments.** `scripts/deploy.sh` runs
  `prisma migrate deploy` and never seeds, so production has all four departments but only two
  designs; both department lists now filter through `showsNavDropdown`.

## Validation

Run on merged `main` (`e406c51`):

- `npm run test` ✅ **849/849** across 101 files
- `npx tsc --noEmit` ✅ clean
- `npm run check:contrast` ✅ **35/35** (8 pairs + 27 tints)
- `npm run build` and `npm run test:e2e` — **not run locally.** `DATABASE_URL` points at the
  docker-compose host `postgres`, unreachable from this dev box, so build-time prerender and the
  Playwright redirect specs cannot execute here. Type checking moved into CI at `fa9e62d`, so the
  typecheck gate does run there; the build and e2e still owe a green run in CI or against the VPS.

## Open items

- **Production seeding has no safe path** (`DEPLOY_OVH.md` §4.8). The skip guard counts departments
  and the migration always inserts four, so `npm run db:seed` always no-ops on production; the only
  override, `FORCE_SEED=true`, prunes the catalog to the 3-entry mock and would delete every real
  product, cascading to images, reviews and wishlist items. Two pre-deploy checks are recorded
  there: a `Category` slug colliding with a department slug, and the `women` backfill — which must
  only be re-filed once the `Product.departmentSlug` fix is deployed.
- **Follow-ups from design spec §9**, each independent and now unblocked: **B** home sections
  ("Shop by category" / "Shop by design"), **C** header mega-menu, **D** browse filter tree,
  **E** PDP and card breadcrumbs. When B is specced, the canvas's 3.8s tile rotation needs a
  reduced-motion design that keeps every slide *reachable*, not merely frozen — the same class of
  bug fixed for the marquee at `39ef139`.

## References

- Design spec: `docs/superpowers/specs/2026-08-30-storefront-taxonomy-foundation-design.md`
- Plan: `docs/superpowers/plans/2026-08-30-storefront-taxonomy-foundation.md`
- Implementation: `feat/storefront-taxonomy-foundation`, merged `--no-ff` at `8ed2952` (15 commits)
- **No OPSX change directory.** This went brainstorm → plan → implement without `/opsx:propose`, so
  there were no deltas to `/opsx:sync` and no artifact bundle to archive under
  `openspec/changes/archive/`. The main specs had drifted from the shipped code and were reconciled
  directly on `docs/opsx-sync-taxonomy` (`07ad70a`, merged `e406c51`): added
  `openspec/specs/storefront-taxonomy/spec.md`, corrected `admin-category-management` (image now
  optional, department required, retired slugs redirect to the nested path) and
  `home-conversion-signals` (tints live on the design row, not a code-only slug map).
