# Server-Side Data Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut server-side data-fetch latency on catalog, product-detail, and admin pages by adopting Prisma Accelerate (pooling + per-query caching), collapsing the `getProductDetail` query waterfall, and caching the currently-uncached catalog readers.

**Architecture:** Keep Prisma as the client; route it through Accelerate for serverless connection pooling and a global query cache via `cacheStrategy`. Existing `unstable_cache` wrappers stay as a per-instance fast path; Accelerate adds the cross-instance + cold-start-proof layer. Admin write paths invalidate Accelerate tags alongside the existing `revalidateTag`. A balanced admin policy caches analytics/summary data short-TTL while keeping orders/stock/payments/dispatch live.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 (`@prisma/client`), `@prisma/extension-accelerate`, Prisma Postgres, vitest, Vercel.

**Source spec:** [`../specs/2026-06-04-server-side-data-perf-design.md`](../specs/2026-06-04-server-side-data-perf-design.md)

**Precondition:** Per the shared-working-dir concurrency hazard, implement this in an isolated git worktree (the executing skill will set this up). All runtime DB access uses the Accelerate URL; `prisma migrate`/seed/diagnostics use the direct URL.

**External prerequisite (manual, blocks Task 1):** In the Prisma Console, enable **Accelerate** on the Prisma Postgres project and copy the Accelerate connection string (`prisma+postgres://accelerate.prisma-data.net/?api_key=…`). Confirm the plan/quota fits expected traffic. The current `DATABASE_URL` is a direct `postgres://` TCP string — it is NOT the Accelerate URL.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `prisma/schema.prisma` | Datasource | Add `directUrl` for migrations |
| `app/_lib/prisma.ts` | Prisma client singleton | Extend with `withAccelerate()`; stop applying pool defaults at runtime; keep `withPoolDefaults` export for direct-URL tooling |
| `app/_lib/cache.ts` *(new)* | Central cache helpers | `CACHE` TTL presets + `invalidateAccelerate(tags)` wrapper |
| `app/_lib/products.ts` | Catalog readers | Add `cacheStrategy` to all reads; collapse `getProductDetail`; cache `getProducts`/`searchProducts` |
| `app/_lib/admin-kpis.ts` | Dashboard counts | `cacheStrategy` ttl 30 / swr 30 |
| `app/_lib/store-settings.ts` | Settings singleton | `cacheStrategy` ttl 300 |
| `app/admin/products/actions.ts` | Catalog write paths | Add `invalidateAccelerate` alongside `revalidateTag` |
| `app/admin/settings/actions.ts` | Settings write path | Add `invalidateAccelerate(["settings"])` |
| `app/_lib/__tests__/product-detail.test.ts` *(new)* | Waterfall test | Assert ≤2 query waves + correct assembled shape |
| `app/_lib/__tests__/cache.test.ts` *(new)* | Cache helper test | `invalidateAccelerate` swallows errors, passes tags |
| `scripts/measure-queries.ts` | Latency diagnostic | Point at `DIRECT_DATABASE_URL` |
| `.env.local` + Vercel env | Connection config | `DATABASE_URL` = Accelerate URL; add `DIRECT_DATABASE_URL` = direct TCP URL |

---

## Rollout step 1 — Pooling first (no caching)

Removes the serverless cold-connection tax with zero staleness risk. Independently deployable/revertible.

### Task 1: Switch Prisma to Accelerate (pooling only)

**Files:**
- Modify: `prisma/schema.prisma:1-4`
- Modify: `app/_lib/prisma.ts`
- Modify: `scripts/measure-queries.ts:84-93` (datasource URL selection)
- Modify: `.env.local` (+ Vercel env, manual)
- Modify: `package.json` (dependency)

- [ ] **Step 1: Install the Accelerate extension**

Run:
```bash
npm i @prisma/extension-accelerate
```
Expected: `@prisma/extension-accelerate` added to `dependencies` in `package.json`.

- [ ] **Step 2: Add env vars**

In `.env.local`, set `DATABASE_URL` to the Accelerate URL and add the direct URL under a new name (use the *current* `postgres://…db.prisma.io…` value as the direct one):
```
DATABASE_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=YOUR_ACCELERATE_KEY"
DIRECT_DATABASE_URL="postgres://USER:PASS@db.prisma.io:5432/postgres?sslmode=require"
```
Mirror both into the Vercel project (Production + Preview) env settings. Do not commit `.env.local`.

