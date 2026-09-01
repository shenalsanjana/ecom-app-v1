# 2026-09-01 — home-taxonomy-sections

Taxonomy follow-up **B** from `2026-08-30-storefront-taxonomy-foundation-design.md` §9. The
Department → Design taxonomy shipped in August, but the home page never learned about it:
`category-strip.tsx` listed every *design* under the heading "Shop by category" and linked to flat
`/categories/{slug}` paths that only resolve through a 308. This makes the home page read the
taxonomy — department cards, and a new "Shop by design" grid grouped by department.

## Highlights

- **The foundation's dead predicate got its caller.** `showsInDesignSection` — `subName !== null &&
  designs.length > 0` — was written during the foundation and had no call site until now. Both
  sections route through the derived rules rather than restating their conditions, and the tests
  keep the real predicates unmocked to prove it.
- **Sections self-hide rather than render sparse.** Cards need ≥2 linked departments, the grid needs
  ≥1 qualifying department. On production — four departments, two designs, both under `women`,
  because `scripts/deploy.sh` migrates and never seeds — that means no department grid and one Women
  group of two, which is roughly what the page showed before, now with correct headings and nested
  links. Both appear on their own as the catalog fills; no follow-up deploy.
- **Flat links are gone from home and from the footer**, which renders on every page. `designPath` is
  the only construction site.
- **Tints render from the stored `hex` column**, not the `DESIGN_TINTS` code map, so a re-seed or an
  operator edit actually shows. The map stays as the seed's source and the contrast gate's input.
- **No carousel.** The source canvas auto-rotates tiles every 3.8s; §9 flagged that it would need a
  reduced-motion design keeping every slide *reachable*, not merely frozen. A static grid has no such
  failure mode.
- New shared `TintTile` carries the tint, the label, and a focus-visible ring the old strip lacked.

## Validation

Run on the branch head:

- `npm run test` ✅ **869/869** across 106 files (baseline 849/101 plus 17 planned tests plus 3 added
  by the code-review fix wave)
- `npx tsc --noEmit` ✅ clean
- `npm run check:contrast` ✅ all pairs and tints at AA
- `npm run lint` — 7 problems (4 errors, 3 warnings), every one in a file this change never touched,
  verified against `git diff --name-only`
- `npm run build` and `npm run test:e2e` — **not run**, and task 6.5 is left unticked to say so.
  `DATABASE_URL` points at the docker-compose host `postgres`, unreachable from the dev box. Both are
  owed a green run in CI or against the VPS. The whole-branch review checked specifically whether
  anything here is uniquely gated on them and found nothing: the page was already awaiting a
  Prisma-backed cached read before this change, and no e2e spec asserts on the home page.

## What the reviews caught

The whole-branch review found three Important items, two of which were defects in the OpenSpec
artifacts rather than the code:

1. **An accessibility gap the spec itself made normative.** Groups rendered the department name as a
   `<p>` above `<h3>{subName}</h3>` with no programmatic association — so a screen-reader user
   navigating by heading heard "Oversized Graphic T-Shirts" twice, since Men and Women share that
   sub-category. Fixed with a visually-hidden prefix inside the heading.
2. **The section-order delta contradicted the threshold delta**, asserting unconditionally that Shop
   by category "still renders" — false on production. Rewritten to constrain *relative* order.
3. **The task checklist was untouched** at archive time, and on the first correction pass 6.5 was
   ticked while its own text said the run had not happened.

A fourth, found while syncing: the single-read requirement claimed the page passes rows to every
section that needs them, but `SiteFooter` needs them and self-fetches, because it renders on ~20
pages and cannot depend on any one of them having read first. The synced requirement states the
exclusion and why it costs nothing (both reads share a cache entry).

## Parked, deliberately

- **The footer's six-link cap drains the first department.** `flatMap` then `slice(0, 6)` in taxonomy
  order means a full catalog shows six Women designs and no Men, Plain or Accessories link. Production
  is unaffected. Spec-compliant — nothing requires a spread — but a column headed "Categories" that can
  only surface one department is weak IA now that departments exist. Left as a product decision.
- **The visible department Eyebrow is not `aria-hidden`**, so a screen-reader user reading linearly
  now hears the department name twice. The heading-navigation defect was the one the spec made
  normative; this is a separate judgement about linear reading.
- **Two tall tiles in a four-column row** is the first thing production renders once a second
  department gains a design.

## References

- Design spec: `docs/superpowers/specs/2026-09-01-home-taxonomy-sections-design.md`
- Plan: `docs/superpowers/plans/2026-09-01-home-taxonomy-sections.md`
- OPSX change: `openspec/changes/archive/2026-09-01-home-taxonomy-sections/`
- Deltas synced into `openspec/specs/storefront-home/` and `openspec/specs/storefront-taxonomy/`
- Predecessor: `openspec/archive/2026-08-30-storefront-taxonomy-foundation.md`. Follow-ups C
  (header mega-menu), D (browse filter tree) and E (PDP and card breadcrumbs) remain open and
  independent.
