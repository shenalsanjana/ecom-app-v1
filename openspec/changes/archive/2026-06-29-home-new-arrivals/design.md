## Context

The storefront home page (`app/page.tsx`) composes full-width sections: `Hero`, `CategoryStrip` ("Shop by category"), `ProductGrid` ("Featured products"), `DealsSection`, `TrustStrip`. The product data layer (`app/_lib/products.ts`) exposes cached readers (`getCategories`, `getFeaturedProducts`, `getDealsProducts`) built on `unstable_cache` + Prisma.

The `Product` model has no `createdAt`/timestamp column, and the existing `"newest"` sort falls back to `id: "asc"`. There is no local database in this environment, so `npm run build` (TypeScript compile) is the validation gate, not prerender. Full design rationale lives in `docs/superpowers/specs/2026-06-29-home-new-arrivals-design.md`; the implementation plan is `docs/superpowers/plans/2026-06-29-home-new-arrivals.md`.

## Goals / Non-Goals

**Goals:**
- Add a New Arrivals grid (6 products) directly below the hero.
- Reposition Shop by category directly below New Arrivals.
- Source "newest" with zero schema change.

**Non-Goals:**
- No `createdAt`/`newArrival` schema field, migration, or admin UI.
- No change to the Featured products grid (kept as-is).
- No side-by-side/horizontal layout — sections remain vertically stacked.

## Decisions

- **"Newest" = `id` descending.** A new cached reader `getNewArrivals(limit = 6)` queries `where: { archived: false, id: { startsWith: "p" } }`, `orderBy: { id: "desc" }`, `take: limit`, reusing `attachAggregates`. Cache tags `["catalog", "new-arrivals"]`.
  - *Alternatives considered:* add `createdAt` (accurate but needs migration + backfill, and there's no local DB); add a `newArrival` boolean + admin toggle (most explicit but largest scope). Both rejected as over-scoped for this change; id-desc is an accepted approximation since catalog IDs grow over time (`p1`, `p2`, …).
- **New component mirrors `ProductGrid`.** `app/_components/home/new-arrivals.tsx` is an async Server Component using `Section` + `SectionHeader` + `ProductCard`, header "New arrivals" / eyebrow "Just dropped" / action "View all" → `/categories?sort=newest` (confirmed handled by `parseSortBy` on the categories page).
  - *Alternative:* generalize `ProductGrid` into a parameterized grid. Rejected — duplicating one small component is clearer than threading config props through a shared one, and keeps the home sections individually readable.
- **Insert, don't reorder others.** `app/page.tsx` adds `<NewArrivals />` between `<Hero />` and `<CategoryStrip />`; no other section moves.

## Risks / Trade-offs

- **id-desc is not true recency** → If IDs are ever assigned non-monotonically, "newest" drifts. Mitigation: documented approximation; a follow-up can add `createdAt` without touching consumers.
- **Overlap with Featured** → New Arrivals (id desc) and Featured (id asc) could share items in a small catalog. Accepted; the two grids are visually distinct and serve different intents.
- **No component test harness for `app/_components/home/*`** → The component is covered by the build (type/SSR) gate plus visual check; only the data reader gets a unit test. Consistent with existing untested home components.
