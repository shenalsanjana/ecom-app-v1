# Server-Side Data Performance — Prisma Accelerate + Query Optimization

**Date:** 2026-06-04
**Status:** Draft design, pending user approval
**Author:** brainstorming session
**Related:** [`2026-06-04-smooth-navigation-design.md`](./2026-06-04-smooth-navigation-design.md) — this is effectively the **Phase 2** data-layer work that doc defers ("`getProducts` uncached", "uncached live queries").

---

## 1. Problem

Data-heavy pages are slow **to render on the server**: product lists, product
detail, admin orders, and the admin dashboard. The original hypothesis (Redis +
Celery, or swapping Prisma for raw Postgres) was investigated and rejected — see
§3.

## 2. Diagnosis (measured, not inferred)

Read-only timing run against the live Prisma Postgres (`db.prisma.io`),
`scripts/measure-queries.ts`, cold = first call, warm = repeat:

| Query | Cold | Warm | Round-trips |
|---|---|---|---|
| `categories.findMany` | 176ms | **76ms** | 1 |
| `featured` (find + groupBy) | 178ms | 75ms | 2 |
| `getProducts` all + groupBy *(uncached)* | 351ms | 159ms | 2 |
| `searchProducts('shirt')` *(uncached)* | 158ms | 85ms | 2 |
| **`getProductDetail` (3 waves)** | **1323ms** | **509ms** | 3–4 |
| `admin orders list` (find + count) | 594ms | 266ms | 2 |

**Root causes, in order of impact:**

1. **Network latency dominates — ~75ms per round-trip floor.** A single trivial
   query is 76ms warm; that is almost pure wire time to the remote DB. Page
   latency ≈ `round-trips × ~75ms`.
2. **`getProductDetail` does 3–4 *sequential* waves** → it is the worst page
   (509ms warm / 1.3s cold).
3. **Cold ≈ 2× warm, and on serverless almost every request is cold** — fresh
   instances pay a connection-setup tax on each invocation (the existing
   `connection_limit=2` / P2037 note in `app/_lib/prisma.ts` is this same issue
   surfacing as latency).
4. **`getProducts()` / `searchProducts()` are uncached** — every filter/search
   pays full origin round-trips.
5. Schema is **already well-indexed** (`Product` on `categorySlug`/`archived`,
   `Review` on `productId+createdAt`, `Order` on 5 indexes) — indexes are **not**
   the bottleneck.

## 3. Non-goals (explicitly rejected, with evidence)

- **Redis / a Redis `cacheHandler`** — would only replicate a *subset* of
  Accelerate (cross-instance catalog cache) while requiring a new service. It
  cannot cache auth-gated admin queries. Accelerate strictly dominates it here.
- **Celery** — Python-only task queue; cannot run in this Node/Next.js app, and
  background jobs are unrelated to render latency. (If a Node job queue is ever
  needed, that is BullMQ, and a separate spec.)
- **Swapping Prisma for raw Postgres (`pg`/`postgres.js`/Drizzle)** — disproven
  by measurement: a single query is ~99% wire time, so a leaner driver has
  nothing to shave. Same hops, same latency. Large rewrite, no payoff.

## 4. Solution overview

Three levers, ranked by payoff:

1. **Prisma Accelerate** (keep Prisma, no new infra) — serverless connection
   pooling (kills the cold 2× tax) **+** a global query cache via per-query
   `cacheStrategy` (turns repeat reads into edge cache hits) **+** the ability to
   cache **admin queries** that `unstable_cache` cannot (auth-gated).
2. **Collapse `getProductDetail`'s query waterfall** (pure code) — targets the
   single slowest page.
3. **Cache `getProducts()` / `searchProducts()`**.

---

## 5. Detailed design

### 5.1 Lever 1 — Prisma Accelerate

**Connection / driver changes:**

- `prisma/schema.prisma` datasource gains a `directUrl` for migrations:
  ```prisma
  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")        // Accelerate URL at runtime
    directUrl = env("DIRECT_DATABASE_URL") // direct TCP for migrate/introspect
  }
  ```
- `app/_lib/prisma.ts`:
  - Extend the client with `withAccelerate()`:
    ```ts
    import { withAccelerate } from "@prisma/extension-accelerate";
    const prisma = new PrismaClient({ log }).$extends(withAccelerate());
    ```
  - Update the `globalForPrisma` singleton type to the extended client type.
  - `withPoolDefaults()` (`connection_limit=2`) becomes a **no-op on the
    Accelerate URL** (Accelerate pools for us). Keep the helper only for the
    `DIRECT_DATABASE_URL` path used by scripts/migrations.

**Caching model — dual layer, deliberate:**

- Existing `unstable_cache` wrappers stay as a **per-instance fast path** (also
  caches the post-query `attachAggregates` JS work).
- Accelerate `cacheStrategy` is added on the **underlying queries** as the
  **cross-instance + cold-start-proof** layer. When Next's per-instance cache
  misses (cold instance), Accelerate still serves from its edge cache instead of
  hitting Postgres.
