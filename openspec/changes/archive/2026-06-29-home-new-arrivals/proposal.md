## Why

The storefront home page surfaces "Shop by category" and "Featured products" but has no dedicated **New Arrivals** moment near the top. Putting fresh stock directly below the hero gives returning visitors an immediate reason to browse and pushes newest inventory above the fold.

## What Changes

- Add a **New Arrivals** section to the home page showing 6 products, rendered directly below the hero banner.
- "Newest" is approximated by ordering catalog products by `id` descending (no `createdAt` field exists; no schema change).
- Reposition **Shop by category** to sit directly below New Arrivals.
- Keep the existing **Featured products** grid unchanged (both grids remain).
- New cached data reader `getNewArrivals` with cache tag `new-arrivals`.

No breaking changes. No database migration, no admin UI changes.

## Capabilities

### New Capabilities
- `storefront-home`: The composition and ordering of sections on the public home page, including the New Arrivals grid and its data-sourcing rule.

### Modified Capabilities
<!-- None — there is no existing storefront-home spec; home composition is captured for the first time here. -->

## Impact

- `app/page.tsx` — section order (insert New Arrivals above categories).
- `app/_components/home/new-arrivals.tsx` — new component (mirrors `product-grid.tsx`).
- `app/_lib/products.ts` — new `getNewArrivals` reader.
- Tests: `app/_lib/__tests__/new-arrivals.test.ts`.
- No schema, migration, API, or dependency changes.
