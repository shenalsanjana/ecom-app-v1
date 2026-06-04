# Smooth Navigation — Phase 1: Perceived Performance

**Date:** 2026-06-04
**Status:** Approved design, pending implementation plan
**Author:** brainstorming session

## Problem

Page navigation feels slow for both admin and customer users in a **production
build**. The reported symptom: *click a link → nothing happens for a beat →
the new page suddenly appears*, with no skeleton or progress in between. Worst
on admin lists/dashboard, customer catalog, and product detail.

## Diagnosis

The symptom is **perceived navigation latency**, not (primarily) slow servers.
In the Next.js App Router, clicking a `<Link>` to a route that has **no
`loading.tsx` boundary** blocks the entire client-side transition on the server
render — nothing on screen changes until the server finishes. That is "the
beat." Compounding it, the app has **no global navigation indicator**, so a
click is never acknowledged anywhere.

Route-by-route audit (which routes already have a `loading.tsx`):

| Hotspot route | Loading boundary? | Real problem |
|---|---|---|
| `products/[id]` (product detail) | ❌ | No feedback → the beat |
| `categories` (catalog landing) | ❌ | No feedback → the beat |
| `admin/orders/[id]` | ❌ | No feedback → the beat |
| `admin/products/new` | ❌ | No feedback → the beat |
| `admin/products/[id]/edit` | ❌ | No feedback → the beat |
| `admin/customers/[id]` | ❌ | No feedback → the beat |
| `admin/settings` | ❌ | No feedback → the beat |
| `account`, `account/security`, `account/addresses` | ❌ | No feedback → the beat |
| `categories/[slug]` (filtered catalog) | ✅ | Skeleton shows but lingers — `getProducts` uncached (Phase 2) |
| `admin/orders`, `admin/products`, `admin/customers` | ✅ | Skeleton shows but lingers — uncached live queries (Phase 2) |

