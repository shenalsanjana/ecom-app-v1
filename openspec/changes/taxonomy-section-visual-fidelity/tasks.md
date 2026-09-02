The step-by-step detail, including the test code and implementation for each item, is in `docs/superpowers/plans/2026-09-01-taxonomy-section-visual-fidelity.md`. The numbering here matches that plan's tasks. Every group is TDD: the failing test comes first, and each group ends in one commit.

## 1. Caption contrast foundation

- [x] 1.1 Write the failing tests in `app/_lib/taxonomy-tint.test.ts` for `compositeOver` and the caption gradient's contrast floor, asserting both caption lines clear 4.5:1 against every tint in `ALL_TINTS`
- [x] 1.2 Add `compositeOver`, `CAPTION_OVERLAY`, `CAPTION_NOTE_ALPHA` and `CAPTION_SCRIM_MIN_ALPHA` to `app/_lib/taxonomy-tint.ts`, redefining `compositeOverBlack` as the `#000` case
- [x] 1.3 Run the suite; if the note line fails, raise `CAPTION_SCRIM_MIN_ALPHA` in steps of 0.02 until it passes and record the final value in the constant's comment. Do not lower the 4.5 threshold
- [x] 1.4 Confirm the pre-existing `SCRIM_ALPHA` tests still pass untouched — `TintTile` ships until group 8
- [x] 1.5 Commit

## 2. Slide rotation logic

- [x] 2.1 Write the failing tests in `app/_lib/slide-rotation.test.ts` covering index derivation, the zero start, pinning, range clamping, the single-slide short-circuit and dot naming
- [x] 2.2 Create `app/_lib/slide-rotation.ts` with `SLIDE_INTERVAL_MS`, `rotates`, `slideIndex` and `dotLabel`
- [x] 2.3 Run the suite and confirm it passes
- [x] 2.4 Commit

## 3. Per-design photos and counts

- [x] 3.1 Write the failing tests in `app/_lib/taxonomy-media.test.ts` covering grouping, a product with no variant, a variant with no CARD image, the slide cap, an explicit cap, and an absent design
- [x] 3.2 Create `app/_lib/taxonomy-media.ts` with the pure `designMedia` projection and the `getDesignMedia` cached read, tagged `["catalog", "products"]`
- [x] 3.3 Run the suite and confirm it passes
- [x] 3.4 Commit

## 4. The slide show island

- [x] 4.1 Create `app/_components/ui/slide-clock.tsx` — one interval, a tick starting at zero, never started under `prefers-reduced-motion`, cleaned up on unmount
- [x] 4.2 Create `app/_components/ui/slide-show.tsx` — cross-fading layers over the tint ground, the frosted slide label, the tint-only slide title, and the dot pill whose buttons pin and stop propagation
- [x] 4.3 Run `npx tsc --noEmit` and the full suite; nothing consumes these yet, so the suite must pass unchanged
- [x] 4.4 Commit

## 5. Department cards

- [x] 5.1 Copy the `collectText` helper into `app/_components/home/__tests__/department-cards.test.ts` from `design-grid.test.ts` — this file does not have one
- [x] 5.2 Write the failing tests for `departmentSlides`, `departmentNote`, the card's rendered name/note/link, per-card slide scoping, and the unchanged threshold
- [x] 5.3 Create `app/_components/home/department-card.tsx` — card shell, 1:1 media area, body row with name, mono note and brand arrow
- [x] 5.4 Rewrite `app/_components/home/department-cards.tsx` around `SlideClock`, `DepartmentCard`, `departmentSlides` and `departmentNote`, with the `auto-fill minmax(220px,1fr)` grid
- [x] 5.5 Run the suite and confirm it passes
- [x] 5.6 Commit

## 6. Design tiles

- [x] 6.1 Delete the `"puts the department name inside the heading's own accessible name"` test — the `sr-only` span it guards is retired by the eyebrow/heading swap
- [x] 6.2 Add `media: new Map()` to every existing `DesignGrid(...)` call in `design-grid.test.ts`
- [x] 6.3 Write the failing tests for `designSlides`' three-step fallback chain, `productNote` singularisation, the eyebrow/heading swap, the per-group design count and the per-tile product count
- [x] 6.4 Create `app/_components/home/design-tile.tsx` with the three-stop caption gradient derived from `CAPTION_SCRIM_MIN_ALPHA`
- [x] 6.5 Rewrite `app/_components/home/design-grid.tsx` — `media` prop, section eyebrow from `subName`, department name as each group's `h3`, `sr-only` span removed, `auto-fill minmax(130px,1fr)` grid
- [x] 6.6 Run the suite and confirm it passes
- [x] 6.7 Commit

## 7. Wire the home page

- [x] 7.1 Add the `getDesignMedia` hoisted mock to `app/__tests__/home-page.test.ts` and default it to an empty Map in `beforeEach`
- [x] 7.2 Write the failing test asserting the media reaches `DesignGrid`, does not reach `DepartmentCards`, and is read exactly once
- [x] 7.3 Read both sources concurrently in `app/page.tsx` with `Promise.all` and pass `media` to `DesignGrid`
- [x] 7.4 Run the suite and confirm it passes
- [x] 7.5 Commit

## 8. Retire TintTile and validate

- [x] 8.1 Confirm nothing outside the two files being deleted still imports `TintTile`
- [x] 8.2 Delete `app/_components/ui/tint-tile.tsx` and `app/_components/ui/__tests__/tint-tile.test.ts`
- [x] 8.3 Check whether `SCRIM_ALPHA` is now dead; if nothing outside the tests reads it, remove the constant, its doc comment and its test block. `INK_LIGHT` and `inkFor` stay — `SlideShow` uses `inkFor`
- [x] 8.4 Verify the three already-shipped deltas (`8fd1811` PDP breadcrumb, `9df07fd` card department label, `8110721` design photo on tile) against the prototype and record the outcome here. Report mismatches as findings; do not fix them in this change
- [x] 8.5 Run `npm run build` — **PASSED** (exit 0, zero prerender errors) against a real Postgres, seeded with 4 departments / 23 designs / 2 products. Both taxonomy sections render; the `design-media` cache entry serialises to a JSON list of pairs, not `{}`
- [x] 8.6 Run `npm run test`
- [x] 8.7 Run `npm run check:contrast` — required, the tint guarantees moved in group 1
- [ ] 8.8 Run `npm run test:e2e` — **STILL COULD NOT RUN**, now for a different reason: Chromium cannot exec (`libatk-1.0.so.0: cannot open shared object file`). All 53 failures are browser-launch failures; the 9 passes are the non-browser tests. Needs `sudo npx playwright install-deps`, and sudo requires a password here. Must be run before merge — required, home navigation changed. If it cannot run in this environment, say so explicitly rather than reporting it passed
- [x] 8.9 Commit
