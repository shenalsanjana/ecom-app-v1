## Why

Live measurement (curl against `https://www.dressingbear.com`) showed warm TTFB on hot public catalog routes is 0.85s – 3.3s, with `/products/[id]` at 3.3s warm / 4.5s cold being the worst surface. Vercel response headers confirm zero edge caching: `Cache-Control: private, no-cache, no-store`, `X-Vercel-Cache: MISS` on every response, and the production build output marks every route as `ƒ Dynamic`. CWV "good" target is LCP ≤ 2.5s mobile; PDP TTFB alone exceeds that, so users meet a slow first-paint on the most commercially important surface.

The fix is straightforward in principle (Incremental Static Regeneration via `export const revalidate = N`) but blocked in practice: server-side `auth()` calls inside the page render tree of cacheable routes opt them out of static rendering regardless of `revalidate`. `SiteHeader` (rendered on every page), `product-grid`, `deals-section`, and `app/products/[id]/page.tsx` all call `auth()` to fetch wishlist state and pass `wishlisted` props down to `ProductCard`. Without removing those calls, `revalidate` is inert. The auth-decoupling refactor is therefore a hard prerequisite, not parallel work — Phase A (decoupling) and Phase B (cache adds) ship as a single change.

## What Changes

- **Phase A — Auth decoupling (prerequisite):** Move user-specific state out of the cacheable render tree. Introduce a client-side `<WishlistProvider>` mirroring the existing `<CartProvider>`, hydrating from a new `GET /api/wishlist/ids` route handler. Convert `SiteHeader`, `WishlistIcon`, `ProfileMenu`, and the wishlist heart on `ProductCard` to client components reading from `useSession()` and `useWishlist()`. Drop server-side `auth()` calls and `getWishlistProductIds()` fetches from every page that renders public catalog data. The `wishlisted` prop is removed from `ProductCard` (the heart self-hydrates).
- **Phase B — ISR + edge caching:** Add `export const revalidate = N` to `/`, `/categories`, `/categories/[slug]`, `/products/[id]`, `/deals` with per-route freshness windows (2-min on `/deals`, 5-min on home/PDP/category, 1-hr on `/categories` index). Add `export const dynamic = 'force-static'` to truly-static marketing pages (`/about`, `/contact`, `/privacy-policy`, `/terms-and-conditions`, `/refund-policy`). Wrap hot Prisma reads in `app/_lib/products.ts` with `unstable_cache` and tags (`catalog`, `categories`, `product`, `category-products`, `deals`, `featured`) so future on-demand revalidation from admin paths is a one-line addition.
- **Architectural rule documented:** "Anything user-specific rendered inside a cacheable page MUST be a client component that hydrates from a client-side context or a small dedicated API call. The cached HTML represents the public, visitor-agnostic view of the page." Encoded in the spec as a normative requirement.
- **NOT a breaking change** in any user-visible sense: visual identity unchanged, no API surface changes, no route changes, no data model changes.

## Capabilities

### New Capabilities
- `perf-caching`: ISR contract for public catalog routes, `force-static` contract for marketing pages, `unstable_cache` tag conventions, and the user-state-hydration rule. Seeds `openspec/specs/perf-caching/spec.md` (the project's first performance-focused capability).

### Modified Capabilities
<!-- None — the visual-design-system capability seeded by visual-refresh-boutique is unrelated and untouched. -->

## Impact

- **Files added:**
  - `app/api/wishlist/ids/route.ts` — small read-only handler returning the current session's wishlist IDs.
  - `app/_lib/wishlist-context.tsx` — `WishlistProvider` + `useWishlist()` hook (client).
  - `app/_components/wishlist/wishlist-heart.tsx` — client-side heart toggle with `useOptimistic`.
- **Files refactored:**
  - `app/layout.tsx` — adds `<SessionProvider>` + `<WishlistProvider>` wrapping the existing `<CartProvider>`.
  - `app/_components/home/site-header.tsx` — drops `async` + `auth()` + `getWishlistCount`; becomes a synchronous server component.
  - `app/_components/header/profile-menu.tsx`, `wishlist-icon.tsx` — converted to client components reading from `useSession()` / `useWishlist()`.
  - `app/_components/home/product-card.tsx` — drops `wishlisted` prop, replaces inline form+button heart with `<WishlistHeart>`.
  - `app/_components/home/product-grid.tsx`, `deals-section.tsx` — drop server-side `auth()` + `getWishlistProductIds()`.
  - `app/_components/product/related-strip.tsx` — drops `wishlistedIds` prop.
  - `app/products/[id]/page.tsx` — drops `auth()` line and the `wishlistedIds`/`wishlisted` prop passes.
  - `app/categories/page.tsx`, `app/categories/[slug]/page.tsx`, `app/deals/page.tsx`, `app/search/page.tsx`, `app/wishlist/page.tsx` — drop the `wishlisted={false}`/`wishlisted={true}` prop pass.
- **Files annotated (no behavioral edit):**
  - `app/page.tsx`, `app/categories/page.tsx`, `app/categories/[slug]/page.tsx`, `app/products/[id]/page.tsx`, `app/deals/page.tsx` — gain `export const revalidate = N`.
  - `app/about/page.tsx`, `app/contact/page.tsx`, `app/privacy-policy/page.tsx`, `app/terms-and-conditions/page.tsx`, `app/refund-policy/page.tsx` — gain `export const dynamic = 'force-static'`.
  - `app/_lib/products.ts` — wrap five hot read functions in `unstable_cache(...)` with tags.
- **Dependencies:** none added. `next-auth/react`, `next/cache`, and `react` already present.
- **APIs:** new `GET /api/wishlist/ids` (additive, internal). No breaking API changes. No DB schema changes.
- **Performance contract:** target warm TTFB on cached hits drops from 0.85s–3.3s to **< 200ms target** (< 400ms pass threshold; PDP gets a < 500ms allowance). LCP on PDP target < 2.5s mobile (Lighthouse).
- **Observable trade-off:** logged-in users see wishlist hearts and personalized header items load via client hydration (~50–100ms post-first-paint), instead of being baked into SSR. Below typical perception threshold.
- **Out of scope (kept here so reviewers don't request scope creep):** optimistic UI on cart/checkout server actions (separate change for the "button feels slow" symptom — only the wishlist heart benefits via `useOptimistic` in this change), `react.cache` per-request memoization, DB region locality, Fraunces / image-LCP / bundle-size tuning, on-demand `revalidateTag` from admin paths (admin work is a separate OpenSpec change), PPR, the `'use cache'` directive, service workers, search-route caching, cookie-based variant caches.
