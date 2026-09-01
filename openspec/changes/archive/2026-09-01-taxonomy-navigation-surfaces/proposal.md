## Why

The Department → Design taxonomy has a data model, nested routes and two home sections, but the rest of the storefront still navigates as though it were flat. There is no way to reach a department from the header. The browse sidebar counts products per department but not per design and never shows which design you are looking at. And the product page's breadcrumb points its design crumb at `/?category=<design>` — a URL the home page does not read, so it silently drops the visitor on the home page.

This closes the foundation spec's remaining §9 items — **C** (header mega-menu), **D** (browse filter tree) and **E** (PDP and card breadcrumbs) — in one change, at the product owner's request.

## What Changes

- **The header's "Shop" item expands into a mega-menu**: one panel, a column per department that has designs, its designs beneath. Below two qualifying departments it degrades to a plain link to `/categories`, because a one-column panel reads as broken.
- **The mobile sheet gains the taxonomy** as an accordion, since the panel is desktop-only. It renders from one qualifying department upward — deliberately unlike the desktop trigger.
- **The browse filter tree** is extracted from a 244-line page into its own component and gains per-design counts and an active state for the selected design and its parent department.
- **One breadcrumb replaces three.** The PDP component and two inline `<nav>` blocks on the category routes collapse into a single component fed by a pure trail builder. The trail is Home › Categories › Department › [sub-category] › [Design] › [Product]; the sub-category is never a link, and the final crumb never carries an href.
- **BREAKING for the visitor, in the good direction:** the PDP's design crumb now points at the design's real nested path instead of a URL nothing reads.
- **Design tiles show a photo when the design has one**, falling back to the tint. `Design.image` has been a nullable column with an admin upload path and no renderer.
- **Product cards read "Women › Cats"** rather than "Cats". The department name rides along on the join the card query already performs.

## Capabilities

### New Capabilities

- `storefront-navigation`: how the header and mobile sheet expose the taxonomy — the mega-menu, its degenerate fallback, and the mobile accordion.

### Modified Capabilities

- `storefront-taxonomy`: gains breadcrumb requirements (trail shape, the unlinked sub-category, the unlinked final crumb), the browse filter tree's counts and active state, and the rule that a tile renders a photo over its tint when one exists — including that ink stops being contrast-measured once a photograph is in the way.

## Impact

**Code**
- `app/_lib/taxonomy-trail.ts`, `app/_lib/taxonomy-counts.ts`, `app/_lib/taxonomy-nav.ts` — new, all pure
- `app/_components/ui/breadcrumb.tsx` — new, replaces `app/_components/product/breadcrumb.tsx` (deleted)
- `app/_components/header/mega-menu.tsx` — new client leaf; `mobile-nav.tsx` gains an exported presentational `TaxonomySection`
- `app/_components/categories/filter-tree.tsx` — extracted from `app/categories/(index)/page.tsx`
- `app/_components/home/site-header.tsx` — becomes async; renders on every page
- `app/_components/ui/tint-tile.tsx` — optional `image`
- `app/_lib/products.ts` — `getProductDetail` includes the department; `cardSelect` gains the design→department relation
- `app/_lib/taxonomy.ts` — `DesignSummary` gains `image`

**Data** — no schema change and no migration. Two reads widen: one nested `include` on a query that already joins the design, and one extra column on the departments read.

**Risk** — `SiteHeader` renders on every page, so an error there is site-wide. Two widened types (`DesignSummary`, `ProductView`) ripple through test fixtures. The new `next/image` call takes its `src` from the database, which unit tests cannot fully exercise; that is build-time risk this dev box cannot check.

**Out of scope** — search-page taxonomy filtering, admin UI for `tileName`/`note`/`subName`, and the three findings parked by the previous change.
