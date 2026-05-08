## ADDED Requirements

### Requirement: User-specific state SHALL NOT be rendered server-side inside cacheable route trees

Any UI element whose content varies per authenticated user (wishlist fill state, cart count, profile-menu name, "Login" vs "Account" link) MUST render via a client component that hydrates from a client-side context (`useSession()`, `useWishlist()`, `useCart()`) or a small dedicated read-only API call. Server components that participate in a route tree marked with `export const revalidate = N` or `export const dynamic = 'force-static'` MUST NOT call `auth()`, `cookies()`, `headers()`, or any function that reads them transitively. The cached HTML represents the public, visitor-agnostic view of the page.

#### Scenario: SiteHeader renders identically for every visitor at SSR

- **WHEN** any cacheable page renders `<SiteHeader />` server-side during ISR generation
- **THEN** the rendered HTML contains no per-user data (no user name, no wishlist count, no `loggedIn` truth value)
- **AND** the user-specific bits (wishlist count, profile menu, cart count) appear via client-side hydration after first paint

#### Scenario: A new server component added to a cacheable tree must not call auth()

- **WHEN** a developer adds a server component that calls `auth()` to a route tree containing `export const revalidate = N`
- **THEN** Next.js opts the route out of static rendering (the build output reverts to `ƒ Dynamic`)
- **AND** the violation is caught either by the pre-merge build inspection or by the architectural-rule grep referenced in the change's tasks

### Requirement: Public catalog routes SHALL use Incremental Static Regeneration (ISR) with explicit per-route revalidate windows

The following routes MUST declare `export const revalidate = N` at the page level with the values below. The build output MUST show these routes as ISR / static (NOT `ƒ Dynamic`).

| Route | `revalidate` (s) |
|---|---:|
| `app/page.tsx` (home) | 300 |
| `app/categories/page.tsx` | 3600 |
| `app/categories/[slug]/page.tsx` | 300 |
| `app/products/[id]/page.tsx` | 300 |
| `app/deals/page.tsx` | 120 |

Marketing pages (`app/about/page.tsx`, `app/contact/page.tsx`, `app/privacy-policy/page.tsx`, `app/terms-and-conditions/page.tsx`, `app/refund-policy/page.tsx`) MUST declare `export const dynamic = 'force-static'` and contain no Prisma reads in their render path.

User-specific or query-specific routes (`app/cart/page.tsx`, `app/wishlist/page.tsx`, `app/checkout/page.tsx`, `app/account/**/page.tsx`, `app/(auth)/**/page.tsx`, `app/search/page.tsx`) MUST remain dynamic (no `revalidate`, no `force-static`) — they are explicitly out of cache scope.

#### Scenario: Build output reflects the cache contract

- **WHEN** a developer runs `npm run build`
- **THEN** the route table shows `○` (Static), `●` (SSG with data), or ISR for `/`, `/categories`, `/categories/[slug]`, `/products/[id]`, `/deals`, `/about`, `/contact`, `/privacy-policy`, `/terms-and-conditions`, `/refund-policy`
- **AND** shows `ƒ` (Dynamic) for `/cart`, `/wishlist`, `/checkout`, `/account/*`, `/(auth)/*`, `/search`

#### Scenario: Stale-while-revalidate behaviour on the deployed site

- **WHEN** a user hits a cacheable route after `revalidate` seconds have elapsed since the last build
- **THEN** the response served is the stale cached page (no user wait)
- **AND** Next.js triggers a background regeneration that updates the cache for subsequent requests

### Requirement: Hot Prisma reads SHALL be wrapped in `unstable_cache` with explicit tags

Read-only Prisma functions in `app/_lib/products.ts` that back the cacheable catalog routes MUST be wrapped in `unstable_cache` with an explicit `tags` array drawn from the published list (`catalog`, `categories`, `product`, `category-products`, `deals`, `featured`). The wrapped functions MUST be pure (no `auth()` / `cookies()` / `headers()` calls in the wrapped callback). The `revalidate` value on each wrapper MUST match or be tighter than the consuming route's `revalidate`.

| Function | Tags | `revalidate` (s) |
|---|---|---:|
| `getCategoryList` | `catalog`, `categories` | 3600 |
| `getProductDetail` | `catalog`, `product` | 300 |
| `getProductsByCategory` | `catalog`, `category-products` | 300 |
| `getDeals` | `catalog`, `deals` | 120 |
| `getFeaturedProducts` (or the home-page reader equivalent) | `catalog`, `featured` | 300 |

Functions that read user-specific data (`getWishlistProductIds`, `getWishlistCount`, anything reading the current session) MUST NOT be wrapped — `unstable_cache` callbacks throw at runtime if they invoke `auth()` / `cookies()` / `headers()`.

#### Scenario: Wrapped reader serves cached data within revalidate window

- **WHEN** `getProductDetail("cat-white")` is called twice within 300 seconds
- **THEN** the second call returns from the data cache without a Prisma round-trip

#### Scenario: Tag-based invalidation surface ready for admin write paths

- **WHEN** a future admin write path calls `revalidateTag("product")` after updating a product
- **THEN** the next call to any wrapped reader tagged with `product` (e.g., `getProductDetail`) re-runs the underlying Prisma query and refreshes the cache
- **AND** PDP (`/products/[id]`) regenerates on its next request because its underlying read is tagged

### Requirement: A read-only API endpoint SHALL expose the current session's wishlist IDs for client hydration

The system MUST expose `GET /api/wishlist/ids` that returns a JSON object `{ ids: string[] }` containing the wishlisted product IDs for the current authenticated session, or `{ ids: [] }` for unauthenticated requests. The endpoint MUST be read-only (no side effects) and MUST NOT be cacheable at the edge (it varies per session).

#### Scenario: Authenticated user gets their wishlist IDs

- **WHEN** a request to `GET /api/wishlist/ids` arrives with a valid authenticated session containing user `userA`
- **THEN** the response status is 200
- **AND** the response body is JSON `{ ids: [...] }` containing the product IDs in `userA`'s wishlist

#### Scenario: Unauthenticated request gets an empty list

- **WHEN** a request to `GET /api/wishlist/ids` arrives without a session
- **THEN** the response status is 200
- **AND** the response body is JSON `{ ids: [] }`

### Requirement: Wishlist toggle SHALL provide optimistic UI feedback within `--duration-fast` of click

The wishlist heart on `ProductCard` (and any other surface that toggles a product's wishlist state) MUST flip its filled state within `--duration-fast` (150ms) of the user's click via `useOptimistic`. The server action's success commits the optimistic state; failure reverts it AND surfaces a non-blocking notice (toast or inline message). This contract applies regardless of network latency to the server action.

#### Scenario: Heart flips instantly on click

- **WHEN** a user clicks an empty wishlist heart on a `ProductCard`
- **THEN** within 150ms the heart visually flips to filled, regardless of server-action round-trip time
- **AND** the underlying `toggleWishlistAction` runs in the background

#### Scenario: Server-action failure rolls back the optimistic state

- **WHEN** the same click triggers a server action that fails (e.g., network error, auth expired)
- **THEN** the heart reverts to its previous unfilled state
- **AND** the user sees a non-blocking notice that the change didn't save
