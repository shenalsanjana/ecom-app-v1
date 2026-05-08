## 1. Wishlist context + API

- [x] 1.1 `app/api/wishlist/ids/route.ts` exports `GET` that returns `{ ids: string[] }` from the current session's wishlist (empty array unauthenticated). Sets `Cache-Control: private, no-store` so the response is never edge-cached. Pure read, no mutations. Uses existing `auth()` + `getWishlistProductIds()`.
- [x] 1.2 `app/_lib/wishlist-context.tsx` exports `WishlistProvider` + `useWishlist()`. Provider hydrates from `/api/wishlist/ids` only when `useSession().status === "authenticated"`. Holds `realIds: Set<string>` and exposes optimistic state via `useOptimistic` with a flip reducer. `toggle(productId, fromPath)` redirects unauthenticated users to `/login?callbackUrl=...`; authenticated users get an immediate optimistic flip + the existing `toggleWishlistAction` server action runs in `startTransition`. Failure auto-reverts via useOptimistic's transition contract.
- [x] 1.3 `app/layout.tsx` now wraps in order `<SessionProvider>` → `<WishlistProvider>` → `<CartProvider>` → `{children}`. SessionProvider is from `next-auth/react`. No other layout edits.

## 2. SiteHeader + header-icon decoupling

- [x] 2.1 `app/_components/home/site-header.tsx`: dropped `async` + `auth()` + `getWishlistCount()`. Render NAV_LINKS + search form + child icons with no user-specific props. The header HTML is now identical for every visitor at SSR.
- [x] 2.2 `app/_components/header/profile-menu.tsx`: was already `"use client"`; now reads via `useSession()` from `next-auth/react` instead of receiving a `user` prop. `status === "authenticated"` shows the user menu; otherwise shows the Login/Sign-up items. Cached HTML renders the unauthenticated treatment until hydration (~50-100ms flicker for logged-in users — acceptable per design.md R6).
- [x] 2.3 `app/_components/header/wishlist-icon.tsx`: now `"use client"`, reads `ids` from `useWishlist()` and shows the count badge from `ids.size`. Drops `loggedIn`/`count` props. Link always navigates to `/wishlist` (the wishlist page handles auth-redirect itself). Exposed `ids: ReadonlySet<string>` on `WishlistContext` so consumers can read `.size` and `.has(id)` without separate accessors.

## 3. WishlistHeart + ProductCard refactor

- [ ] 3.1 Add `app/_components/wishlist/wishlist-heart.tsx` (`"use client"`). Props: `{ productId: string; fromPath?: string }`. Reads filled state from `useWishlist()`'s `has(productId)`. Wraps a `<form action={toggleWishlistAction}>` with hidden `productId` and `fromPath` inputs (preserves the existing server-action API). Inside the form: a `<button type="submit">` with the lucide `Heart` icon. Apply `useOptimistic` so the displayed filled-state flips immediately on submit. Preserve the `motion-safe:animate-wishlist-fill` keyframe + `key={filled ? "filled" : "empty"}` remount pattern shipped in `visual-refresh-boutique`. Preserve hit-target sizing and the focus-visible olive ring.
- [ ] 3.2 Refactor `app/_components/home/product-card.tsx`: remove the `wishlisted` prop (and its default `wishlisted = false`) from `ProductCardProps` and from the function signature. Remove the inline `<form action={toggleWishlistAction}>` block and the inline heart `<button>`. Replace the absolute-positioned heart with `<WishlistHeart productId={id} fromPath={fromPath} />` (positioned with the same `absolute right-2 top-2 z-10` wrapper). Card stays a server component.
- [ ] 3.3 Update `ProductCardProps` type export so consumers no longer accept a `wishlisted` field. Run a typecheck after this task to surface every consumer that needs cleanup in §4.

## 4. Drop server-side auth() in cacheable trees

- [ ] 4.1 `app/_components/home/product-grid.tsx`: drop the `await auth()` call and the `getWishlistProductIds` import + call. The component becomes a synchronous server component (or stays async only for the products fetch). Drop the `wishlisted={wishlisted.has(p.id)}` prop pass on `<ProductCard>`.
- [ ] 4.2 `app/_components/home/deals-section.tsx`: same as 4.1. Drop `auth()`, drop `getWishlistProductIds`, drop the `wishlisted={wishlisted.has(...)}` prop pass.
- [ ] 4.3 `app/products/[id]/page.tsx`: drop `const session = await auth();` (line 60), drop `const userId = session?.user?.id;`, remove the `getWishlistProductIds(userId)` entry from the `Promise.all([...])`. Drop `wishlistedIds` everywhere it's referenced — including the `wishlisted={wishlistedIds.has(detail.product.id)}` prop on the BuyBox heart and the `wishlistedIds={wishlistedIds}` prop on `<RelatedStrip>`.
- [ ] 4.4 `app/_components/product/related-strip.tsx`: drop the `wishlistedIds: Set<string>` prop entirely (from the `Props` type and the function signature). The inner `<ProductCard>` no longer accepts a `wishlisted` prop, so just iterate and render.
- [ ] 4.5 `app/categories/page.tsx`, `app/categories/[slug]/page.tsx`, `app/deals/page.tsx`, `app/search/page.tsx`: drop the `wishlisted={false}` prop pass on `<ProductCard>` (the heart self-hydrates now). No other changes.
- [ ] 4.6 `app/wishlist/page.tsx`: drop the `wishlisted={true}` prop pass on `<ProductCard>`. The heart will hydrate from `useWishlist()` and render filled correctly because the user IS on the wishlist page (their session has those IDs). No other behavior change.
- [ ] 4.7 Verify Phase A correctness: run `npx tsc --noEmit`, `npm run lint`, `npm run build` (with `.env.local` present). All three must pass. Build output should still show `ƒ Dynamic` on the cacheable routes — cache adds come in §5 — but any auth-related dynamic-rendering warnings should be gone.

