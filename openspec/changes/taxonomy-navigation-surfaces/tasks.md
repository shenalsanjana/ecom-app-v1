> Step-by-step code, tests and commands for every task below live in
> `docs/superpowers/plans/2026-09-01-taxonomy-navigation-surfaces.md`. Each group
> here is one task in that plan. Follow the plan; this file tracks progress.

## 1. Shared breadcrumb and trail builder

- [ ] 1.1 Failing test for `taxonomyTrail` — trail shape per level, the sub-category crumb appearing only with a design and never linked, the final crumb never carrying an href, a design without a department dropped rather than given an invented path
- [ ] 1.2 Run it and confirm it fails
- [ ] 1.3 Write `app/_lib/taxonomy-trail.ts`
- [ ] 1.4 Failing test for `Breadcrumb` — labelled nav wrapping an ordered list, exactly one crumb marked current, links only where an href exists, separators hidden from assistive technology
- [ ] 1.5 Write `app/_components/ui/breadcrumb.tsx`
- [ ] 1.6 Both files pass; full suite; commit

## 2. Taxonomy counts

- [ ] 2.1 Failing test for `countsByDesign` / `countsByDepartment` — per-design totals, department sums, zero rather than absent for an empty department, a product under no listed department ignored
- [ ] 2.2 Run it and confirm it fails
- [ ] 2.3 Write `app/_lib/taxonomy-counts.ts`
- [ ] 2.4 Test passes; full suite; commit

## 3. Photo support on the tint tile

- [ ] 3.1 Failing tests — tint stays the ground, light ink over a photo, image and scrim rendered, `image: null` byte-identical to omitting it
- [ ] 3.2 Run them and confirm they fail
- [ ] 3.3 Add the optional `image` to `app/_components/ui/tint-tile.tsx`
- [ ] 3.4 Tests pass; full suite; type check; **contrast gate must not move**; commit

## 4. Header mega-menu

- [ ] 4.1 Failing test for `navColumns` — one column per department through the derived rule, empty departments omitted, a department with designs but no sub-category still included
- [ ] 4.2 Write `app/_lib/taxonomy-nav.ts` (server-side only; it reaches Prisma)
- [ ] 4.3 Failing test for `MegaMenu` — every department and design emitted as a link, plain `/categories` link when fewer than two columns
- [ ] 4.4 Write `app/_components/header/mega-menu.tsx` as a client leaf taking plain columns, with plain `next/link` links
- [ ] 4.5 Make `SiteHeader` async, read the taxonomy once, render `MegaMenu` in place of the Shop nav link
- [ ] 4.6 Tests pass; full suite; type check; commit

## 5. Taxonomy in the mobile sheet

- [ ] 5.1 Failing test for `TaxonomySection` — departments and designs listed, still rendered with a single department, null when there are none, following a link dismisses the sheet
- [ ] 5.2 Run it and confirm it fails
- [ ] 5.3 Add the exported `TaxonomySection` and its accordion to `mobile-nav.tsx`; pass `columns` from the header
- [ ] 5.4 Test passes; full suite; type check; commit

## 6. Browse filter tree

- [ ] 6.1 Failing test for `FilterTree` — every department and design linked plus All, counts beside designs as well as departments, zero rather than blank, the selected design and its parent active and nothing else
- [ ] 6.2 Run it and confirm it fails
- [ ] 6.3 Write `app/_components/categories/filter-tree.tsx`
- [ ] 6.4 Use it from `app/categories/(index)/page.tsx`, add the breadcrumb, delete the inline count arithmetic
- [ ] 6.5 Test passes; full suite; type check; lint; commit

## 7. One breadcrumb everywhere

- [ ] 7.1 `getProductDetail` includes the department on the design it already joins
- [ ] 7.2 PDP renders the shared breadcrumb from the full trail
- [ ] 7.3 Both inline navs on the category routes replaced
- [ ] 7.4 Delete `app/_components/product/breadcrumb.tsx`; confirm nothing imports it
- [ ] 7.5 Verify by grep that no `?category=` link points at `/` any more
- [ ] 7.6 Full suite; type check; commit

## 8. Designs carry their photo

- [ ] 8.1 `DesignSummary` gains `image`; the departments read selects it
- [ ] 8.2 Failing test — the design grid hands each tile its own image, and `null` where there is none
- [ ] 8.3 Pass `image` through in `design-grid.tsx`
- [ ] 8.4 Test passes; full suite; **type check is the real gate** (the widened type ripples through fixtures); commit

## 9. Card sub-labels

- [ ] 9.1 `cardSelect` gains the design→department relation; `ProductView` gains `departmentName`
- [ ] 9.2 Failing test for `cardEyebrow` — department then design, and the design alone with no dangling separator
- [ ] 9.3 Add `cardEyebrow` to `app/_lib/category-label.ts` and use it in the card
- [ ] 9.4 Test passes; full suite; type check; commit

## 10. Validation

- [ ] 10.1 `npm run test` — report the real count, not a predicted one
- [ ] 10.2 `npx tsc --noEmit` — expect clean
- [ ] 10.3 `npm run check:contrast` — expect all pairs and tints at AA
- [ ] 10.4 `npm run lint` — expect no new findings beyond the 7 pre-existing problems in files this change does not touch, verified with `git diff --name-only`
- [ ] 10.5 Record that `npm run build` and `npm run test:e2e` cannot run on this dev box, and that this change carries more build risk than its predecessors because of the database-sourced `next/image` src — do not report either as passing
- [ ] 10.6 Commit any incidental fixes separately from the feature work
