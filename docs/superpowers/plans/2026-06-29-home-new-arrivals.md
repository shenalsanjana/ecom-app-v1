# Home New Arrivals Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "New Arrivals" grid (6 products) directly below the hero on the storefront home page, with "Shop by category" sitting directly below it.

**Architecture:** Add a cached `getNewArrivals` reader to the existing product data layer (newest approximated by `id` descending), build a `NewArrivals` async Server Component that mirrors the existing `ProductGrid`, and insert it into `app/page.tsx` between `Hero` and `CategoryStrip`. No schema change, no migration, no admin UI.

**Tech Stack:** Next.js 16 App Router (Server Components), Prisma + PostgreSQL, `unstable_cache`, Vitest.

## Global Constraints

- Framework: Next.js 16 App Router. Favor Server Components; keep Client Components at the leaves. Never render an `async` Server Component inside a `"use client"` component.
- No local database in this environment: `npm run build` is the TypeScript gate; do not rely on prerender. Validate with `npm run build` and `npm run test`.
- Vitest invocation: use `npm run test` (a dir-prefixed/`npx vitest` filter trips a "no tests" globalSetup quirk).
- Data-layer readers wrapped in `unstable_cache` must stay pure (no `auth()`, `cookies()`, `headers()`).
- Spec of record: `docs/superpowers/specs/2026-06-29-home-new-arrivals-design.md`.
- "Newest" = products ordered by `id` descending, filtered to `archived: false` and `id.startsWith("p")` (same filter `getFeaturedProducts` uses).
- Item count: 6.

---

### Task 1: `getNewArrivals` data reader

**Files:**
- Modify: `app/_lib/products.ts` (add a new exported reader after `getFeaturedProducts`, ~line 92)
- Test: `app/_lib/__tests__/new-arrivals.test.ts` (create)

**Interfaces:**
- Consumes: existing `attachAggregates(rows: ProductRow[]): Promise<ProductView[]>`, `prisma`, `unstable_cache`, and the `ProductView` type — all already in `app/_lib/products.ts`.
- Produces: `getNewArrivals(limit?: number): Promise<ProductView[]>` (default `limit = 6`), ordered by `id` descending. Consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/new-arrivals.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Make unstable_cache a passthrough so the wrapped reader runs its inner fn directly.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const { findMany, groupBy } = vi.hoisted(() => ({
  findMany: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { product: { findMany }, review: { groupBy } },
}));

import { getNewArrivals } from "../products";

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  groupBy.mockReset().mockResolvedValue([]);
});

