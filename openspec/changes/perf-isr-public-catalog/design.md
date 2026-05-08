## Context

The storefront is a Next.js 16 app on Tailwind v4 with shadcn-derived primitives, deployed on Vercel with a Postgres backend via Prisma. The just-merged `visual-refresh-boutique` change retypeset the site to a boutique identity but did not touch performance. The build output (commit `a24ddbc`) marked every route as `ƒ Dynamic`. Live measurement against `https://www.dressingbear.com` (curl from this developer's machine, sin1 edge → iad1 compute):

| Route | Cold TTFB | Warm TTFB | HTML size |
|---|---:|---:|---:|
| `/` | 2.67s | 0.85s | 58 KB |
| `/categories` | 1.92s | — | 109 KB |
| `/products/[id]` | **4.46s** | **3.27s** | 128 KB |
| `/deals` | (untimed in baseline) | — | — |
| `/cart` | 0.83s | — | 44 KB |
| `/login` | 0.76s | — | 35 KB |

Vercel response headers: `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` on every catalog response, `X-Vercel-Cache: MISS` invariably. `X-Vercel-Id: sin1::iad1::...` indicates Singapore edge / Virginia compute — relevant only if the DB isn't in iad1; out of scope to fix here. Pattern is unmistakable: routes that read product/category data via Prisma are slow; routes that don't are fast. Diagnosis: zero edge caching on the hot public catalog routes, with Prisma calls dominating the warm TTFB.

The brainstorming session settled on Strategy A (caching first, ship + measure) before going broader. The advisor checkpoint then surfaced the auth-coupling prerequisite (see Decisions § "Phase A is a prerequisite, not parallel work").

## Goals / Non-Goals

**Goals:**
- Take warm TTFB on cached hits from 0.85s–3.27s down to **< 200ms target** across `/`, `/categories`, `/categories/[slug]`, `/products/[id]`, `/deals`. Pass threshold: < 400ms (< 500ms PDP allowance).
- LCP < 2.5s mobile on PDP per CWV "good".
- Zero behavioral or visual regressions on the public catalog. The boutique identity ships as-is.
- Establish architecture-going-forward: user-specific state is client-hydrated, never SSR'd inside cacheable trees.
- One atomic ship: Phase A (decoupling) + Phase B (cache adds) together. Phase A alone is silent; Phase B alone is inert.

**Non-Goals:**
- Optimistic UI on cart and checkout server actions (the "button feels slow" symptom). Only the wishlist heart benefits from `useOptimistic` here; cart/checkout actions are a separate change.
- `react.cache` per-request memoization. Orthogonal to `unstable_cache` and reserved for a measurement-driven follow-up if Phase B doesn't move the needle far enough.
- DB region locality. A Vercel/DB-host setting, not a code change.
- Fraunces font tuning, image LCP, bundle size, code-splitting. Defer to a measurement-driven Phase 2 if needed.
- On-demand cache busting via `revalidatePath` / `revalidateTag` from admin write paths. The admin OpenSpec change is upstream of this; tags are pre-set so the future addition is one-line per action.
- PPR (Partial Prerendering) — experimental, not adopting.
- The `'use cache'` directive (Next 15+) — also experimental; sticking with stable `revalidate` + `unstable_cache`.
- Service-worker / client-side cache.
- Search-route caching (per-query, low repeat-hit value).
- Cookie-based variant caches (would defeat the win).
- Visual changes of any kind — the boutique tokens shipped in `visual-refresh-boutique` are the contract this change preserves.

## Visual direction

Not applicable — this change has zero user-visible visual content. The architectural rule below is the design contract.

## Decisions

### Phase A is a prerequisite, not parallel work

The first-pass design positioned auth decoupling as Section 3 mitigation alongside cache adds. Advisor #1 challenge revealed it's a hard prerequisite: any `auth()` / `cookies()` / `headers()` call in the page render tree opts the route out of static rendering regardless of `revalidate`. Live audit confirmed:
- `app/_components/home/site-header.tsx` line 19 — `auth()` (renders on every page)
- `app/_components/home/product-grid.tsx` — `auth()` + `getWishlistProductIds()`
- `app/_components/home/deals-section.tsx` — `auth()` + `getWishlistProductIds()`
- `app/products/[id]/page.tsx` line 60 — `auth()` + `getWishlistProductIds()`

Without removing these, `revalidate` is a no-op; with them removed, `revalidate` lights up immediately. The two phases ship as one change because they're load-bearing for each other.
**Alternatives considered:** (a) Cache only the routes that don't need auth-decoupling — there are none, because `SiteHeader` is on every page. (b) Split into two changes — possible, but Phase A alone is silent (no observable improvement) and shipping it without Phase B leaves a "decoupled but not yet faster" state that's hard to validate visually. Single change is cleaner.

### `unstable_cache` over `react.cache` for v1

`react.cache` dedupes within a single request. `unstable_cache` dedupes across requests via Next.js's data cache layer, with tag-based invalidation. The bigger lever for this codebase is `unstable_cache` because every page hit is currently a fresh function invocation; `react.cache` would only help if a single render called the same Prisma function many times (it does, in some places, but that's secondary).
**Decision:** `unstable_cache` wrappers in `app/_lib/products.ts` for the five hot reads (`getCategoryList`, `getProductDetail`, `getProductsByCategory`, `getDeals`, the home-page featured-products read). Pre-tag every wrapper now (`catalog`, `categories`, `product`, `category-products`, `deals`, `featured`) so the future admin write paths can drop in `revalidateTag('product')` etc. without touching this file again.
**Alternatives:** `react.cache` (doesn't help across requests; rejected for v1), `'use cache'` directive (experimental; rejected).
**Foot-gun documented:** `unstable_cache` callbacks MUST NOT call `auth()` / `cookies()` / `headers()`. Anyone wrapping a "personalized" reader (e.g., `getProductsForUser(userId)`) will get a runtime throw. The five wrappers in scope are pure DB reads; safe.

### `searchParams` keeps PDP / categories / deals dynamic — accepted; data-cache wins remain

Implementation surfaced a Next.js 15/16 behavior the original design didn't account for: accessing `await searchParams` inside a page render opts the route out of static rendering, regardless of an `export const revalidate = N` declaration. PDP (`?reviews=N`), `/categories` (`?sort=&page=`), `/categories/[slug]` (same), and `/deals` (same) all read `searchParams`, so they remain `ƒ Dynamic` in the build output despite the cache adds. Home (`/`) doesn't read `searchParams` and DOES flip to `○ Static` (with `Revalidate 2m`, clamped down from the page-level 5m by the inner `getDealsProducts` cache window — Next uses the tightest revalidate from the page's data fetches).

**Decision:** accept the dynamic mark on those four routes. The page render function still runs per-request, BUT the underlying Prisma reads (`getProductDetail`, `getProductReviews`, `getReviewHistogram`, `getCategories`, `getDealsProducts`, `getFeaturedProducts`) are now wrapped in `unstable_cache` and hit the data cache within the configured revalidate windows. Net effect: PDP's warm TTFB still drops substantially (cache-hit Prisma calls are ~10ms vs cross-region ~300ms+), just not down to "edge cache" levels.

**Alternatives considered:**
- (a) Move `searchParams` access into a client component wrapped in `<Suspense>` so the static shell can prerender — this is essentially Partial Prerendering by hand; we explicitly excluded PPR for this change.
- (b) Eliminate `searchParams` entirely by rebuilding sort/filter/pagination as client-only state — feature change, out of scope.
- (c) Accept the dynamic mark + rely on `unstable_cache` data-layer dedup — picked. Lowest risk, partial-but-real win, and the remaining route-level caching can be unlocked in a follow-up that does the Suspense restructure.

### `revalidate` per-route values

| Route | `revalidate` (s) | Reasoning |
|---|---:|---|
| `/` | 300 (5 min) | Featured products + deals section can be slightly stale |
| `/categories` | 3600 (1 hr) | Category list rarely changes |
| `/categories/[slug]` | 300 (5 min) | Price/stock changes need to surface within minutes |
| `/products/[id]` | 300 (5 min) | PDP — biggest single win since it's currently 3.3s warm |
| `/deals` | 120 (2 min) | Sale items churn; tighter window |
| `/about`, `/contact`, `/privacy-policy`, `/terms-and-conditions`, `/refund-policy` | `force-static` | Marketing — build-time only |

Background regeneration on access is built into Next.js ISR — the user request after `revalidate` elapses gets the stale cached page immediately AND triggers a regeneration. No user waits for the regeneration.
**Alternatives:** tighter (60s on PDP) — rejected as overkill given low write rate; looser (e.g., 1 hr on PDP) — rejected because price/stock freshness matters commercially.

### Wishlist provider mirrors `CartProvider`'s shape

The codebase has a working `<CartProvider>` pattern. New `<WishlistProvider>` adopts the same shape: client component, mounted in `app/layout.tsx`, exposes a `useWishlist()` hook returning `{ ids: Set<string>, toggle: (id) => void }`. Hydrates on mount via `GET /api/wishlist/ids`.
**Decision:** mirror, don't innovate. New file `app/_lib/wishlist-context.tsx` next to `cart-context.tsx`. New route handler `app/api/wishlist/ids/route.ts` (read-only, GET only).
**Alternatives:** server-action-driven hydration (`useFormState` style) — adds complexity for no benefit. RSC-fragment hydration with cookie-keyed cache vary — defeats the win we're chasing.

### `useOptimistic` only on the wishlist heart, not on cart/checkout

Wishlist toggling has trivial state (a Set membership) and a single mutation surface. Easy `useOptimistic`, instant feedback.
Cart/checkout server actions are stateful (quantity, line items, totals) with multiple side effects (cart context update, free-shipping recalc). Optimistic UI there is more involved and deserves its own brainstorm — separate change.
**Decision:** scope `useOptimistic` to the heart only in this change.

### `force-static` is safe for marketing pages even with forms

`/contact` has a form with a server action. `force-static` doesn't break server actions — they're posted to dynamic action endpoints regardless of whether the page-shell is static. Verified during implementation that there's no dynamic initial-state rendering on the contact page (e.g., flashing a previously-submitted message).

## Risks / Trade-offs

- **R1 — A user-specific surface I missed gets cached.** Mitigation: exhaustive grep for `auth()` / `cookies()` / `headers()` / `useSession()` inside the cacheable route trees as a pre-merge gate. The architectural rule is encoded in the spec — future additions need to follow it.
- **R2 — Stale price/stock for up to `revalidate` seconds.** Mitigation: 5-min window on PDP and category pages is reasonable e-com tolerance. When the admin work lands, `revalidateTag('product')` on price/stock mutations drops this to seconds.
- **R3 — Wishlist heart flicker on logged-in users.** Cached HTML renders empty hearts; client hydration fills them ~50–100ms post-first-paint. Below typical perception threshold; if complaints arise, a future pass can hydrate via session-cookie-keyed RSC fragment.
- **R4 — `unstable_cache` callbacks throw if anyone adds `auth()` / `cookies()` inside.** Documented as a foot-gun in the design and the spec; the Phase B3 wrappers in scope are pure DB reads.
- **R5 — Cache poisoning via URL search params encoding user identity.** Audit confirms no such pattern. ISR caches by path + search params, so a runaway `?user=123` would fragment the cache, not leak across users.
- **R6 — `useSession()` flicker on first paint for `ProfileMenu`.** Cached HTML shows the unauthenticated treatment ("Login"); logged-in user sees their name after hydration. Same trade-off as the wishlist heart and accepted on the same grounds.
- **R7 — Auto-revalidation race when many users hit a stale page simultaneously.** Next.js handles internally: a single regeneration is kicked off, all concurrent requests get the stale-while-revalidate response. No code needed.
- **R8 — Build size grows because `<SessionProvider>` and the new context add bundle weight.** Marginal (a few KB). Within the LCP budget already analyzed in `visual-refresh-boutique`.

## Migration Plan

1. Worktree at `../ecom-app-v1-perf-isr-public-catalog/` (per project default for `/opsx:apply`).
2. Implement in commit-group order: wishlist API + provider → header decoupling → WishlistHeart + ProductCard refactor → caller cleanup → cache adds + Prisma wrapping. After each group: typecheck + lint + build (with `.env.local`).
3. Final pre-merge gate: full typecheck, full lint, `npm run build` exits 0 AND build output for the cacheable routes shows ISR or static (NOT `ƒ Dynamic`), `npm run check:contrast` still green, manual smoke through home → category → PDP → cart → checkout in light mode.
4. Re-run the curl battery against the deployed URL after Vercel deploys the merged develop. Compare to the baseline (this design doc § Context).
5. Rollback: single squash revert of the merge commit. The change is functionally additive — no DB migrations, no schema changes, no env vars.

## Open Questions

None. All decisions ratified during the brainstorm + advisor checkpoint.
