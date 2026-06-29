## 1. Data reader: getNewArrivals

- [x] 1.1 Write failing test `app/_lib/__tests__/new-arrivals.test.ts` (mock `next/cache` `unstable_cache` as passthrough + mock prisma): assert `orderBy: { id: "desc" }`, `where.archived === false`, `where.id === { startsWith: "p" }`, default `take === 6`, and explicit `getNewArrivals(3)` → `take === 3`.
- [x] 1.2 Run `npm run test`; confirm it fails (getNewArrivals not exported).
- [x] 1.3 Add `getNewArrivals(limit = 6)` to `app/_lib/products.ts` after `getFeaturedProducts`: `unstable_cache` reader, `where: { archived: false, id: { startsWith: "p" } }`, `orderBy: { id: "desc" }`, `take: limit`, `attachAggregates(rows)`, tags `["catalog", "new-arrivals"]`, key `["new-arrivals"]`, `revalidate: 300`.
- [x] 1.4 Run `npm run test`; confirm all `getNewArrivals` cases pass and the existing suite is unaffected.
- [x] 1.5 Commit: `feat(home): add getNewArrivals reader (newest by id desc)`.

## 2. NewArrivals component + page wiring

- [x] 2.1 Create `app/_components/home/new-arrivals.tsx` mirroring `product-grid.tsx`: async Server Component, `getNewArrivals(6)`, `Section` + `SectionHeader` (eyebrow "Just dropped", title "New arrivals", action `{ label: "View all", href: "/categories?sort=newest" }`), grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, `ProductCard` per product with `fromPath="/"`.
- [x] 2.2 Edit `app/page.tsx`: import `NewArrivals`; render order Hero → NewArrivals → CategoryStrip → ProductGrid → DealsSection → TrustStrip.
- [x] 2.3 Run `npm run build`; confirm a clean TypeScript compile of `app/page.tsx` with `NewArrivals` included (a build-time DB connection error is environmental, not a code failure).
- [x] 2.4 Run `npm run test`; confirm the suite still passes.
- [x] 2.5 Commit: `feat(home): add New Arrivals section above categories`.
