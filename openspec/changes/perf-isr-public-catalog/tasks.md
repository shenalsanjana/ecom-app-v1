## 1. Wishlist context + API

- [x] 1.1 `app/api/wishlist/ids/route.ts` exports `GET` that returns `{ ids: string[] }` from the current session's wishlist (empty array unauthenticated). Sets `Cache-Control: private, no-store` so the response is never edge-cached. Pure read, no mutations. Uses existing `auth()` + `getWishlistProductIds()`.
- [x] 1.2 `app/_lib/wishlist-context.tsx` exports `WishlistProvider` + `useWishlist()`. Provider hydrates from `/api/wishlist/ids` only when `useSession().status === "authenticated"`. Holds `realIds: Set<string>` and exposes optimistic state via `useOptimistic` with a flip reducer. `toggle(productId, fromPath)` redirects unauthenticated users to `/login?callbackUrl=...`; authenticated users get an immediate optimistic flip + the existing `toggleWishlistAction` server action runs in `startTransition`. Failure auto-reverts via useOptimistic's transition contract.
- [x] 1.3 `app/layout.tsx` now wraps in order `<SessionProvider>` → `<WishlistProvider>` → `<CartProvider>` → `{children}`. SessionProvider is from `next-auth/react`. No other layout edits.

## 2. SiteHeader + header-icon decoupling

- [x] 2.1 `app/_components/home/site-header.tsx`: dropped `async` + `auth()` + `getWishlistCount()`. Render NAV_LINKS + search form + child icons with no user-specific props. The header HTML is now identical for every visitor at SSR.
- [x] 2.2 `app/_components/header/profile-menu.tsx`: was already `"use client"`; now reads via `useSession()` from `next-auth/react` instead of receiving a `user` prop. `status === "authenticated"` shows the user menu; otherwise shows the Login/Sign-up items. Cached HTML renders the unauthenticated treatment until hydration (~50-100ms flicker for logged-in users — acceptable per design.md R6).
- [x] 2.3 `app/_components/header/wishlist-icon.tsx`: now `"use client"`, reads `ids` from `useWishlist()` and shows the count badge from `ids.size`. Drops `loggedIn`/`count` props. Link always navigates to `/wishlist` (the wishlist page handles auth-redirect itself). Exposed `ids: ReadonlySet<string>` on `WishlistContext` so consumers can read `.size` and `.has(id)` without separate accessors.

## 3. WishlistHeart + ProductCard refactor

- [x] 3.1 `app/_components/wishlist/wishlist-heart.tsx` is a client component reading `has(productId)` and `toggle(productId, fromPath)` from `useWishlist()`. The optimistic flip is owned by `WishlistProvider` (cleaner than per-heart `useOptimistic` — multiple hearts for the same product stay in sync). Preserves the visual-refresh `motion-safe:animate-wishlist-fill` keyframe + `key` remount pattern, the `bg-background/80 backdrop-blur` chip, the 8×8 hit target with focus-visible olive ring, `aria-pressed` for screen-reader state.
- [x] 3.2 `app/_components/home/product-card.tsx`: dropped the `wishlisted` prop, removed the inline `<form action={toggleWishlistAction}>` block, replaced with `<WishlistHeart productId={id} fromPath={fromPath} />` inside the same absolute-positioned wrapper. ProductCard remains a server component (only the heart inside it is client).
- [x] 3.3 `ProductCardProps` no longer accepts `wishlisted`. Typecheck after this task surfaced 8 consumer files that needed cleanup — all handled in §4.

## 4. Drop server-side auth() in cacheable trees