## 5. Cache adds + Prisma wrapping + verification

- [ ] 5.1 Add `export const revalidate = 300` to `app/page.tsx`. Add `export const revalidate = 3600` to `app/categories/page.tsx`. Add `export const revalidate = 300` to `app/categories/[slug]/page.tsx`. Add `export const revalidate = 300` to `app/products/[id]/page.tsx`. Add `export const revalidate = 120` to `app/deals/page.tsx`.
- [ ] 5.2 Add `export const dynamic = 'force-static'` to `app/about/page.tsx`, `app/contact/page.tsx`, `app/privacy-policy/page.tsx`, `app/terms-and-conditions/page.tsx`, `app/refund-policy/page.tsx`. For `app/contact/page.tsx`, verify the `<ContactForm>` server action remains functional (it's posted to a dynamic action endpoint regardless of the page-shell being static).
- [ ] 5.3 Wrap hot Prisma reads in `app/_lib/products.ts` with `unstable_cache` from `next/cache`. Each wrapper takes a unique key array, a tags array drawn from `['catalog', 'categories', 'product', 'category-products', 'deals', 'featured']`, and a matching `revalidate` value:
    - `getCategoryList` — keys `['categories-list']`, tags `['catalog', 'categories']`, revalidate `3600`.
    - `getProductDetail` — keys `['product-detail']` + arg, tags `['catalog', 'product']`, revalidate `300`.
    - `getProductsByCategory` — keys `['products-by-category']` + arg, tags `['catalog', 'category-products']`, revalidate `300`.
    - `getDeals` — keys `['deals-list']`, tags `['catalog', 'deals']`, revalidate `120`.
    - `getFeaturedProducts` (or the function home calls; check `app/page.tsx` imports) — keys `['featured']`, tags `['catalog', 'featured']`, revalidate `300`.
    Pure DB reads only — DO NOT wrap any function that calls `auth()` / `cookies()` / `headers()` (e.g., `getWishlistProductIds`, `getWishlistCount` stay unwrapped).
- [ ] 5.4 Run `npm run build`. Verify the route table shows `○` (Static), `●` (SSG with data), or ISR for the cacheable routes (`/`, `/categories`, `/categories/[slug]`, `/products/[id]`, `/deals`, `/about`, `/contact`, `/privacy-policy`, `/terms-and-conditions`, `/refund-policy`) — NOT `ƒ` (Dynamic). If any cacheable route still shows `ƒ`, find the lingering `auth()` / `cookies()` / `headers()` call and fix before continuing.
- [ ] 5.5 Re-run `npx tsc --noEmit` (must pass) and `npm run lint` (must pass — pre-existing seed.ts unused-symbol warning is acceptable).
- [ ] 5.6 Run `npm run check:contrast`. Must remain green — this change touches no tokens.
- [ ] 5.7 Manual smoke (light mode):
    - Cold: home → /categories → category page → PDP → /cart → /checkout → /search → /wishlist → /account/* — no surface looks broken or off-palette.
    - Toggle wishlist heart on a `ProductCard` while logged in → heart flips within 150ms (optimistic) → page reload shows the new state from `/api/wishlist/ids` hydration.
    - Toggle wishlist heart while logged OUT → server action redirects to `/login` (existing behavior; not changed by this work).
    - Open cart drawer → cart count badge in header reflects current cart state via client hydration.
    - Visit `/products/[id]` while logged in with that product wishlisted → heart appears filled within ~100ms of first paint.
    - Visit `/about` and `/contact` → pages render correctly; contact form submit works.
- [ ] 5.8 Run `openspec validate perf-isr-public-catalog --strict` — must be green.
- [ ] 5.9 Post-deploy measurement (after merge to develop and Vercel deploys): re-run the curl battery against `https://www.dressingbear.com` for `/`, `/categories`, `/categories/[slug]/<some-slug>`, `/products/<some-id>`, `/deals`. Targets: warm TTFB < 200ms (pass < 400ms; PDP allowance < 500ms). Run a Lighthouse mobile audit on PDP via PageSpeed Insights — target LCP < 2.5s. Record numbers in the merge-commit body or a follow-up note for the next perf iteration.
