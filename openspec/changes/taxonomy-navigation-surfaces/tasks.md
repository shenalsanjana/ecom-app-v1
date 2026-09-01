> Step-by-step code, tests and commands for every task below live in
> `docs/superpowers/plans/2026-09-01-taxonomy-navigation-surfaces.md`. Each group
> here is one task in that plan. Follow the plan; this file tracks progress.

## 1. Shared breadcrumb and trail builder

- [x] 1.1 Failing test for `taxonomyTrail` — trail shape per level, the sub-category crumb appearing only with a design and never linked, the final crumb never carrying an href, a design without a department dropped rather than given an invented path
- [x] 1.2 Run it and confirm it fails
- [x] 1.3 Write `app/_lib/taxonomy-trail.ts`
- [x] 1.4 Failing test for `Breadcrumb` — labelled nav wrapping an ordered list, exactly one crumb marked current, links only where an href exists, separators hidden from assistive technology
- [x] 1.5 Write `app/_components/ui/breadcrumb.tsx`
- [x] 1.6 Both files pass; full suite; commit

## 2. Taxonomy counts

- [x] 2.1 Failing test for `countsByDesign` / `countsByDepartment` — per-design totals, department sums, zero rather than absent for an empty department, a product under no listed department ignored
- [x] 2.2 Run it and confirm it fails
- [x] 2.3 Write `app/_lib/taxonomy-counts.ts`
- [x] 2.4 Test passes; full suite; commit

## 3. Photo support on the tint tile

- [x] 3.1 Failing tests — tint stays the ground, light ink over a photo, image and scrim rendered, `image: null` byte-identical to omitting it
- [x] 3.2 Run them and confirm they fail
- [x] 3.3 Add the optional `image` to `app/_components/ui/tint-tile.tsx`
- [x] 3.4 Tests pass; full suite; type check; **contrast gate must not move**; commit

## 4. Header mega-menu

- [x] 4.1 Failing test for `navColumns` — one column per department through the derived rule, empty departments omitted, a department with designs but no sub-category still included
- [x] 4.2 Write `app/_lib/taxonomy-nav.ts` (server-side only; it reaches Prisma)
- [x] 4.3 Failing test for `MegaMenu` — every department and design emitted as a link, plain `/categories` link when fewer than two columns
- [x] 4.4 Write `app/_components/header/mega-menu.tsx` as a client leaf taking plain columns, with plain `next/link` links
- [x] 4.5 Make `SiteHeader` async, read the taxonomy once, render `MegaMenu` in place of the Shop nav link
- [x] 4.6 Tests pass; full suite; type check; commit

## 5. Taxonomy in the mobile sheet

- [x] 5.1 Failing test for `TaxonomySection` — departments and designs listed, still rendered with a single department, null when there are none, following a link dismisses the sheet
- [x] 5.2 Run it and confirm it fails
- [x] 5.3 Add the exported `TaxonomySection` and its accordion to `mobile-nav.tsx`; pass `columns` from the header
- [x] 5.4 Test passes; full suite; type check; commit

## 6. Browse filter tree

- [x] 6.1 Failing test for `FilterTree` — every department and design linked plus All, counts beside designs as well as departments, zero rather than blank, the selected design and its parent active and nothing else
- [x] 6.2 Run it and confirm it fails
- [x] 6.3 Write `app/_components/categories/filter-tree.tsx`
- [x] 6.4 Use it from `app/categories/(index)/page.tsx`, add the breadcrumb, delete the inline count arithmetic
- [x] 6.5 Test passes; full suite; type check; lint; commit

## 7. One breadcrumb everywhere

- [x] 7.1 `getProductDetail` includes the department on the design it already joins
- [x] 7.2 PDP renders the shared breadcrumb from the full trail
- [x] 7.3 Both inline navs on the category routes replaced
- [x] 7.4 Delete `app/_components/product/breadcrumb.tsx`; confirm nothing imports it
- [x] 7.5 Verify by grep that no `?category=` link points at `/` any more
- [x] 7.6 Full suite; type check; commit

## 8. Designs carry their photo

- [x] 8.1 `DesignSummary` gains `image`; the departments read selects it
- [x] 8.2 Failing test — the design grid hands each tile its own image, and `null` where there is none
- [x] 8.3 Pass `image` through in `design-grid.tsx`
- [x] 8.4 Test passes; full suite; **type check is the real gate** (the widened type ripples through fixtures); commit

## 9. Card sub-labels

- [x] 9.1 `cardSelect` gains the design→department relation; `ProductView` gains `departmentName`
- [x] 9.2 Failing test for `cardEyebrow` — department then design, and the design alone with no dangling separator
- [x] 9.3 Add `cardEyebrow` to `app/_lib/category-label.ts` and use it in the card
- [x] 9.4 Test passes; full suite; type check; commit

## 10. Validation

- [x] 10.1 `npm run test` — report the real count, not a predicted one
- [x] 10.2 `npx tsc --noEmit` — expect clean
- [x] 10.3 `npm run check:contrast` — expect all pairs and tints at AA
- [x] 10.4 `npm run lint` — expect no new findings beyond the 7 pre-existing problems in files this change does not touch, verified with `git diff --name-only`
- [x] 10.5 Record that `npm run build` and `npm run test:e2e` cannot run on this dev box, and that this change carries more build risk than its predecessors because of the database-sourced `next/image` src — do not report either as passing
- [x] 10.6 Commit any incidental fixes separately from the feature work

## Validation record (2026-09-01)

- `npm run test` — **914 passed, 114 files** (baseline before this change: 869 / 106).
- `npx tsc --noEmit` — clean. Widening `DesignSummary` rippled into 9 fixture
  files, which gained `image: null`; widening `ProductView` rippled nowhere,
  because no test constructs one.
- `npm run check:contrast` — all pairs and tints at AA; the gate did not move.
- `npm run lint` — 7 problems (4 errors, 3 warnings), all pre-existing and all
  in files this change does not touch (`order-items-editor.tsx`,
  `product-picker.tsx`, `buy-box-client.tsx`, `image-gallery.tsx`, `sms.ts`,
  `taxonomy-route.test.ts`), verified against `git diff main --name-only`.
- `npm run build` — **attempted and it does not pass here**, but not because of
  this change: there is no `.env`/`.env.local` on this box (only the
  `.example` files), so the build compiles successfully and then fails during
  prerender with `Environment variable not found: DATABASE_URL` on
  `/account/addresses`, a route this change does not touch. Compilation
  completing is real evidence, prerendering is not. **A green build is still
  owed in CI or against the VPS.**
- `npm run test:e2e` — **not run**; Playwright needs the same database.

### Residual risk on the new `next/image` call

`TintTile` now renders `next/image` with a `src` read from `Design.image`.
`next.config.ts` allows exactly one remote host (`picsum.photos`).
The only writer of that column is `/api/admin/upload-local`, which returns a
root-relative `/uploads/<name>` — a path `next/image` serves with no
`remotePatterns` entry needed, so the ordinary case is safe. But
`CategoryCreateSchema.image` is an unvalidated trimmed string: an admin who
pastes an external URL would get a request-time
"hostname is not configured under images" error on any page rendering that
tile. Worth either validating the field or widening `remotePatterns` before
this reaches production with operator-entered URLs.