Secondary issues found:
- **2 plain `<a href>` tags** force full-page reloads (white flash, re-runs the
  root layout's `getDeliveryConfig`): `app/_components/home/product-grid.tsx`
  ("View all") and `app/about/page.tsx`.
- **`debug: true`** is forced on in NextAuth plus verbose `console.log` on every
  auth call, in production (`app/_lib/auth.ts`, `app/_lib/auth.config.ts`).

Ruled out as bottlenecks (verified during exploration):
- Navigation already uses `<Link>` almost everywhere (41 files); only the 2
  `<a>` tags above are broken.
- Customer catalog readers (`getFeaturedProducts`, `getProductDetail`, etc.) are
  already cached via `unstable_cache`.
- Auth uses JWT sessions (no per-request DB lookup).
- `proxy.ts` edge gate is JWT-only, pure logic, and matches only
  `/account`, `/admin`, `/wishlist` — not a per-nav tax on the catalog.
- Images already use `next/image`.

## Approach

**Perceived-performance first, phased.** Phase 1 (this spec) ships the
instant-feedback layer and the cheap correctness fixes, then measures. Phase 2
(server speed) is deferred and gated on the Phase-1 measurement — it is
documented here but **not** built as part of this plan.

This was chosen over "server-speed first" (does not address the no-feedback
symptom) and "everything at once" (~6 workstreams, hard to verify, slower to
ship felt wins).

## Goal & Success Criteria

**Goal:** Every navigation gives instant visual feedback so no click feels dead.

**Measurable success criteria:**
1. Clicking any link produces a visible response (progress bar and/or skeleton)
   within ~100ms — no blank "beat."
2. Every data-driven route listed below renders an instant skeleton on
   navigation; no such route blocks on the server before transitioning.
3. **Baseline vs. after:** capture the RSC navigation request timing for a
   product-detail click (DevTools → Network → the `?_rsc=` request) in a
   production build before and after. The *visual* response must change from
   "wait-then-snap" to "instant skeleton → content." Record both numbers in the
   implementation notes.

## Components

### Component 1 — Loading boundaries
Add a `loading.tsx` to each data-driven route missing one. Each reuses existing
primitives (`@/components/ui/skeleton` `Skeleton`, and
`@/app/_components/shared/product-grid-skeleton` `ProductGridSkeleton`) and
mirrors its real page's layout so the skeleton→content swap does not shift.

**Inheritance note (refined during planning):** a `loading.tsx` covers its
segment *and every nested route without its own*. The genuinely-uncovered
routes are the customer ones below. The admin detail/form/settings pages already
*inherit* `app/admin/loading.tsx` (dashboard-shaped) — they are not missing a
boundary; they receive **shape-correct overrides** so the dashboard skeleton
stops flashing on forms/detail pages.

Routes to add:
- Customer (first-time boundaries): `app/products/[id]/loading.tsx`,
  `app/categories/loading.tsx`, and a single `app/account/loading.tsx` that
  covers `/account`, `/account/security`, and `/account/addresses`
  (`/account/orders` already overrides it).
- Admin (shape-correct overrides of the inherited skeleton):
  `app/admin/orders/[id]/loading.tsx`, `app/admin/products/new/loading.tsx`,
  `app/admin/products/[id]/edit/loading.tsx`,
  `app/admin/customers/[id]/loading.tsx`, `app/admin/settings/loading.tsx`

Static content pages (about, contact, policies) are intentionally excluded —
they are already fast and prefetched.

**Interface:** each file default-exports a `Loading()` server component
returning JSX. No props, no dependencies beyond the shared skeleton components.

### Component 2 — Global navigation indicator
A thin, brand-colored top progress bar that animates on every route change,
acknowledging all clicks — including same-template navigations (product card →
product card) where a `loading.tsx` does not re-trigger.

**Implementation:** a small `"use client"` leaf component rendered in the root
layout (`app/layout.tsx`). It shows the bar while a navigation is pending and
hides it when the new `usePathname()` value commits — i.e. detect route-change
intent and animate until the path settles. (`useLinkStatus` is *not* used for
the global bar — it only reports status inside an individual `<Link>` subtree;
it may optionally be layered onto specific nav links later for per-link
feedback.) No third-party dependency (no nprogress).

**Interface:** `<NavigationProgress />` — self-contained, no props. Depends only
on `next/navigation`. Must be a leaf client component so it does not force parent
server components to render on the client (per CLAUDE.md §3).

### Component 3 — Fix broken SPA navigation
Convert the 2 plain `<a href>` tags to `next/link` `<Link>`:
- `app/_components/home/product-grid.tsx` — "View all" → `/categories`
- `app/about/page.tsx` — the internal link(s)

Eliminates full-page reloads (white flash + root-layout re-fetch).

### Component 4 — Remove production debug noise
- Set NextAuth `debug` to `process.env.NODE_ENV !== "production"` in
  `app/_lib/auth.ts`.
- Gate the verbose module-load and per-call `console.log` statements in
  `app/_lib/auth.ts` and `app/_lib/auth.config.ts` behind a non-production
  check (or remove the ones that are pure noise). Keep genuine error logging.

### Component 5 — Role-gated Admin entry link (added during planning)
Show an "Admin panel" link (to `/admin`) in the customer header's profile
dropdown (`app/_components/header/profile-menu.tsx`), visible **only** when
`session.user.role === "ADMIN"`. Gives admins a one-click path into the admin
area instead of typing the URL. `session.user.role` is typed via
`app/_lib/auth-types.d.ts`.

## Testing & Verification
- `npm run build` must pass (CLAUDE.md §2 validation gate).
- Manual, in a production build (`npm run build && npm start`): click through
  each hotspot route and confirm an instant skeleton and/or progress bar appears,
  with no white flash on the "View all" and about-page links.
- Record the baseline-vs-after RSC timing for a product-detail click (success
  criterion 3).
- Optional E2E (only if quick): a Playwright assertion that the navigation
  progress indicator becomes visible during a route transition.

## Phase 2 — Deferred & Gated (NOT built in this plan)
Implement only if Phase-1 measurement shows content still lingers behind the
skeleton:
- Cache the **category-landing** case of `getProducts` (categorySlug + default
  sort), or — stronger — use `generateStaticParams` + ISR for category pages so
  they are fully prefetchable and the beat is eliminated outright.
- Trim/paginate admin list queries (`admin/orders`, `admin/products`,
  `admin/customers`).
- Search (`searchProducts`) stays dynamic and uncached — out of scope.

## Out of Scope (YAGNI)
- Search result caching (inherently dynamic).
- DB index tuning, image/CDN changes.
- `getDeliveryConfig` memoization — it is a first-load cost (root layout persists
  across client-side navigation), not a per-nav tax.
- Any visual redesign of pages or skeletons beyond layout-matching placeholders.