- [x] 4.1 `app/_components/home/product-grid.tsx`: dropped `auth()` + `getWishlistProductIds()` imports + calls; component now only fetches products. Dropped `wishlisted={...}` prop pass.
- [x] 4.2 `app/_components/home/deals-section.tsx`: same — dropped `auth()`, `getWishlistProductIds()`, and the `wishlisted={...}` prop pass.
- [x] 4.3 `app/products/[id]/page.tsx`: dropped `auth` import, dropped `session = await auth()` + `userId`, removed `getWishlistProductIds(userId)` from `Promise.all([...])`. Dropped `wishlisted={...}` and `isLoggedIn={...}` props on BuyBoxClient (it now reads via useWishlist + useSession). Dropped `wishlistedIds={...}` on RelatedStrip.
- [x] 4.4 `app/_components/product/related-strip.tsx`: dropped `wishlistedIds` from Props type and function signature.
- [x] 4.5 + 4.6 Dropped `wishlisted={false}`/`wishlisted={true}` from `categories/page.tsx`, `categories/[slug]/page.tsx`, `deals/page.tsx`, `search/page.tsx`, `wishlist/page.tsx`. Hearts self-hydrate via `useWishlist()`.
- [x] 4.7 Phase A verified: `npx tsc --noEmit` clean. `npm run lint` clean (1 pre-existing prisma/seed.ts warning). `npm run build` exit 0; cacheable routes (`/`, `/categories`, `/categories/[slug]`, `/products/[id]`, `/deals`) still show `ƒ Dynamic` as expected pre-Group-5. Several routes auto-flipped to `○ Static` once auth() was out of their tree (`/cart`, `/contact`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/privacy-policy`, `/terms-and-conditions`, `/refund-policy`). Bonus auto-static — those marketing/auth pages are now edge-cached without explicit `force-static`. Note: `/cart` going static is a side-effect of CartContext being client-localStorage-backed; the SSR'd shell carries no cart data.

#### Bonus a11y/correctness fix surfaced during refactor
- [x] 4.8 `BuyBoxClient`: heart Button gets `type="button"` (was implicitly `submit` inside the dropped `<form>`) + `aria-pressed={wishlisted}` for SR state. Filled heart now uses `text-brand` to match the brand-color contract.

## 5. Cache adds + Prisma wrapping + verification

- [x] 5.1 Added `export const revalidate = N` to `app/page.tsx` (300), `app/categories/page.tsx` (3600), `app/categories/[slug]/page.tsx` (300), `app/products/[id]/page.tsx` (300), `app/deals/page.tsx` (120).
- [x] 5.2 Added `export const dynamic = 'force-static'` to `app/about/page.tsx`, `app/contact/page.tsx`, `app/privacy-policy/page.tsx`, `app/terms-and-conditions/page.tsx`, `app/refund-policy/page.tsx`. Contact form's server action is unaffected (server actions are posted to dynamic action endpoints regardless of page-shell static-ness).
- [x] 5.3 Wrapped these readers in `app/_lib/products.ts` with `unstable_cache` from `next/cache`:
    - `getCategories` — keys `["categories-list"]`, tags `["catalog", "categories"]`, revalidate 3600.
    - `getFeaturedProducts` — keys `["featured-products"]`, tags `["catalog", "featured"]`, revalidate 300.
    - `getDealsProducts` — keys `["deals-products"]`, tags `["catalog", "deals"]`, revalidate 120.
    - `getProductById` — keys `["product-by-id"]`, tags `["catalog", "product"]`, revalidate 300.
    - `getProductDetail` — keys `["product-detail"]`, tags `["catalog", "product"]`, revalidate 300.
    - `getProductReviews` — keys `["product-reviews"]`, tags `["catalog", "product"]`, revalidate 300.
    - `getReviewHistogram` — keys `["review-histogram"]`, tags `["catalog", "product"]`, revalidate 300.
    `getProducts(opts)` left unwrapped — used by both `/categories/[slug]` (cacheable) and `/search` (intentionally uncached) with a complex options object; relying on page-level `revalidate` for the cacheable consumer. `getWishlistProductIds`, `getWishlistCount` deliberately untouched (they read user state).
- [x] 5.4 `npm run build` exits 0. Route table shows:
    - `○ /` (Revalidate 2m, clamped from 5m by inner `getDealsProducts`)
    - `○ /about`, `○ /contact`, `○ /privacy-policy`, `○ /refund-policy`, `○ /terms-and-conditions`
    - `○ /cart`, `○ /forgot-password`, `○ /login`, `○ /reset-password`, `○ /signup` (auto-static after Phase A removed auth() coupling)
    - `ƒ /categories`, `ƒ /categories/[slug]`, `ƒ /products/[id]`, `ƒ /deals` — **stayed dynamic despite `revalidate`** because they read `await searchParams`. Documented as accepted in design.md "searchParams keeps PDP / categories / deals dynamic". Data-layer cache via `unstable_cache` still engaged on these routes.
    - `ƒ /wishlist`, `ƒ /checkout`, `ƒ /account/*`, `ƒ /search` — intentionally dynamic.
- [x] 5.5 `npx tsc --noEmit` clean. `npm run lint` clean (only pre-existing prisma/seed.ts warning).
- [x] 5.6 `npm run check:contrast` green — no token changes.
- [ ] 5.7 Manual smoke (you, light mode):
    - Cold: home → /categories → category page → PDP → /cart → /checkout → /search → /wishlist → /account/* — no surface broken or off-palette.
    - Toggle wishlist heart on a ProductCard while logged in → heart flips within 150ms (optimistic). Reload → state still set.
    - Toggle wishlist heart while logged OUT → redirected to `/login?callbackUrl=...`.
    - Open cart drawer → cart count badge in header reflects current state.
    - Visit `/products/[id]` while logged in with that product wishlisted → heart appears filled within ~100ms of first paint.
    - Visit `/about` and `/contact` → render correctly; contact form submit works.
- [x] 5.8 `openspec validate perf-isr-public-catalog --strict` green.
- [ ] 5.9 Post-deploy measurement (after merge to develop and Vercel deploys): re-run the curl battery against `https://www.dressingbear.com` for `/`, `/categories`, `/categories/[slug]/<some-slug>`, `/products/<some-id>`, `/deals`.
    Revised targets given the searchParams finding:
    - **`/` (statically rendered):** warm TTFB < 200ms target, < 400ms pass threshold.
    - **`/categories`, `/categories/[slug]`, `/products/[id]`, `/deals` (still dynamic, but data-cached):** warm TTFB target < 600ms, pass threshold < 1000ms (substantial drop from baseline 0.85s–3.27s, but not edge-cache levels). The Prisma round-trips that dominated cross-region latency are now cache hits.
    - **Marketing pages** (`/about` etc.): warm TTFB < 200ms.
    Run a Lighthouse mobile audit on PDP via PageSpeed Insights — target LCP < 2.5s. Record numbers in the merge-commit body or a follow-up note. If PDP warm TTFB still > 1s after deploy, the next perf change should restructure searchParams handling (move pagination/sort to client, wrap in Suspense) to unlock route-level edge caching.
