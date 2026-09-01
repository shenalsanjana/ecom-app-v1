# Taxonomy Navigation Surfaces — Design

**Date:** 2026-09-01
**Status:** Approved for planning
**Predecessor:** `docs/superpowers/specs/2026-08-30-storefront-taxonomy-foundation-design.md` §9, items **C**, **D** and **E**
**Sibling:** `docs/superpowers/specs/2026-09-01-home-taxonomy-sections-design.md` (item **B**, shipped)

## 1. Purpose

The foundation's §9 lists four surfaces that read the Department → Design taxonomy. B shipped.
This covers the remaining three in one change, at the product owner's explicit request:

- **C** — header mega-menu
- **D** — browse filter tree
- **E** — PDP and card breadcrumbs, card sub-labels, photo/no-photo tile fallback

§9 calls these "separate changes … independent of one another." They are being built together
anyway. The justification is that two of them are much smaller than §9 implies (see §2) and that
all three want the same two new pieces — a shared breadcrumb and a taxonomy trail builder — which
would otherwise be written three times or, worse, three different ways.

## 2. What is already built

Reading the code changes the shape of this work substantially, and the plan must reflect it:

- **D is mostly done.** The taxonomy foundation already shipped the indented department → design
  tree with per-department product counts in the browse sidebar
  (`app/categories/(index)/page.tsx`). What is missing is a breadcrumb, per-**design** counts, and
  an active state for the selected design.
- **E's breadcrumb exists and is broken.** `app/_components/product/breadcrumb.tsx` links its
  design crumb to `/?category=${designSlug}`. `app/page.tsx` reads no search params — `?category=`
  is read by `/categories` and `/search`, not `/` — so that crumb silently drops the visitor on the
  home page. This is a live defect, not a missing feature.
- **There are three ad-hoc breadcrumbs**, none sharing code: the PDP component above, and two
  inline `<nav>` blocks in `app/categories/[...slug]/page.tsx` (department page and design page).
  The inline pair uses `/` separators where the PDP uses chevron icons, and neither is an `<ol>`
  nor carries `aria-label="Breadcrumb"`.
- **The UI kit is Base UI** (`@base-ui/react` ^1.4.1), not Radix. It ships `navigation-menu`,
  `accordion` and `collapsible`.

So the real build here is C. D and E are largely repair and enrichment.

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | One panel under the existing "Shop" nav item, not one nav item per department | §9 says "per-department hover dropdowns", but the header already carries five nav items; four more crowds it and gets worse as departments are added. One panel with a column per department shows the same information and scales |
| 2 | Build on Base UI's `navigation-menu` and `accordion` rather than hand-rolled hover state | Hover-only menus fail keyboard and touch. The primitive already handles hover intent, focus, Escape, outside-click and arrow keys, and it is already a dependency. Reimplementing that is how menus become inaccessible |
| 3 | `SiteHeader` stays a Server Component and passes rows to a client leaf | CLAUDE.md §3: client components stay small and at the leaves, and an async Server Component is never rendered inside a `"use client"` component. Data crosses the boundary, not components |
| 4 | The sub-category crumb is text, never a link | `subName` is a column on the department, not a level in the URL. Linking it would invent a route that does not exist |
| 5 | Over a photo, ink is light on a scrim; `inkFor` is untouched for tintless tiles | Measured contrast against a tint is meaningless once a photograph covers it. Two rules for two grounds, each honest about what it can measure |
| 6 | The card's department name comes from a relation on the existing read, not a second query | `cardSelect` can join `design → department` in the query it already runs. Threading `getDepartments()` into every card render would be a second source of truth for a name |
| 7 | No Playwright specs for the menu | They cannot run on this dev box, and an unrun test is worse than no test. Interaction behaviour is delegated to Base UI; what remains ours is which links the panel emits, which the existing element-tree-walk pattern covers |

## 4. Shared foundation

Built first; C, D and E all consume it.

| File | Responsibility |
|---|---|
| `app/_components/ui/breadcrumb.tsx` | One `<nav aria-label="Breadcrumb">` wrapping an `<ol>`, taking `{ label, href? }[]`. The final crumb carries `aria-current="page"` and no link. Separators are `aria-hidden` |
| `app/_lib/taxonomy-trail.ts` | Pure. Given a department, an optional design and an optional product name, returns the crumb items: Home › Categories › Department › [sub-category] › [Design] › [Product]. The sub-category item has no `href` (decision 4) |
| `app/_lib/taxonomy-counts.ts` | Pure. Given products carrying a design slug, returns counts per design and per department |

`app/_components/product/breadcrumb.tsx` is deleted; its three call sites move to the shared
component fed by the trail builder.