- [ ] **Step 3: Add `directUrl` to the datasource**

In `prisma/schema.prisma`, replace the datasource block:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")
}
```

- [ ] **Step 4: Extend the client with Accelerate**

Replace `app/_lib/prisma.ts` entirely with:
```ts
import { PrismaClient, Prisma } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

/**
 * Conservative pool sizing for DIRECT connections only (migrations, seed,
 * scripts/measure-queries.ts). The runtime client routes through Accelerate,
 * which pools for us — so no connection_limit is applied at runtime.
 */
export function withPoolDefaults(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "2");
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "20");
    return u.toString();
  } catch {
    return url;
  }
}

function createPrisma() {
  const log: Prisma.LogLevel[] =
    process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];
  // Reads DATABASE_URL (Accelerate) from env; Accelerate handles pooling.
  return new PrismaClient({ log }).$extends(withAccelerate());
}

export type AppPrisma = ReturnType<typeof createPrisma>;

const globalForPrisma = globalThis as unknown as { prisma?: AppPrisma };

export const prisma: AppPrisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 5: Point the diagnostic script at the direct URL**

In `scripts/measure-queries.ts`, change the env it reads so it uses the direct connection (Accelerate URL is not usable by the plain client there). Replace the `loadEnv(".env.local");` block's downstream `process.env.DATABASE_URL` references and the client construction:
```ts
const DIRECT_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasourceUrl: withPool(DIRECT_URL),
  log: ["error"],
});
```
And update the host log line to `new URL(DIRECT_URL ?? "postgres://?").host`.

- [ ] **Step 6: Regenerate the client and verify the build**

Run:
```bash
npx prisma generate
npm run build
```
Expected: `prisma generate` succeeds; `npm run build` completes with no `P2037: too many connections` error (Accelerate pooling resolves the build-time connection exhaustion).

- [ ] **Step 7: Verify migrations still work against the direct URL**

Run:
```bash
npx prisma migrate status
```
Expected: command connects via `DIRECT_DATABASE_URL` and reports migration status (no connection error).

- [ ] **Step 8: Re-measure to confirm pooling gains**

Run (against direct URL, reads only):
```bash
npx tsx scripts/measure-queries.ts
```
Expected: runs and prints latency table. Record the new cold/warm numbers in the spec's §7 for comparison.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma app/_lib/prisma.ts scripts/measure-queries.ts package.json package-lock.json
git commit -m "perf(db): route Prisma through Accelerate for serverless pooling"
```

---

## Rollout step 2 — Catalog caching

Adds the shared cross-instance cache + invalidation. Independently deployable.

### Task 2: Add central cache helpers

**Files:**
- Create: `app/_lib/cache.ts`
- Create: `app/_lib/__tests__/cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/cache.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { invalidate } = vi.hoisted(() => ({ invalidate: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: { $accelerate: { invalidate } },
}));

import { invalidateAccelerate, CACHE } from "../cache";

beforeEach(() => invalidate.mockReset());