- **Invalidation** therefore has two paths on write:
  - `revalidateTag(...)` — already in place for the Next layer.
  - `prisma.$accelerate.invalidate({ tags: [...] })` — **new**, called in the
    same admin write paths that already call `revalidateTag`.
- *Simpler alternative (see §10 Open Questions):* drop `unstable_cache` and rely
  on Accelerate `cacheStrategy` as the **single** cache layer — one mental model,
  one invalidation path. Recommended if the dual-layer invalidation proves
  fiddly in review.

### 5.2 Lever 2 — Collapse `getProductDetail` waterfall

Current: `findUnique(include)` → `Promise.all(review.aggregate, related.findMany)`
→ `attachAggregates(related)` (a 3rd `groupBy` wave). Target: **≤2 waves**.

- Fold the related-products rating aggregate into the same wave as the related
  `findMany` (already parallel) — eliminate the separate trailing `groupBy` by
  computing related ratings in one `groupBy` issued alongside, or via a single
  `$queryRaw` that returns related rows + their avg/count together.
- Net: 3–4 waves → 2 waves. Projected cold ~1.3s → ~0.7–0.8s; warm 509ms →
  ~250ms; **cache hit → ~20ms**.

### 5.3 Lever 3 — Cache `getProducts()` / `searchProducts()`

- Add `cacheStrategy` to both readers' Prisma queries.
- **Filtered catalog** (`getProducts`) is high-cardinality (filter permutations).
  Use a **short ttl + swr** so popular filter combos cache without unbounded
  growth; Accelerate keys on the query + args automatically.
- **Search** (`searchProducts`) is the highest-cardinality. Cache with a short
  ttl so repeated/popular terms benefit; unique terms simply miss (no worse than
  today).

### 5.4 Admin caching policy (balanced)

| Admin data | Source | Policy | Rationale |
|---|---|---|---|
| Dashboard KPI tiles | `getDashboardKpis()` (4 COUNTs) | `ttl 30s, swr 30s` | Summary counts tolerate brief staleness. **Caveat:** `pendingDispatch` + `pendingCod` are operational — 30s is the deliberate ceiling; lower to 15s if ops feels stale. |
| Customers list | `app/admin/customers` | `ttl 30s, swr 60s` | Analytical, low mutation rate. |
| **Orders list / order detail** | `app/admin/orders` | **No cache** (or `ttl 5s`) | Operational; staleness causes wrong dispatch/payment decisions. |
| **Inventory / stock** (products list) | `app/admin/products` | **No cache** (or `ttl 5s`) | Stock drives fulfillment correctness. |
| **Payments / dispatch** mgmt | order detail actions | **No cache** | Must be live. |
| Store settings (singleton) | `getStoreSettings()` | `ttl 300s` + invalidate on save | Rarely changes; invalidate on admin write. |

---

## 6. Cache strategy & TTL recommendations (catalog)

`cacheStrategy: { ttl, swr }` — `ttl` = serve-fresh window, `swr` =
stale-while-revalidate grace. Aligned with today's `unstable_cache` revalidate
values where they exist.

| Reader | ttl | swr | Notes |
|---|---|---|---|
| `getCategories` | 3600s | 86400s | Near-static. |
| `getFeaturedProducts` | 300s | 600s | Matches current `revalidate: 300`. |
| `getDealsProducts` | 120s | 300s | Matches current `revalidate: 120`. |
| `getProductById` / `getProductDetail` | 300s | 600s | Matches current. |
| `getProductReviews` / `getReviewHistogram` | 300s | 600s | |
| `getProducts` (filtered) | 60s | 300s | High cardinality — short ttl. |
| `searchProducts` | 60s | 120s | Highest cardinality. |

All catalog reads keep their existing tags (`catalog`, `featured`, `product`,
…); admin write paths invalidate the matching Accelerate tags.

## 7. Expected performance improvements

| Page / query | Today (warm origin) | After (cache hit) | After (cold, pooled+collapsed) |
|---|---|---|---|
| Product detail | 509ms (1.3s cold) | **~20ms** | ~0.7–0.8s |
| Catalog list (filtered) | 159ms | **~15ms** | ~150ms first fill |
| Search (popular term) | 85ms | **~15ms** | ~85ms first fill |
| Admin dashboard | 266ms each load | **~20ms** within 30s window | — |
| Cold-start tax (2× penalty) | present every cold req | **largely removed** by pooling | — |

