> Step-by-step code, tests and commands for every task below live in
> `docs/superpowers/plans/2026-09-01-home-taxonomy-sections.md`. Each group here
> is one task in that plan. Follow the plan; this file tracks progress.

## 1. Shared tint tile

- [x] 1.1 Write the failing test at `app/_components/ui/__tests__/tint-tile.test.ts` — href, label, sub-label omitted when absent, and ink chosen by measured contrast for both a light and a dark tint
- [x] 1.2 Run it and confirm it fails on the missing module
- [x] 1.3 Create `app/_components/ui/tint-tile.tsx` taking `{ href, label, subLabel?, hex, className? }` and painting ink via `inkFor`
- [x] 1.4 Run the test and confirm 3 passing
- [x] 1.5 Commit

## 2. Department cards

- [x] 2.1 Write the failing test at `app/_components/home/__tests__/department-cards.test.ts` — production-shaped fixture renders nothing, two linked departments render and omit the empty ones, tile carries `tileName` / `note` / the row's `hex`, threshold constant is 2
- [x] 2.2 Run it and confirm it fails on the missing module
- [x] 2.3 Create `app/_components/home/department-cards.tsx` filtering through `showsNavDropdown` and exporting `MIN_DEPARTMENT_CARDS = 2`
- [x] 2.4 Run the test and confirm 4 passing
- [x] 2.5 Commit

## 3. Grouped design grid

- [x] 3.1 Write the failing test at `app/_components/home/__tests__/design-grid.test.ts` — nested hrefs only, a department with no `subName` contributes no group, nothing renders when none qualify, groups are named by department as well as sub-category, one `h3` per group and no `h2`, threshold constant is 1
- [x] 3.2 Run it and confirm it fails on the missing module
- [x] 3.3 Create `app/_components/home/design-grid.tsx` filtering through `showsInDesignSection`, linking via `designPath`, exporting `MIN_DESIGN_GROUPS = 1`
- [x] 3.4 Run the test and confirm 6 passing
- [x] 3.5 Commit

## 4. Home page composition

- [x] 4.1 Write the failing test at `app/__tests__/home-page.test.ts` — the taxonomy is read exactly once, both sections receive the same array instance, and the two sections sit between Featured products and Deals in that order
- [x] 4.2 Run it and confirm the assertions fail
- [x] 4.3 Rewrite `app/page.tsx` as an async Server Component reading `getDepartments()` once and rendering both sections in order
- [x] 4.4 Delete `app/_components/home/category-strip.tsx` and confirm nothing still imports it
- [x] 4.5 Run the test and confirm 2 passing
- [x] 4.6 Commit

## 5. Footer links

- [x] 5.1 Write the failing test at `app/_components/home/__tests__/site-footer.test.ts` — design links are nested, no flat design URL is emitted, the column caps at six, empty departments contribute nothing
- [x] 5.2 Run it and confirm it fails
- [x] 5.3 Rewrite the footer's link construction to read `getDepartments()` and build hrefs with `designPath`, leaving the markup and the "Categories" heading unchanged
- [x] 5.4 Run the test and confirm 2 passing
- [x] 5.5 Verify by grep that no flat design link remains anywhere in `app/`
- [x] 5.6 Commit

## 6. Validation

- [x] 6.1 `npm run test` — **869 passed across 106 files.** The plan predicted 866 (baseline 849/101 plus the 17 planned tests); the extra 3 are the design-grid tests added by the code-review fix wave.
- [x] 6.2 `npx tsc --noEmit` — expect clean
- [x] 6.3 `npm run check:contrast` — expect all 35 pairs and tints at AA
- [x] 6.4 `npm run lint` — ran clean against this change: 7 problems (4 errors, 3 warnings), all pre-existing and in files this change does not touch. This is worse than the plan's predicted "4 errors + 1 warning" — the two extra warnings are in `app/_lib/__tests__/taxonomy-route.test.ts`, a taxonomy-foundation file this branch never touches, so the prediction was stale, not this change's regression.
- [ ] 6.5 `npm run build` and `npm run test:e2e` were **not run** — `DATABASE_URL` points at the docker-compose host `postgres`, unreachable from this dev box. Both are owed a green run in CI or against the VPS before this ships; do not treat them as passing.
- [x] 6.6 No incidental fixes were needed beyond the feature work itself — this fix wave (the code-review remediation commit(s)) is the one exception, and it is committed separately from the original five feature-task commits above.