describe("invalidateAccelerate", () => {
  it("passes tags through to $accelerate.invalidate", async () => {
    invalidate.mockResolvedValue(undefined);
    await invalidateAccelerate(["catalog", "featured"]);
    expect(invalidate).toHaveBeenCalledWith({ tags: ["catalog", "featured"] });
  });

  it("swallows errors (e.g. rate-limit) without throwing", async () => {
    invalidate.mockRejectedValue(new Error("429 rate limited"));
    await expect(invalidateAccelerate(["catalog"])).resolves.toBeUndefined();
  });

  it("exposes TTL presets", () => {
    expect(CACHE.catalogStable.ttl).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/cache.test.ts`
Expected: FAIL — `Cannot find module '../cache'`.

- [ ] **Step 3: Implement the cache helper**

Create `app/_lib/cache.ts`:
```ts
// Central cache TTL presets (seconds) and Accelerate tag invalidation.
import { prisma } from "@/app/_lib/prisma";

export const CACHE = {
  catalogStable: { ttl: 3600, swr: 86400 }, // categories
  catalogWarm: { ttl: 300, swr: 600 },      // featured, product detail, reviews
  deals: { ttl: 120, swr: 300 },
  catalogFiltered: { ttl: 60, swr: 300 },   // getProducts
  search: { ttl: 60, swr: 120 },            // searchProducts
  adminSummary: { ttl: 30, swr: 30 },       // dashboard KPIs, customers list
  settings: { ttl: 300, swr: 600 },
} as const;

/**
 * Invalidate Accelerate cache by tag. Best-effort: Accelerate invalidation is
 * rate-limited, so failures are swallowed — the TTL/swr window is the safety net.
 */
export async function invalidateAccelerate(tags: string[]): Promise<void> {
  try {
    await prisma.$accelerate.invalidate({ tags });
  } catch {
    // best-effort; ignore rate-limit / transient errors
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/cache.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/cache.ts app/_lib/__tests__/cache.test.ts
git commit -m "feat(cache): central TTL presets + Accelerate invalidation helper"
```

### Task 3: Add `cacheStrategy` to catalog readers

**Files:**
- Modify: `app/_lib/products.ts:68-207` (the `unstable_cache`-wrapped readers)

- [ ] **Step 1: Import the presets**

At the top of `app/_lib/products.ts`, after the existing imports, add:
```ts
import { CACHE } from "@/app/_lib/cache";
```

- [ ] **Step 2: Add `cacheStrategy` to `getCategories`**

In `getCategories`, change the query to:
```ts
const rows = await prisma.category.findMany({
  orderBy: { name: "asc" },
  cacheStrategy: { ...CACHE.catalogStable, tags: ["catalog", "categories"] },
});
```

- [ ] **Step 3: Add `cacheStrategy` to `getFeaturedProducts` and `getDealsProducts`**

In `getFeaturedProducts`, add to its `prisma.product.findMany({...})`:
```ts
cacheStrategy: { ...CACHE.catalogWarm, tags: ["catalog", "featured"] },
```
In `getDealsProducts`, add to its `prisma.product.findMany({...})`:
```ts
cacheStrategy: { ...CACHE.deals, tags: ["catalog", "deals"] },
```

- [ ] **Step 4: Add `cacheStrategy` to `getProductById`**

In `getProductById`, add to the `prisma.product.findUnique({...})`:
```ts
cacheStrategy: { ...CACHE.catalogWarm, tags: ["catalog", "product"] },
```

- [ ] **Step 5: Add `cacheStrategy` to review readers**

In `getProductReviews`, add to `prisma.review.findMany({...})`:
```ts
cacheStrategy: { ...CACHE.catalogWarm, tags: ["catalog", "product"] },
```
In `getReviewHistogram`, add to `prisma.review.groupBy({...})`:
```ts
cacheStrategy: { ...CACHE.catalogWarm, tags: ["catalog", "product"] },
```

> Note: `getProductDetail` is intentionally left for Task 5 (it is refactored there). The shared `attachAggregates` `groupBy` is left uncached because its `where: { productId: { in: ids } }` is high-cardinality; the wrapping readers' `unstable_cache` already memoizes the assembled result per instance.

- [ ] **Step 6: Verify type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors (`cacheStrategy` is valid on the Accelerate-extended client); build passes.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/products.ts
git commit -m "perf(catalog): add Accelerate cacheStrategy to catalog readers"
```

### Task 4: Invalidate Accelerate on catalog/settings writes

**Files:**
- Modify: `app/admin/products/actions.ts:13-17` (the `revalidate` helper)
- Modify: `app/admin/settings/actions.ts:26-29` (the `revalidate` helper)

- [ ] **Step 1: Add Accelerate invalidation to the products write path**

In `app/admin/products/actions.ts`, add the import:
```ts
import { invalidateAccelerate } from "@/app/_lib/cache";
```
Change the `revalidate` helper to also bust Accelerate (make it async and await the call):
```ts
async function revalidate(id?: string) {
  revalidatePath("/admin/products");
  if (id) revalidatePath(`/admin/products/${id}/edit`);
  revalidateTag("catalog", "max"); // bust the storefront unstable_cache readers
  await invalidateAccelerate(["catalog"]); // bust the shared Accelerate cache
}
```
Then update every caller to `await revalidate(...)` (they are already inside `async` functions): `updateStock`, `archiveProduct`, `unarchiveProduct`, `createCategory`, `createProduct`, `updateProduct`.

- [ ] **Step 2: Add Accelerate invalidation to the settings write path**

In `app/admin/settings/actions.ts`, add the import:
```ts
import { invalidateAccelerate } from "@/app/_lib/cache";
```
Change the `revalidate` helper:
```ts
async function revalidate() {
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  await invalidateAccelerate(["settings"]);
}
```
Update `save()` to `await revalidate();`.

- [ ] **Step 3: Verify existing admin tests still pass**

Run: `npx vitest run app/admin`
Expected: PASS. The `next/cache` mock already stubs `revalidatePath`/`revalidateTag`; the `prisma` mock has no `$accelerate`, so confirm `invalidateAccelerate` swallows the resulting error (it does, via try/catch). If any admin test mocks `@/app/_lib/cache`, leave it; otherwise no change needed.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/products/actions.ts app/admin/settings/actions.ts
git commit -m "perf(cache): invalidate Accelerate tags on catalog/settings writes"
```

---

## Rollout step 3 — Collapse the product-detail waterfall

Targets the single slowest page (509ms warm / 1.3s cold) via fewer round-trips. Pure code.

### Task 5: Refactor `getProductDetail` to ≤2 query waves

**Files:**
- Create: `app/_lib/__tests__/product-detail.test.ts`
- Modify: `app/_lib/products.ts:135-174` (`getProductDetail`)

- [ ] **Step 1: Write the failing test (asserts wave count + shape)**

Create `app/_lib/__tests__/product-detail.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { productFindUnique, productFindMany, reviewAggregate, reviewGroupBy } = vi.hoisted(() => ({
  productFindUnique: vi.fn(),
  productFindMany: vi.fn(),
  reviewAggregate: vi.fn(),
  reviewGroupBy: vi.fn(),
}));

vi.mock("@/app/_lib/cache", () => ({ CACHE: { catalogWarm: { ttl: 300, swr: 600 } } }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    product: { findUnique: productFindUnique, findMany: productFindMany },
    review: { aggregate: reviewAggregate, groupBy: reviewGroupBy },
  },
}));

import { getProductDetail } from "../products";

beforeEach(() => {
  productFindUnique.mockReset();
  productFindMany.mockReset();
  reviewAggregate.mockReset();
  reviewGroupBy.mockReset();
});

describe("getProductDetail", () => {
  it("returns null when the product is missing", async () => {
    productFindUnique.mockResolvedValue(null);
    expect(await getProductDetail("missing")).toBeNull();
  });

  it("assembles product + ratings + related, in at most 2 query waves", async () => {
    productFindUnique.mockResolvedValue({
      id: "p1", name: "Tee", price: 10, originalPrice: null, image: "i", description: "d",
      stock: 5, categorySlug: "tops", sizes: "S,M", archived: false,
      category: { slug: "tops", name: "Tops", image: "c" }, images: [],
    });
    reviewAggregate.mockResolvedValue({ _avg: { rating: 4 }, _count: { _all: 3 } });
    productFindMany.mockResolvedValue([
      { id: "p2", name: "Other", price: 12, originalPrice: null, image: "i2", categorySlug: "tops", sizes: "M" },
    ]);
    reviewGroupBy.mockResolvedValue([{ productId: "p2", _avg: { rating: 5 }, _count: { _all: 2 } }]);

    const result = await getProductDetail("p1");

    expect(result).not.toBeNull();
    expect(result!.ratingAvg).toBe(4);
    expect(result!.ratingCount).toBe(3);
    expect(result!.related[0]).toMatchObject({ id: "p2", rating: 5, reviewCount: 2 });

    // Wave 1 = findUnique. Wave 2 = Promise.all(aggregate, related-with-ratings).
    // There must be NO third sequential groupBy wave after the related findMany.
    expect(productFindUnique).toHaveBeenCalledTimes(1);
    expect(reviewAggregate).toHaveBeenCalledTimes(1);
    expect(productFindMany).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/product-detail.test.ts`
Expected: FAIL — current `getProductDetail` calls `attachAggregates(relatedRows)` *after* the `Promise.all`, producing a 3rd sequential wave and an extra `review.groupBy` outside the parallel block (assertions on shape may also mismatch depending on ordering).

- [ ] **Step 3: Refactor to collapse the trailing wave**

Replace the body of `getProductDetail` (the `unstable_cache` callback at `app/_lib/products.ts:135-174`) with a version that fetches related-product ratings *inside* the same parallel wave, removing the trailing `attachAggregates` round-trip:
```ts
export const getProductDetail = unstable_cache(
  async (id: string): Promise<ProductDetail | null> => {
    const product = await prisma.product.findUnique({
      where: { id, archived: false },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
      },
      cacheStrategy: { ...CACHE.catalogWarm, tags: ["catalog", "product"] },
    });
    if (!product) return null;

    const relatedRows = await prisma.product.findMany({
      where: { archived: false, categorySlug: product.categorySlug, id: { not: id } },
      take: 4,
      orderBy: { id: "asc" },
      select: {
        id: true, name: true, price: true, originalPrice: true,
        image: true, categorySlug: true, sizes: true,
      },
      cacheStrategy: { ...CACHE.catalogWarm, tags: ["catalog", "product"] },
    });
    const relatedIds = relatedRows.map((r) => r.id);

    // Wave 2: this product's aggregate AND the related products' aggregates,
    // issued together — no third sequential round-trip.
    const [agg, relatedGrouped] = await Promise.all([
      prisma.review.aggregate({
        where: { productId: id },
        _avg: { rating: true },
        _count: { _all: true },
        cacheStrategy: { ...CACHE.catalogWarm, tags: ["catalog", "product"] },
      }),
      relatedIds.length
        ? prisma.review.groupBy({
            by: ["productId"],
            where: { productId: { in: relatedIds } },
            _avg: { rating: true },
            _count: { _all: true },
          })
        : Promise.resolve([] as { productId: string; _avg: { rating: number | null }; _count: { _all: number } }[]),
    ]);

    const ratingMap = new Map(
      relatedGrouped.map((g) => [g.productId, { avg: g._avg.rating ?? 0, count: g._count._all }]),
    );
    const related: ProductView[] = relatedRows.map((p) => {
      const a = ratingMap.get(p.id) ?? { avg: 0, count: 0 };
      return {
        id: p.id, name: p.name, price: p.price, originalPrice: p.originalPrice ?? null,
        image: p.image, rating: a.avg, reviewCount: a.count, category: p.categorySlug, sizes: p.sizes,
      };
    });

    return {
      product,
      ratingAvg: agg._avg.rating ?? 0,
      ratingCount: agg._count._all,
      related,
    };
  },
  ["product-detail"],
  { tags: ["catalog", "product"], revalidate: 300 }
);
```

> This keeps the `findUnique` as wave 1 and the related `findMany` as a small second read, then issues this product's aggregate together with the related-ratings `groupBy` in one parallel wave. The previous version's 3rd sequential `groupBy` (via `attachAggregates`) is eliminated. (`findUnique` and the related `findMany` could be merged further, but keeping them separate preserves the `null`-early-return and is the conservative collapse.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/product-detail.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS — no regressions in existing product/catalog tests.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/products.ts app/_lib/__tests__/product-detail.test.ts
git commit -m "perf(product): collapse getProductDetail to 2 query waves"
```

---

## Rollout step 4 — Cache the uncached readers

### Task 6: Add `cacheStrategy` to `getProducts` and `searchProducts`

**Files:**
- Modify: `app/_lib/products.ts:300-307` (`getProducts` query) and `app/_lib/products.ts:322-337` (`searchProducts` query)

- [ ] **Step 1: Add `cacheStrategy` to `getProducts`**

In `getProducts`, add to the `prisma.product.findMany({...})` at the end of the options object:
```ts
cacheStrategy: { ...CACHE.catalogFiltered, tags: ["catalog"] },
```

- [ ] **Step 2: Add `cacheStrategy` to `searchProducts`**

In `searchProducts`, add to the `prisma.product.findMany({...})`:
```ts
cacheStrategy: { ...CACHE.search, tags: ["catalog"] },
```

- [ ] **Step 3: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 4: Re-measure the previously-uncached readers**

Run: `npx tsx scripts/measure-queries.ts`
Expected: `getProducts` / `searchProducts` lines show reduced warm latency on repeat (note: the script uses the direct URL, so it measures origin query time, not the Accelerate cache hit — the cache-hit win is validated on a deployed preview in Task 8).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/products.ts
git commit -m "perf(catalog): cache getProducts and searchProducts via Accelerate"
```

---

## Rollout step 5 — Admin balanced caching

Cache analytics/summary short-TTL; keep operational data (orders, stock, payments, dispatch) live.

### Task 7: Cache dashboard KPIs and store settings

**Files:**
- Modify: `app/_lib/admin-kpis.ts:20-27` (`getDashboardKpis`)
- Modify: `app/_lib/store-settings.ts:25-38` (`getStoreSettings`)

- [ ] **Step 1: Cache the dashboard counts**

In `app/_lib/admin-kpis.ts`, add the import:
```ts
import { CACHE } from "@/app/_lib/cache";
```
Add `cacheStrategy: { ...CACHE.adminSummary, tags: ["admin-kpis"] }` to each of the four `count(...)` calls inside the `Promise.all`. Update the file's leading comment to note the 30s TTL and that `pendingDispatch`/`pendingCod` accept ≤30s staleness (per spec §13 open question 3 — leave at 30s unless the user chose no-cache for those two).

- [ ] **Step 2: Cache the settings singleton read**

In `app/_lib/store-settings.ts`, add the import:
```ts
import { CACHE } from "@/app/_lib/cache";
```
Add `cacheStrategy: { ...CACHE.settings, tags: ["settings"] }` to the `findUnique` on line 26 only (leave the post-create re-read uncached — it runs once at seed time). The settings write path already invalidates the `settings` tag (Task 4, Step 2).

- [ ] **Step 3: Confirm operational pages remain uncached**

Verify (read-only check, no edits) that these readers have NO `cacheStrategy`: admin orders list/detail queries, `app/admin/products` stock/list queries, and any payment/dispatch reads. Per spec §5.4 these stay live. If any are found cached, remove it.

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-kpis.ts app/_lib/store-settings.ts
git commit -m "perf(admin): short-TTL cache for dashboard KPIs and store settings"
```

---

## Verification

### Task 8: End-to-end verification and measurement

**Files:**
- Modify: `docs/superpowers/specs/2026-06-04-server-side-data-perf-design.md` (record measured deltas in §7)

- [ ] **Step 1: Full build + unit gate**

Run: `npm run build && npx vitest run`
Expected: both green (per CLAUDE.md, build must pass before merge).

- [ ] **Step 2: Cache-correctness check on a deployed preview**

Deploy to a Vercel preview (Accelerate + `DIRECT_DATABASE_URL` env set). Then:
- Load a product detail page twice; second load should be materially faster (Accelerate hit).
- In admin, edit a product (name/price) → reload the catalog/product page → change appears within the invalidation window.
- In admin, change an order's status → the orders list reflects it immediately (no-cache).
Expected: all three behave as described.

- [ ] **Step 3: Record measured deltas**

Update spec §7 with before/after cold/warm numbers from `scripts/measure-queries.ts` and any preview-observed cache-hit latencies.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-04-server-side-data-perf-design.md
git commit -m "docs(perf): record measured Accelerate latency deltas"
```

- [ ] **Step 5: Open PR**

```bash
git push -u origin <branch>
gh pr create --base main --title "perf(data): Prisma Accelerate + query optimization" --body-file <body>
```
PR body should note: external prerequisite (Accelerate enabled + Vercel env vars set), the 5-step rollout, and that each step is independently revertible (revert the env URL + remove `cacheStrategy` to fully back out).

---

## Self-Review

**Spec coverage:**
- Accelerate pooling → Task 1. ✓
- `cacheStrategy` on catalog readers → Task 3. ✓
- Collapse `getProductDetail` waterfall → Task 5. ✓
- Cache `getProducts`/`searchProducts` → Task 6. ✓
- Balanced admin policy (cache KPIs/settings, keep orders/stock/payments/dispatch live) → Task 7. ✓
- Dual-layer invalidation (`revalidateTag` + Accelerate) → Tasks 2 & 4. ✓
- Accelerate setup steps (directUrl, env, generate) → Task 1. ✓
- Per-page TTLs → centralized in `CACHE` (Task 2), applied in Tasks 3/6/7. ✓
- Risks/rollout/testing → 5-step ordering + Task 8. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. The only intentional `<placeholder>` is the PR branch/body in Task 8 Step 5 (runtime values), which is unavoidable.

**Type consistency:** `invalidateAccelerate(tags: string[])` and `CACHE.*` presets defined in Task 2 are used consistently in Tasks 3/4/6/7. `AppPrisma` type (Task 1) backs the extended-client methods (`$accelerate`, `cacheStrategy`) used throughout. `ProductView`/`ProductDetail` shapes in Task 5 match the existing exports in `products.ts`.

**Open items carried from spec §13 (confirm with user before/while executing):**
1. Dual-layer vs Accelerate-only — plan implements dual-layer (keeps `unstable_cache`).
2. Accelerate plan/quota + turnkey Accelerate URL — external prerequisite, blocks Task 1.
3. Dashboard KPI TTL for `pendingDispatch`/`pendingCod` — plan uses 30s; switch to no-cache for those two if the user prefers.
