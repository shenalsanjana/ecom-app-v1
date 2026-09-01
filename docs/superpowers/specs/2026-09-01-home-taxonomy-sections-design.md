# Home Taxonomy Sections — Design

**Date:** 2026-09-01
**Status:** Approved for planning
**Predecessor:** `docs/superpowers/specs/2026-08-30-storefront-taxonomy-foundation-design.md` §9 item **B**

## 1. Purpose

The Department → Design taxonomy landed at `8ed2952`, but the home page never
learned about it. `app/_components/home/category-strip.tsx` still renders every
**design** under the heading "Shop by category", ordered by name, linking to the
flat `/categories/{slug}` — a path that now 308s. Departments appear nowhere.

This change makes the home page read the taxonomy: department cards under
"Shop by category", and a new "Shop by design" grid grouped by department.

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Layout comes from existing repo patterns, not the design canvas | The canvas (`Dressing Bear Storefront.dc.html`) is not in this repo, so any claim of fidelity to it would be invention. `Section`, `SectionHeader`, `Eyebrow` and the `/categories` department tiles already establish the vocabulary |
| 2 | **No auto-rotation.** The canvas's 3.8s tile carousel is dropped | §9 flagged that it needs a reduced-motion design keeping every slide *reachable* — the marquee bug class from `39ef139`. A static grid has no such failure mode, and nothing about browsing needs motion |
| 3 | Both sections are pure presentational functions; `app/page.tsx` fetches once | `getDepartments()` is already cached (tags `catalog`/`departments`, 3600s). One call passed as props keeps `next/cache` out of the component tests |
| 4 | Sections self-hide below a threshold rather than render sparse | Production has four departments but two designs. See §5 |
| 5 | Tints render from the DB `hex` column, not the `DESIGN_TINTS` code map | `hex` is what the seed writes and what an operator would change. The code map stays as the seed's shared source and the contrast gate's input |
| 6 | Designs under a department with no `subName` do not appear in "Shop by design" | That is `showsInDesignSection`'s existing contract (`subName !== null && designs.length > 0`), written during the foundation and until now uncalled. Plain T-Shirts and Accessories are excluded by design |

## 3. Data

`app/page.tsx` becomes an async Server Component, calls `getDepartments()` once,
and passes `DepartmentView[]` to both sections. No new read is introduced:
`DepartmentView` already carries `slug`, `name`, `tileName`, `note`, `subName`,
`hex`, `sortOrder`, and `designs[{ slug, name, hex }]` in sort order.

Rejected: a dedicated `getHomeTaxonomy()` (nothing left to shape) and
per-section self-fetching (two cache reads, and mocking dragged into every
component test).

## 4. Components

| File | Status | Responsibility |
|---|---|---|
| `app/_components/home/department-cards.tsx` | new, replaces `category-strip.tsx` | 4-up grid of departments passing `showsNavDropdown`. `tileName` as label, `note` as sub-label when present, `hex` + `inkFor`, href `/categories/{slug}` |
| `app/_components/home/design-grid.tsx` | new | One group per department passing `showsInDesignSection`. Group label pairs the department `name` as `Eyebrow` with `subName` beneath it. Designs link via `designPath(dept.slug, design.slug)` |
| `app/_components/ui/tint-tile.tsx` | new | The tint/ink/label tile both sections share: `href`, `label`, optional `subLabel`, `hex`. Ink via `inkFor` |
| `app/_components/home/category-strip.tsx` | deleted | Superseded |
| `app/_components/home/site-footer.tsx` | edited | Its six category links are flat `/categories/{slug}` on every page — same redirect drift, same fix |

### Group headings

Men and Women both seed `subName: "Oversized Graphic T-Shirts"`, so `subName`
alone does **not** identify a group. The department `name` in the `Eyebrow` is
what distinguishes them; the two must always render as a pair, and `subName`
must never appear as a group's only label.