`TintTile` gains an optional `image`. When present it renders the photo over the tint ground with a
dark gradient scrim and light ink; when absent, behaviour is exactly as it ships today, including
`inkFor`. The tint remains the background in both cases, so a slow or failed image still shows a
sensible ground rather than white.

## 5. C — header mega-menu

`app/_components/header/mega-menu.tsx` (`"use client"`, Base UI `navigation-menu`). The existing
"Shop" nav item becomes the trigger. The panel holds one column per department passing
`showsNavDropdown`. The column heading is the department name, linking to `/categories/{dept}`;
beneath it the department's designs link via `designPath`. There is no separate "Shop all" link —
it would point where the heading already points. Desktop only, matching the nav's existing `md:` gate.

`SiteHeader` becomes async and reads `getDepartments()` once, passing rows to both `MegaMenu` and
`MobileNav`. This is the same cached read the footer already performs on every page, under the same
key, so it adds no query on a warm cache.

`app/_components/header/mobile-nav.tsx` gains a Base UI accordion section listing departments with
their designs, fed by the same rows. The panel itself stays desktop-only; the accordion is how the
taxonomy reaches phones.

**Degenerate state.** With fewer than two departments passing `showsNavDropdown` — production
today has one — the panel would hold a single column, which is a worse affordance than a link. The
desktop trigger SHALL fall back to a plain link to `/categories`, matching the threshold reasoning
the home page already uses.

The mobile accordion does **not** follow that rule: it renders whenever at least one department
qualifies. The asymmetry is deliberate. A one-column mega panel is a broken-looking dropdown,
whereas a single collapsible row is an ordinary list item, and the accordion is the only place the
taxonomy appears in mobile navigation at all.

## 6. D — browse filter tree

`app/categories/(index)/page.tsx` is 244 lines, roughly sixty of which are the sidebar. The sidebar
moves to `app/_components/categories/filter-tree.tsx`, taking departments, counts and the selected
design slug as props — pure, no data access — which shrinks the page and makes the tree testable.

It gains, beyond what ships today:

- per-**design** counts beside each design row, from `taxonomy-counts`
- an active state on the selected design row and on its parent department
- the shared breadcrumb above the grid (Home › Categories)

## 7. E — PDP and cards

- **PDP breadcrumb** renders the full trail — Home › Categories › Department › sub › Design ›
  Product — and its design crumb points at `designPath`, fixing the dead link in §2.
  `getProductDetail` exposes the product's department slug and name to make that possible.
- **The two inline navs** in `app/categories/[...slug]/page.tsx` are replaced by the shared
  component, so all four breadcrumbs on the site agree on markup, separators and semantics.
- **Card sub-labels.** `cardSelect` gains `design → { name, department: { name, slug } }`, and
  `ProductView` carries the department name. A card's eyebrow reads "Women › Cats" rather than
  "Cats". Where a card has no department — not possible in current data, but the type allows it —
  the eyebrow falls back to the design name alone rather than rendering a dangling separator.
- **Tile photos** come from `Design.image`, already a nullable column with an admin upload path and
  no renderer.

## 8. Out of scope

- Any change to what the home page's two taxonomy sections show, beyond tiles gaining photos
  through the shared `TintTile`
- Search-page taxonomy filtering
- Admin UI for `tileName` / `note` / `subName` — still unbuilt, still not this change
- The three findings parked by the previous change: the footer's six-link cap draining the first
  department, the department Eyebrow not being `aria-hidden`, and the two-tile four-column row

## 9. Testing

Pure units — `taxonomy-trail`, `taxonomy-counts`, and the tile's ground/ink rule — get direct unit
tests, including: a design under a department with no `subName` produces no sub crumb; the sub crumb
never carries an href; counts attribute a product to exactly one design and one department.

Components follow the established pattern: call the component, walk the returned element tree,
assert on hrefs and props. Specifically:

- the mega-menu panel emits `designPath` links for every design of every qualifying department, and
  a `/categories/{dept}` link per column
- with fewer than two qualifying departments, the trigger is a plain `/categories` link and no panel
  is rendered
- the filter tree marks the selected design and its parent department active, and no other row
- every breadcrumb's last crumb has no href and carries `aria-current="page"`
- a tile with an image renders light ink and the scrim; a tile without one is byte-for-byte the
  behaviour that ships today
- a card's eyebrow reads "Department › Design" when the department is known, and the design name
  alone — with no dangling separator — when it is not

## 10. Validation

`npm run test`, `npx tsc --noEmit`, `npm run check:contrast`, `npm run lint`. `npm run build` and
`npm run test:e2e` cannot run on this dev box — `DATABASE_URL` points at the docker-compose host
`postgres` — and are owed a green run in CI or against the VPS, as recorded for the two preceding
taxonomy changes.
