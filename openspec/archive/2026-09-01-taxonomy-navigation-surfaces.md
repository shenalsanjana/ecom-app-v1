# 2026-09-01 — taxonomy-navigation-surfaces

Taxonomy follow-ups **C** (header mega-menu), **D** (browse filter tree) and **E** (PDP and card
breadcrumbs) from `2026-08-30-storefront-taxonomy-foundation-design.md` §9 — the three left open by
`2026-09-01-home-taxonomy-sections.md`. Taken together because all three consume the same
foundation: a breadcrumb, a pure trail builder, a pure counts helper, and photo support on the
existing tile.

## Highlights

- **A header mega-menu, built as a Server Component feeding a client leaf.** `SiteHeader` became
  `async`, reads the taxonomy once through the cache entry the footer already warms, and hands
  `MegaMenu` plain columns. The panel is Base UI `navigation-menu`.
- **The Prisma-in-the-bundle trap, and the fix.** `taxonomy-nav.ts` value-imports `showsNavDropdown`
  from `@/app/_lib/taxonomy`, which builds `getDepartments` with `unstable_cache` at module scope —
  so a `"use client"` file importing *anything* from that module, even an unrelated constant, drags
  Prisma's evaluation into the client chunk. The type and the threshold moved into
  `taxonomy-nav-model.ts`, a file with **zero imports**, which both client leaves import instead.
- **The panel degrades rather than render a lone column.** Below two qualifying departments the
  trigger is a plain link to `/categories`. Production has exactly one today, so that is the shipping
  behaviour; the panel appears on its own as the catalog fills.
- **The mobile sheet deliberately does *not* share that threshold.** One collapsible row is an
  ordinary list item, and the sheet is the only place the taxonomy reaches phones — the desktop panel
  is gated behind `md:`.
- **Three ad-hoc breadcrumbs collapsed into one**, and the PDP's design crumb stopped pointing at
  `/?category=<slug>`. `app/page.tsx` reads no search params, so that link had been silently landing
  on the home page.
- **Two crumb rules the callers rely on:** the last crumb never carries an href, and the sub-category
  crumb is never a link and appears only alongside a design — otherwise a department's own page
  linked to itself.
- **The browse sidebar left a 244-line page** and gained per-*design* counts (it had only
  per-department ones) plus an active state for the selected design and its parent.
- **`Design.image` finally has a renderer.** It was a nullable column with an admin upload path and
  nothing that displayed it. `TintTile` shows the photo over the tint with a scrim and light ink;
  ink over a photograph is *not* chosen by measuring contrast against the tint, which says nothing
  about legibility over an image. The tint stays the ground, so a failed image still resolves to a
  deliberate colour.
- **Card eyebrows read "Women › Cat".** The department name rides a relation on the query
  `cardSelect` already runs — no second read, and no `getDepartments()` threaded into a card.

## Validation

Run on the branch head:

- `npm run test` ✅ **914/914** across 114 files (baseline 869/106)
- `npx tsc --noEmit` ✅ clean
- `npm run check:contrast` ✅ all pairs and tints at AA — the tintless path is untouched and the gate
  did not move
- `npm run lint` — 7 problems (4 errors, 3 warnings), every one pre-existing and in a file this
  change never touched, verified against `git diff main --name-only`
- `npm run build` — **attempted, and it does not pass here, but not because of this change.** There
  is no `.env`/`.env.local` on this box, only the `.example` files. The build compiles successfully
  and then fails during prerender with `Environment variable not found: DATABASE_URL` on
  `/account/addresses`, a route this change does not touch. *Compilation completing is real evidence;
  prerendering is not.* A green build is still owed in CI or against the VPS.
- `npm run test:e2e` — **not run**; Playwright needs the same database.

## Where the plan was wrong

Three places, all caught by running the gates rather than trusting the plan:

1. **The plan's `cardEyebrow` fixture expected `"Women › Cats"`.** A card carries its design *slug*
   (`ProductView.category` is `p.designSlug`), not the design name, so `prettifyCategory("cat")` is
   `"Cat"`. The implementation was right and the expectation was wrong. Corrected, and a multi-word
   slug case (`day-dresses` → `Day Dresses`) added.
2. **The plan did not anticipate that extracting `FilterTree` would break `index-page.test.ts`.** The
   sidebar's links moved into a child component, and this repo's element-tree walk does not enter
   children. Rather than drop the BLOCKER 2 invariant (empty departments must never be linked), it is
   now asserted at the boundary the page still owns — the tile row, plus the `departments` prop handed
   to the tree, whose own test proves it links everything it is given.
3. **The plan's Task 5 test imported `NavColumn` from `taxonomy-nav`**, which value-imports Prisma;
   it imports from `taxonomy-nav-model` instead, so the test needs no Prisma mocks and the Task 4
   isolation rule holds everywhere.

The plan's warning that widening `ProductView` would "ripple into every fixture that builds one" did
not materialise — no test constructs one. Widening `DesignSummary` did: nine fixture files gained
`image: null`.

## Parked, deliberately

- **`Design.image` is an unvalidated string.** `next.config.ts` allows exactly one remote host
  (`picsum.photos`). The only writer of that column is `/api/admin/upload-local`, which returns a
  root-relative `/uploads/<name>` — a path `next/image` serves with no `remotePatterns` entry — so the
  ordinary case is safe. But `CategoryCreateSchema.image` is a bare trimmed string, so an admin who
  pastes an external URL gets a request-time "hostname is not configured under images" error on every
  page rendering that tile. Either validate the field or widen `remotePatterns` before this meets
  operator-entered URLs.
- **`?category=<design>` on the browse page** is still honoured for surviving links, and the page
  still filters on it. Nothing emits it any more.
- **The footer's six-link cap** still drains the first department — carried over from the predecessor,
  unchanged and still a product decision.

## References

- Design spec: `docs/superpowers/specs/2026-09-01-taxonomy-navigation-surfaces-design.md`
- Plan: `docs/superpowers/plans/2026-09-01-taxonomy-navigation-surfaces.md`
- OPSX change: `openspec/changes/archive/2026-09-01-taxonomy-navigation-surfaces/`
- Deltas synced into `openspec/specs/storefront-navigation/` (new capability) and
  `openspec/specs/storefront-taxonomy/`
- Predecessors: `openspec/archive/2026-09-01-home-taxonomy-sections.md` and
  `openspec/archive/2026-08-30-storefront-taxonomy-foundation.md`. This closes follow-ups C, D and E;
  §9 has none remaining.