Groups do not reuse `SectionHeader`, which hardcodes an `<h2>`. The section
itself owns the `<h2>` ("Shop by design"); each group renders an `<h3>` so the
heading hierarchy stays well-formed for screen readers.

`department-cards.tsx` keeps the existing strip's hover/motion classes
(`motion-safe:hover:-translate-y-[3px]`), so nothing regresses for
reduced-motion users.

Home section order becomes: Hero → SocialProof → ProductGrid →
**DepartmentCards** → **DesignGrid** → Deals → Trust.

## 5. Thresholds

Both thresholds are module constants, asserted by tests.

- **Department cards** render when **≥2** departments pass `showsNavDropdown`.
  One lone tile in a four-up grid reads as a bug, not as a catalog.
- **Design grid** renders when **≥1** department passes `showsInDesignSection`.

Consequences, which are the point of the rule:

| Environment | Taxonomy state | Cards | Grid |
|---|---|---|---|
| Production today | 4 departments, `cat` + `dino`, both under `women` | hidden | one Women group of two — today's two tiles, correct heading, nested hrefs |
| Dev (full seed) | 4 departments, 23 designs | 4 tiles | Women (16) and Men (2) |

`scripts/deploy.sh` runs `prisma migrate deploy` and never seeds, and
`DEPLOY_OVH.md` §4.8 records that there is no safe path to seed production, so
the production row above is the state that actually ships. Both sections appear
on their own as the catalog fills — no follow-up deploy needed.

## 6. Drift repaired

1. Flat `/categories/{slug}` design links → `designPath`. The home page stops
   emitting links that only resolve through a 308.
2. Tints read from `hex` rather than `tintForSlug`.
3. The footer's six flat links, on every page.

## 7. Testing

Follows `app/categories/__tests__/index-page.test.ts`: build a fixture
`DepartmentView[]`, render, walk the element tree collecting `href` props.

- **No flat design links.** Every emitted href is `/categories/{dept}` or
  `/categories/{dept}/{design}`. This is the regression guard for §6.1
- The real `showsNavDropdown` and `showsInDesignSection` are kept, never
  re-mocked — the tests prove the sections route through the derived rules
  instead of reimplementing the conditions
- Thresholds: 1 linked department → cards absent, 2 → present; 0 qualifying
  departments → grid absent, 1 → present
- A production-shaped fixture (4 departments, designs only under `women`)
  asserts the production row of §5 exactly
- A department with `subName: null` and designs contributes no group
- `TintTile` takes its ink from `inkFor`, never a luminance threshold —
  `app/_lib/taxonomy-tint.ts` records that a 0.5 threshold sends `dino` and
  `bear` to light ink at 1.73:1 and 2.38:1

No new Playwright specs: `tests/e2e/taxonomy-routes.spec.ts` already covers the
route and redirect behaviour these links depend on.

## 8. Spec deltas

Unlike the foundation, this change goes through `/opsx:propose`, so it produces
real deltas for `/opsx:sync`:

- **`storefront-home`** — the pinned section-order requirement gains "Shop by
  design" after "Shop by category", plus the conditional-render rules from §5
- **`storefront-taxonomy`** — a requirement that home taxonomy links are derived
  via `designPath` rather than written flat

## 9. Out of scope

Follow-ups C (header mega-menu), D (browse filter tree) and E (PDP and card
breadcrumbs) are untouched and remain independent. No carousel. No admin UI for
`tileName` / `note` / `subName`. The `/categories` index keeps its own tile
markup; adopting `TintTile` there is a separate cleanup.

## 10. Validation

Per `CLAUDE.md`: `npm run build`, `npm run test`, and `npm run check:contrast`.
`npm run test:e2e` is unchanged by this work but should be run if the
environment allows. Note that `npm run build` and `npm run test:e2e` cannot run
on the current dev box — `DATABASE_URL` points at the docker-compose host
`postgres` — so both fall to CI or the VPS, as recorded in
`openspec/archive/2026-08-30-storefront-taxonomy-foundation.md`.