Headline: repeat reads drop from **~75–500ms to ~15–20ms** (cache hits served
from Accelerate's edge, no origin hop); the worst page (product detail) improves
**~25×** on a hit and ~40% even on a miss after the waterfall collapse.

## 8. Required code changes (file-by-file)

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `directUrl` to datasource. |
| `app/_lib/prisma.ts` | `$extends(withAccelerate())`; update singleton type; scope `withPoolDefaults` to direct URL only. |
| `app/_lib/products.ts` | Add `cacheStrategy` to all read queries; **collapse `getProductDetail` waves**; add `cacheStrategy` to `getProducts`/`searchProducts`. |
| `app/_lib/admin-kpis.ts` | Add `cacheStrategy: { ttl: 30, swr: 30 }` to the 4 counts. |
| `app/_lib/store-settings.ts` | `cacheStrategy: { ttl: 300 }` + invalidate on save. |
| Admin write paths (`app/admin/**/actions.ts`) | Alongside existing `revalidateTag`, add `prisma.$accelerate.invalidate({ tags })` for catalog/settings mutations. |
| `package.json` | `+ @prisma/extension-accelerate`. |
| `.env.local` / Vercel env | `DATABASE_URL` → Accelerate URL; add `DIRECT_DATABASE_URL` → current direct TCP URL. |
| `scripts/measure-queries.ts` | Keep as a perf-diagnostic (point at `DIRECT_DATABASE_URL`), or delete. |

## 9. Prisma Accelerate setup steps

1. In the **Prisma Console / Data Platform**, enable **Accelerate** on the
   existing Prisma Postgres project and copy the Accelerate connection string
   (`prisma+postgres://accelerate.prisma-data.net/?api_key=…`).
   **⚠️ Verify this is turnkey for the instance before building** — current
   `DATABASE_URL` is a direct `postgres://` TCP string, not the Accelerate
   protocol URL.
2. `npm i @prisma/extension-accelerate`.
3. Env: set `DATABASE_URL` = Accelerate URL; set `DIRECT_DATABASE_URL` = the
   current direct TCP URL (used by `prisma migrate`, seed, and the measure
   script). Mirror both into **Vercel** project env (Production + Preview).
4. `schema.prisma`: add `directUrl = env("DIRECT_DATABASE_URL")`.
5. `prisma generate` (Accelerate requires the generated client; on Vercel ensure
   `prisma generate` runs in the build step).
6. Extend the client with `withAccelerate()` in `app/_lib/prisma.ts`.
7. Add `cacheStrategy` to reads per §6/§5.4; add `$accelerate.invalidate` to
   write paths.

## 10. Risks & trade-offs

- **Dual cache layer (Next `unstable_cache` + Accelerate)** → two invalidation
  paths. Mitigation: invalidate both in the same write functions; or adopt the
  Accelerate-only simplification (§5.1).
- **Stale admin data** if TTLs set too high on operational pages. Mitigation:
  orders/stock/payments are **no-cache** by policy; dashboard capped at 30s.
- **Accelerate availability / pricing** — depends on the Prisma Postgres plan;
  has request-based limits. Verify quota fits expected traffic (step 1).
- **Migrations need `directUrl`** — forgetting it breaks `prisma migrate`
  against Accelerate. Covered in §9.
- **Vendor coupling** to Accelerate. Acceptable: already on Prisma Postgres;
  reversible by reverting the env URL + removing `cacheStrategy`.
- **Cache-key cardinality** for `getProducts`/search — bounded by short ttl.

## 11. Rollout plan

1. **Pooling first, no caching** — switch to Accelerate URL + `directUrl`, extend
   client, deploy. Validates connectivity/migrations and removes the cold-start
   tax with zero staleness risk. Re-run `scripts/measure-queries.ts` (via
   `DIRECT_DATABASE_URL`) to confirm pooling gains.
2. **Catalog caching** — add `cacheStrategy` to catalog readers + invalidation.
   Verify shopper pages + that admin edits reflect after invalidation.
3. **Waterfall collapse** — refactor `getProductDetail`; assert identical output
   via existing/added tests.
4. **Uncached readers** — `getProducts`/`searchProducts` caching.
5. **Admin balanced caching** — dashboard/customers/settings TTLs; confirm
   orders/stock/payments remain live.

Each step is independently deployable and revertible.

## 12. Testing plan

- **Unit/integration (vitest):** `getProductDetail` returns identical shape
  before/after the waterfall refactor; `cacheStrategy` presence doesn't alter
  results; invalidation helpers call the right tags.
- **Latency regression:** re-run `scripts/measure-queries.ts` after steps 1–4;
  record cold/warm deltas in this doc.
- **Cache-correctness E2E (playwright):** edit a product in admin → catalog
  reflects the change within the invalidation window; order status change shows
  immediately (no-cache) on the orders list.
- **Build gate:** `npm run build` green (per CLAUDE.md) with `prisma generate`
  in the pipeline.
- **Vercel preview:** verify env wiring + a real cold-start latency sample on a
  preview deployment.

## 13. Open questions

1. **Dual-layer vs Accelerate-only** (§5.1) — keep `unstable_cache` as a fast
   path, or simplify to Accelerate as the single cache layer? *Recommendation:
   start dual-layer; collapse to Accelerate-only if invalidation is noisy.*
2. **Accelerate plan/quota** confirmed for expected traffic? (step 1)
3. Dashboard KPI ttl — **30s** acceptable for `pendingDispatch`/`pendingCod`, or
   drop those two to **no-cache** and cache only `todaysOrders`/`lowStock`?
