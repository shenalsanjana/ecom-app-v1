> Step-by-step code, tests and commands for every task below live in
> `docs/superpowers/plans/2026-09-01-home-taxonomy-sections.md`. Each group here
> is one task in that plan. Follow the plan; this file tracks progress.

## 1. Shared tint tile

- [ ] 1.1 Write the failing test at `app/_components/ui/__tests__/tint-tile.test.ts` — href, label, sub-label omitted when absent, and ink chosen by measured contrast for both a light and a dark tint
- [ ] 1.2 Run it and confirm it fails on the missing module
- [ ] 1.3 Create `app/_components/ui/tint-tile.tsx` taking `{ href, label, subLabel?, hex, className? }` and painting ink via `inkFor`
- [ ] 1.4 Run the test and confirm 3 passing
- [ ] 1.5 Commit

## 2. Department cards

- [ ] 2.1 Write the failing test at `app/_components/home/__tests__/department-cards.test.ts` — production-shaped fixture renders nothing, two linked departments render and omit the empty ones, tile carries `tileName` / `note` / the row's `hex`, threshold constant is 2
- [ ] 2.2 Run it and confirm it fails on the missing module
- [ ] 2.3 Create `app/_components/home/department-cards.tsx` filtering through `showsNavDropdown` and exporting `MIN_DEPARTMENT_CARDS = 2`
- [ ] 2.4 Run the test and confirm 4 passing
- [ ] 2.5 Commit

## 3. Grouped design grid

- [ ] 3.1 Write the failing test at `app/_components/home/__tests__/design-grid.test.ts` — nested hrefs only, a department with no `subName` contributes no group, nothing renders when none qualify, groups are named by department as well as sub-category, one `h3` per group and no `h2`, threshold constant is 1
- [ ] 3.2 Run it and confirm it fails on the missing module
- [ ] 3.3 Create `app/_components/home/design-grid.tsx` filtering through `showsInDesignSection`, linking via `designPath`, exporting `MIN_DESIGN_GROUPS = 1`
- [ ] 3.4 Run the test and confirm 6 passing
- [ ] 3.5 Commit

## 4. Home page composition

- [ ] 4.1 Write the failing test at `app/__tests__/home-page.test.ts` — the taxonomy is read exactly once, both sections receive the same array instance, and the two sections sit between Featured products and Deals in that order
- [ ] 4.2 Run it and confirm the assertions fail
- [ ] 4.3 Rewrite `app/page.tsx` as an async Server Component reading `getDepartments()` once and rendering both sections in order
- [ ] 4.4 Delete `app/_components/home/category-strip.tsx` and confirm nothing still imports it
- [ ] 4.5 Run the test and confirm 2 passing
- [ ] 4.6 Commit

## 5. Footer links

- [ ] 5.1 Write the failing test at `app/_components/home/__tests__/site-footer.test.ts` — design links are nested, no flat design URL is emitted, the column caps at six, empty departments contribute nothing
- [ ] 5.2 Run it and confirm it fails
- [ ] 5.3 Rewrite the footer's link construction to read `getDepartments()` and build hrefs with `designPath`, leaving the markup and the "Categories" heading unchanged
- [ ] 5.4 Run the test and confirm 2 passing
- [ ] 5.5 Verify by grep that no flat design link remains anywhere in `app/`
- [ ] 5.6 Commit

## 6. Validation

- [ ] 6.1 `npm run test` — expect 866 across 106 files (baseline 849/101 plus 17 new)
- [ ] 6.2 `npx tsc --noEmit` — expect clean
- [ ] 6.3 `npm run check:contrast` — expect all 35 pairs and tints at AA
- [ ] 6.4 `npm run lint` — expect no new findings beyond the 4 pre-existing errors and 1 warning in files this change does not touch
- [ ] 6.5 Record that `npm run build` and `npm run test:e2e` cannot run on this dev box (`DATABASE_URL` points at the unreachable docker-compose host `postgres`) and are owed a green run in CI or against the VPS — do not report them as passing
- [ ] 6.6 Commit any incidental fixes separately from the feature work