describe("getNewArrivals", () => {
  it("orders by id descending, newest-first", async () => {
    await getNewArrivals();
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ id: "desc" });
  });

  it("excludes archived and limits to catalog product ids", async () => {
    await getNewArrivals();
    const where = findMany.mock.calls[0][0].where;
    expect(where.archived).toBe(false);
    expect(where.id).toEqual({ startsWith: "p" });
  });

  it("defaults to 6 items and respects an explicit limit", async () => {
    await getNewArrivals();
    expect(findMany.mock.calls[0][0].take).toBe(6);
    findMany.mockClear();
    await getNewArrivals(3);
    expect(findMany.mock.calls[0][0].take).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — `getNewArrivals` is not exported from `../products` (import resolves to `undefined`, call throws "getNewArrivals is not a function").

- [ ] **Step 3: Write minimal implementation**

In `app/_lib/products.ts`, add this export immediately after the `getFeaturedProducts` block (after the closing `);` near line 92):

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test`
Expected: PASS — all three `getNewArrivals` cases green; existing suite unaffected.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/products.ts app/_lib/__tests__/new-arrivals.test.ts
git commit -m "feat(home): add getNewArrivals reader (newest by id desc)"
```

---

### Task 2: `NewArrivals` component + page wiring

**Files:**
- Create: `app/_components/home/new-arrivals.tsx`
- Modify: `app/page.tsx` (add import; render `<NewArrivals />` between `<Hero />` and `<CategoryStrip />`)

**Interfaces:**
- Consumes: `getNewArrivals` from Task 1; existing `ProductCard` (`app/_components/home/product-card.tsx`), `Section` (`app/_components/ui/section.tsx`), `SectionHeader` (`app/_components/ui/section-header.tsx` — props `{ eyebrow?, title, action?: { label, href } }`).
- Produces: `NewArrivals` async Server Component (default-free named export `export async function NewArrivals()`), rendered by `app/page.tsx`.

This task has no unit test — there is no component-test harness for `app/_components/home/*` (the home components like `ProductGrid`/`CategoryStrip` ship untested). The deliverable is verified by `npm run build` (type/SSR gate) plus a visual check. Keeping a screenshot/Playwright pass out of scope matches the existing home-component convention.

- [ ] **Step 1: Create the component**

Create `app/_components/home/new-arrivals.tsx` (mirrors `app/_components/home/product-grid.tsx`):

```tsx
import { ProductCard } from "@/app/_components/home/product-card";
import { getNewArrivals } from "@/app/_lib/products";
import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";

export async function NewArrivals() {
  const products = await getNewArrivals(6);
  return (
    <Section>
      <SectionHeader
        eyebrow="Just dropped"
        title="New arrivals"
        action={{ label: "View all", href: "/categories?sort=newest" }}
      />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <ProductCard
            key={p.id}
            id={p.id}
            name={p.name}
            price={p.price}
            originalPrice={p.originalPrice}
            image={p.image}
            rating={p.rating}
            reviewCount={p.reviewCount}
            sizes={p.sizes}
            category={p.category}
            fromPath="/"
          />
        ))}
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Wire it into the home page**

In `app/page.tsx`, add the import alongside the other `home` imports (keep the existing alphabetical-ish grouping):

```tsx
import { NewArrivals } from "@/app/_components/home/new-arrivals";
```

Then update the `<main>` body so the order is Hero → NewArrivals → CategoryStrip → ProductGrid → DealsSection → TrustStrip:

```tsx
      <main className="flex-1">
        <Hero />
        <NewArrivals />
        <CategoryStrip />
        <ProductGrid />
        <DealsSection />
        <TrustStrip />
      </main>
```

- [ ] **Step 3: Build to verify types + SSR compile**

Run: `npm run build`
Expected: PASS — compiles with no TypeScript errors; `app/page.tsx` includes `NewArrivals`. (Prerender data fetches are not the gate here; a build-time DB connection error is environmental, not a code failure — a clean type-check + successful compile of the route is the success signal.)

- [ ] **Step 4: Run the test suite**

Run: `npm run test`
Expected: PASS — Task 1 suite still green; nothing else regressed.

- [ ] **Step 5: Commit**

```bash
git add app/_components/home/new-arrivals.tsx app/page.tsx
git commit -m "feat(home): add New Arrivals section above categories"
```

---

## Self-Review

**1. Spec coverage:**
- New Arrivals section directly below hero → Task 2 (page order Hero → NewArrivals).
- Shop by category directly below New Arrivals → Task 2 (NewArrivals before CategoryStrip).
- "Newest" = id desc, `archived:false` + `id.startsWith("p")` → Task 1 reader + tests.
- 6 items → Task 1 default `limit = 6`; Task 2 calls `getNewArrivals(6)`.
- Featured grid unchanged → Task 2 leaves `<ProductGrid />` in place.
- Header copy "Just dropped" / "New arrivals" / "View all" → `/categories?sort=newest` → Task 2.
- No schema/migration/admin → no task touches `prisma/schema.prisma` or admin.
- Validation via `npm run build` + `npm run test` → both tasks' run steps.
All spec sections map to a task. No gaps.

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code and command step shows the actual content. Pass.

**3. Type consistency:** `getNewArrivals(limit?: number): Promise<ProductView[]>` defined in Task 1 and called as `getNewArrivals(6)` in Task 2. `ProductView` fields (`id, name, price, originalPrice, image, rating, reviewCount, category, sizes`) match the `ProductCard` props used by the existing `ProductGrid`. `SectionHeader` `action: { label, href }` matches its definition. Consistent.
