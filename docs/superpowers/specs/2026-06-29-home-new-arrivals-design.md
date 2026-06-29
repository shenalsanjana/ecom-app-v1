# Home page: New Arrivals + Categories repositioning — Design Spec

**Date:** 2026-06-29
**Status:** Approved (design), pending implementation plan

## Goal

Add a **New Arrivals** section to the storefront home page, positioned directly
below the hero banner, and move the existing **Shop by category** section to sit
directly below New Arrivals.

## Interpretation of "next to"

The home page (`app/page.tsx`) renders full-width sections stacked vertically.
"Next to the hero" is therefore interpreted as **directly below the hero**, and
"categories next to new arrivals" as **directly below New Arrivals** — not a
side-by-side horizontal layout.

## Resulting page order

```
Hero
New Arrivals      ← new
Shop by category  ← moved up (was below Featured)
Featured products ← unchanged
Deals
Trust
```

Current order is `Hero → Shop by category → Featured products → Deals → Trust`.
Inserting `<NewArrivals />` between `<Hero />` and `<CategoryStrip />` achieves
the target order with no other component moving.

## Definition of "newest"

The `Product` model has **no `createdAt`/timestamp field**, and the existing
`"newest"` sort in `getProducts` falls back to `id: "asc"`. Rather than add a
schema field + migration (heavier scope, and there is no local database — see
project memory), "newest" is approximated by **ordering products by `id`
descending**. This assumes product IDs grow over time, which matches the
seed/admin conventions (`p1`, `p2`, …).

This is an explicit, accepted approximation. If precise newest-first semantics
are needed later, a follow-up change can add a `createdAt` column.

## Changes

### 1. Data layer — `app/_lib/products.ts`

Add a cached reader mirroring `getFeaturedProducts`, reversing the sort:

```ts
export const getNewArrivals = unstable_cache(
  async (limit = 6): Promise<ProductView[]> => {
    const rows = await prisma.product.findMany({
      where: { archived: false, id: { startsWith: "p" } },
      orderBy: { id: "desc" },
      take: limit,
      select: {
        id: true, name: true, price: true, originalPrice: true,
        image: true, categorySlug: true, sizes: true,
      },
    });
    return attachAggregates(rows);
  },
  ["new-arrivals"],
  { tags: ["catalog", "new-arrivals"], revalidate: 300 }
);
```

- Reuses the same `id.startsWith("p")` filter that `getFeaturedProducts` uses,
  keeping the set to real catalog rows.
- Reuses the existing `attachAggregates` helper for rating/review counts.
- Cache tag `new-arrivals` (alongside `catalog`) so future admin write paths can
  `revalidateTag("new-arrivals")` without touching this file.

### 2. New component — `app/_components/home/new-arrivals.tsx`

A near-copy of `product-grid.tsx`: an `async` Server Component using `Section`,
`SectionHeader`, and the existing `ProductCard` grid.

- Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (6 items = 2 clean rows on
  desktop).
- Header: eyebrow **"Just dropped"**, title **"New arrivals"**, action
  **"View all" → `/categories?sort=newest`**.
- Calls `getNewArrivals(6)`.
- Passes `fromPath="/"` to each `ProductCard`, matching `ProductGrid`.

### 3. Page reorder — `app/page.tsx`

Import `NewArrivals` and render it between `<Hero />` and `<CategoryStrip />`.
No other changes.

## Scope / non-goals

- **No schema change, no migration, no admin UI.** "Newest" is the id-desc proxy.
- **Featured products grid stays exactly as-is** (both grids kept, per decision).
- No side-by-side / horizontal layout work.

## Validation

- `npm run build` (TypeScript gate; no local DB so prerender is not the check).
- `npm run test` (Vitest, via `npm run test` — not a dir-prefixed filter).
- Add/extend a component test if the home components have existing test coverage.

## Decisions captured

- Data source: **latest by ID (desc)** — zero schema change.
- Featured grid: **keep both** New Arrivals and Featured.
- Item count: **6**.
