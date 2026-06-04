# Smooth Navigation (Phase 1 — Perceived Performance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make navigation feel instant for admin and customer users by adding loading boundaries to the routes that lack them, a global navigation progress bar, a role-gated Admin entry link, and by removing full-page-reload and prod-logging drag.

**Architecture:** Phase 1 targets *perceived* latency. Next.js App Router blocks a client-side transition on the server render of any route with no `loading.tsx`; the customer routes `products/[id]`, `categories` (list), and the `account` sub-pages have no boundary, so they get one. Admin detail/form/settings pages already *inherit* `app/admin/loading.tsx` (dashboard-shaped) — they get properly-shaped overrides so the skeleton matches the page. A library-free `<NavigationProgress />` bar acknowledges every click immediately. Two stray `<a href>` tags become `<Link>` to stop full reloads, and NextAuth's forced `debug`/verbose logging is gated to development.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, Tailwind v4, NextAuth v5 (JWT), Vitest (unit), Playwright (e2e). Existing primitives: `@/components/ui/skeleton` (`Skeleton`), `@/app/_components/shared/product-grid-skeleton` (`ProductGridSkeleton`).

**Spec:** `docs/superpowers/specs/2026-06-04-smooth-navigation-design.md`

---

## File Structure

**Create:**
- `app/products/[id]/loading.tsx` — product-detail skeleton (mirrors header + gallery/buy-box + sections)
- `app/categories/loading.tsx` — category-landing skeleton (header + grid)
- `app/account/loading.tsx` — account content-area skeleton (covers `/account`, `/account/security`, `/account/addresses`; `/account/orders` already overrides)
- `app/admin/settings/loading.tsx` — settings form skeleton
- `app/admin/orders/[id]/loading.tsx` — order-detail skeleton
- `app/admin/products/new/loading.tsx` — product-form skeleton
- `app/admin/products/[id]/edit/loading.tsx` — product-form skeleton
- `app/admin/customers/[id]/loading.tsx` — customer-detail skeleton
- `app/_components/shared/navigation-progress.tsx` — global top progress bar (`"use client"`)
- `app/_lib/navigation-progress-util.ts` — pure helper `shouldStartProgress()` (unit-tested)
- `app/_lib/navigation-progress-util.test.ts` — Vitest unit tests for the helper

**Modify:**
- `app/layout.tsx` — mount `<NavigationProgress />`
- `app/_components/home/product-grid.tsx:14` — `<a href="/categories">` → `<Link>`
- `app/about/page.tsx:63` — `<a href="/contact">` → `<Link>` (leave the `mailto:` `<a>` as-is)
- `app/_components/header/profile-menu.tsx` — role-gated "Admin panel" link (ADMIN only)
- `app/_lib/auth.ts` — gate `debug` and verbose `console.log` to non-production
- `app/_lib/auth.config.ts` — gate module-load `console.log` to non-production

**Optional:**
- `tests/e2e/navigation-progress.spec.ts` — Playwright assertion the bar appears during a transition

---

## Task 1: Product-detail loading boundary

**Files:**
- Create: `app/products/[id]/loading.tsx`

The real page (`app/products/[id]/page.tsx`) renders `SiteHeader` + a `max-w-7xl` breadcrumb row + a `lg:grid-cols-[1.6fr_1fr]` gallery/buy-box section + stacked sections, then `SiteFooter`. There is no `products/layout.tsx`, so the loading boundary must render the header/footer itself or the skeleton appears chrome-less.

- [ ] **Step 1: Create the loading file**

```tsx
// app/products/[id]/loading.tsx
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Skeleton className="h-4 w-64 rounded" />
        </div>
        <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4 rounded" />
              <Skeleton className="h-5 w-1/3 rounded" />
              <Skeleton className="h-6 w-1/4 rounded" />
              <Skeleton className="h-24 w-full rounded" />
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
          </div>
        </section>
        <div className="mx-auto max-w-7xl space-y-6 px-4 pb-16 sm:px-6 lg:px-8">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Verify it compiles and renders**

Run: `npm run build`
Expected: Build succeeds; `/products/[id]` appears in the route output with no errors.

- [ ] **Step 3: Commit**

```bash
git add app/products/[id]/loading.tsx
git commit -m "perf(nav): add loading boundary to product detail page"
```

---

## Task 2: Category-landing loading boundary

**Files:**
- Create: `app/categories/loading.tsx`

`app/categories/page.tsx` renders `SiteHeader`/`SiteFooter` itself (same pattern as the home/product pages — there is no `categories/layout.tsx`). The skeleton mirrors a heading + product grid using the shared `ProductGridSkeleton`.

- [ ] **Step 1: Create the loading file**

```tsx
// app/categories/loading.tsx
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { ProductGridSkeleton } from "@/app/_components/shared/product-grid-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Skeleton className="h-9 w-72 rounded" />
          <Skeleton className="mt-3 h-5 w-96 rounded" />
          <div className="mt-8">
            <ProductGridSkeleton count={12} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Confirm `app/categories/page.tsx` renders its own `SiteHeader`/`SiteFooter`**

Run: `grep -n "SiteHeader" app/categories/page.tsx`
Expected: a match (confirms the skeleton should include chrome). If it does NOT render `SiteHeader` (i.e. a `categories/layout.tsx` provides it), remove `SiteHeader`/`SiteFooter` and the outer fragment from the skeleton above and return only the inner `<main>`.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/categories/loading.tsx
git commit -m "perf(nav): add loading boundary to categories landing page"
```

---

## Task 3: Account loading boundary (covers root, security, addresses)

**Files:**
- Create: `app/account/loading.tsx`

`app/account/layout.tsx` renders `SiteHeader` + sidebar + `SiteFooter` and places page content in the right-hand `{children}` slot. So this skeleton renders **only** the content area (no chrome). It covers `/account`, `/account/security`, `/account/addresses`; `/account/orders` keeps its own `app/account/orders/loading.tsx`.

- [ ] **Step 1: Create the loading file**

```tsx
// app/account/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="max-w-lg">
      <Skeleton className="mb-6 h-8 w-40 rounded" />
      <div className="space-y-4">
        <Skeleton className="h-5 w-24 rounded" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-5 w-24 rounded" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-32 rounded-lg" />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/account/loading.tsx
git commit -m "perf(nav): add shared loading boundary for account sub-pages"
```

---

## Task 4: Properly-shaped admin skeleton overrides

**Files:**
- Create: `app/admin/settings/loading.tsx`
- Create: `app/admin/orders/[id]/loading.tsx`
- Create: `app/admin/products/new/loading.tsx`
- Create: `app/admin/products/[id]/edit/loading.tsx`
- Create: `app/admin/customers/[id]/loading.tsx`

These pages currently inherit the dashboard-shaped `app/admin/loading.tsx`. Each override renders inside `app/admin/layout.tsx`'s `{children}` slot (chrome stays), so they return content-area skeletons only. Shapes match page type (form / detail / two-column).

- [ ] **Step 1: Settings skeleton (stacked form sections)**

```tsx
// app/admin/settings/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="max-w-3xl space-y-8">
      <Skeleton className="h-8 w-40 rounded" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-border p-6">
          <Skeleton className="h-5 w-48 rounded" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Order-detail skeleton (two-column)**

```tsx
// app/admin/orders/[id]/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="space-y-6">
      <Skeleton className="h-8 w-56 rounded" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-72 w-full rounded-lg" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Product-form skeleton (shared shape for new + edit)**

```tsx
// app/admin/products/new/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="max-w-2xl space-y-5">
      <Skeleton className="h-8 w-48 rounded" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-11 w-36 rounded-lg" />
    </section>
  );
}
```

```tsx
// app/admin/products/[id]/edit/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="max-w-2xl space-y-5">
      <Skeleton className="h-8 w-48 rounded" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-11 w-36 rounded-lg" />
    </section>
  );
}
```

- [ ] **Step 4: Customer-detail skeleton (header + table)**

```tsx
// app/admin/customers/[id]/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="space-y-6">
      <Skeleton className="h-8 w-56 rounded" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </section>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds; all five admin subroutes still compile.

- [ ] **Step 6: Commit**

```bash
git add app/admin/settings/loading.tsx app/admin/orders/[id]/loading.tsx app/admin/products/new/loading.tsx app/admin/products/[id]/edit/loading.tsx app/admin/customers/[id]/loading.tsx
git commit -m "perf(nav): shape-correct loading skeletons for admin detail/form pages"
```

---

## Task 5: Global navigation progress bar

**Files:**
- Create: `app/_lib/navigation-progress-util.ts`
- Create: `app/_lib/navigation-progress-util.test.ts`
- Create: `app/_components/shared/navigation-progress.tsx`
- Modify: `app/layout.tsx`

A `"use client"` leaf attaches a capturing `click` listener on `document`. When a click lands inside an internal `<a>`/`<Link>` whose destination differs from the current path, it starts the bar; when `usePathname()` changes, it completes and hides the bar. The decision logic is a pure function, unit-tested first (TDD).

- [ ] **Step 1: Write the failing unit test for the decision helper**

```ts
// app/_lib/navigation-progress-util.test.ts
import { describe, it, expect } from "vitest";
import { shouldStartProgress } from "./navigation-progress-util";

describe("shouldStartProgress", () => {
  it("returns true for an internal link to a different path", () => {
    expect(shouldStartProgress("/products/p1", "/categories", "")).toBe(true);
  });

  it("returns false when the destination equals the current path", () => {
    expect(shouldStartProgress("/cart", "/cart", "")).toBe(false);
  });

  it("returns false for an external http(s) link", () => {
    expect(shouldStartProgress("/account", "https://x.com/a", "")).toBe(false);
  });

  it("returns false for mailto/tel/anchor links", () => {
    expect(shouldStartProgress("/x", "mailto:a@b.com", "")).toBe(false);
    expect(shouldStartProgress("/x", "tel:123", "")).toBe(false);
    expect(shouldStartProgress("/x", "#section", "")).toBe(false);
  });

  it("returns false when there is no href", () => {
    expect(shouldStartProgress("/x", null, "")).toBe(false);
  });

  it("treats a same-path change of query string as navigation", () => {
    expect(shouldStartProgress("/search", "/search?q=tee", "")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm run test -- navigation-progress-util`
Expected: FAIL — `shouldStartProgress` is not defined / module not found.

- [ ] **Step 3: Implement the helper**

```ts
// app/_lib/navigation-progress-util.ts
// Pure decision: should the global progress bar start for this click target?
// `currentPath` is window.location.pathname; `currentSearch` is location.search.
export function shouldStartProgress(
  currentPath: string,
  href: string | null | undefined,
  currentSearch: string,
): boolean {
  if (!href) return false;
  // External, protocol, and in-page anchors never trigger client navigation.
  if (/^(https?:)?\/\//i.test(href)) return false;
  if (/^(mailto:|tel:|sms:|#)/i.test(href)) return false;
  if (!href.startsWith("/")) return false;
  // Compare destination (path + query) against the current location.
  const current = `${currentPath}${currentSearch}`;
  return href !== current && href !== currentPath;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test -- navigation-progress-util`
Expected: PASS — all 6 assertions green.

- [ ] **Step 5: Create the progress bar component**

```tsx
// app/_components/shared/navigation-progress.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { shouldStartProgress } from "@/app/_lib/navigation-progress-util";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [width, setWidth] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Start the bar when an internal link is clicked (capture phase so we see it
  // before the router begins its transition).
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor || anchor.target === "_blank") return;
      const href = anchor.getAttribute("href");
      if (!shouldStartProgress(window.location.pathname, href, window.location.search)) {
        return;
      }
      setActive(true);
      setWidth(10);
      // Ease toward 90% while we wait for the new route to commit.
      timers.current.push(setTimeout(() => setWidth(60), 100));
      timers.current.push(setTimeout(() => setWidth(85), 350));
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Complete the bar whenever the route (path or query) settles.
  useEffect(() => {
    if (!active) return;
    setWidth(100);
    const done = setTimeout(() => {
      setActive(false);
      setWidth(0);
    }, 250);
    return () => clearTimeout(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Clear any pending easing timers on unmount.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!active && width === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
    >
      <div
        className="h-full bg-brand transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${width}%`, opacity: active ? 1 : 0 }}
      />
    </div>
  );
}
```

- [ ] **Step 6: Mount the bar in the root layout**

`NavigationProgress` calls `useSearchParams()`, which forces a static-rendering bail-out unless wrapped in `<Suspense>`. Add both imports to `app/layout.tsx`:

```tsx
import { Suspense } from "react";
import { NavigationProgress } from "@/app/_components/shared/navigation-progress";
```

Then render it (Suspense-wrapped) as the first child inside `<body>`, before `<AnnouncementBar … />`:

```tsx
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <AnnouncementBar freeThreshold={deliveryConfig.freeThreshold} />
```

- [ ] **Step 7: Verify build + tests**

Run: `npm run build`
Expected: Build succeeds.
Run: `npm run test -- navigation-progress-util`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/_lib/navigation-progress-util.ts app/_lib/navigation-progress-util.test.ts app/_components/shared/navigation-progress.tsx app/layout.tsx
git commit -m "perf(nav): add global navigation progress bar"
```

---

## Task 6: Fix full-page-reload `<a>` tags

**Files:**
- Modify: `app/_components/home/product-grid.tsx`
- Modify: `app/about/page.tsx`

- [ ] **Step 1: Convert the product-grid "View all" link**

In `app/_components/home/product-grid.tsx`, add the import at the top:

```tsx
import Link from "next/link";
```

Replace the `<a href="/categories" …>…</a>` (line ~14) with:

```tsx
          <Link href="/categories" className="border-b border-border pb-0.5 text-sm font-medium text-foreground hover:border-foreground">
            View all
          </Link>
```

- [ ] **Step 2: Convert the about-page contact link**

In `app/about/page.tsx`, add the import at the top:

```tsx
import Link from "next/link";
```

Replace the `<a href="/contact" …>contact form</a>` (line ~63) with:

```tsx
                <Link href="/contact" className="text-primary hover:underline">
                  contact form
                </Link>
```

Leave the `mailto:dressingbear@gmail.com` `<a>` unchanged — `Link` is for internal routes only.

- [ ] **Step 3: Confirm no remaining internal `<a href="/">` tags**

Run: `grep -rn "<a\s\+href=\"/" app --include=*.tsx`
Expected: no matches (the two were the only internal `<a>` tags).

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/_components/home/product-grid.tsx app/about/page.tsx
git commit -m "perf(nav): use Link for internal nav to stop full-page reloads"
```

---

## Task 7: Role-gated Admin entry link

**Files:**
- Modify: `app/_components/header/profile-menu.tsx`

Show an "Admin panel" item (linking to `/admin`) in the customer header's profile dropdown, only when the signed-in user's role is `ADMIN`. `session.user.role` is typed as `AppRole` via `app/_lib/auth-types.d.ts`.

- [ ] **Step 1: Read the role from the session**

In `app/_components/header/profile-menu.tsx`, extend the derived `user` object (lines ~27-30) to include the role:

```tsx
  const user =
    status === "authenticated" && session?.user
      ? {
          name: session.user.name ?? "",
          email: session.user.email ?? "",
          isAdmin: session.user.role === "ADMIN",
        }
      : null;
```

- [ ] **Step 2: Render the gated Admin link**

Inside the `{user ? ( … )}` branch, immediately after the "Saved addresses" item and before the `<DropdownMenuSeparator />` that precedes "Log out", add:

```tsx
            {user.isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/admin" />}>
                  Admin panel
                </DropdownMenuItem>
              </>
            )}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors on `session.user.role`.

- [ ] **Step 4: Manual check**

Run a production build (`npm run build && npm start`). Logged in as an ADMIN user, open the profile dropdown → "Admin panel" appears and navigates to `/admin`. Logged in as a CUSTOMER, the item is absent.

- [ ] **Step 5: Commit**

```bash
git add app/_components/header/profile-menu.tsx
git commit -m "feat(nav): role-gated Admin panel link in profile menu"
```

---

## Task 8: Gate production debug logging

**Files:**
- Modify: `app/_lib/auth.ts`
- Modify: `app/_lib/auth.config.ts`

`debug: true` and per-call `console.log` run in production today, adding latency and leaking internals. Gate them to development. Keep genuine `console.error` for real failures.

- [ ] **Step 1: Gate NextAuth `debug` and the noisy logs in `auth.ts`**

In `app/_lib/auth.ts`, replace `debug: true,` (line ~27) with:

```tsx
  debug: process.env.NODE_ENV !== "production",
```

Wrap the module-load diagnostic `console.log`/`console.warn` block (lines ~9-21) and the per-request `console.log` calls inside `authorize` so they only run in development. The simplest pattern — add this helper at the top of the file (after the imports) and replace the bare `console.log(...)` diagnostic calls with `devLog(...)`:

```tsx
const devLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") console.log(...args);
};
```

Replace the diagnostic `console.log(...)` calls (the `[Auth]:` lines at module load and inside `authorize`) with `devLog(...)`. Leave `console.error("[Auth]: Unexpected error in authorize:", error)` and the `console.warn` security-relevant lines as-is.

- [ ] **Step 2: Gate the config-load logs in `auth.config.ts`**

In `app/_lib/auth.config.ts`, wrap the trailing diagnostic logs (lines ~31-34) in a non-production guard:

```tsx
if (process.env.NODE_ENV !== "production") {
  console.log("[Auth Config]: Shared config loaded. Secret set:", !!process.env.AUTH_SECRET);
  if (process.env.AUTH_SECRET?.startsWith('"')) {
    console.warn("[Auth Config]: WARNING: AUTH_SECRET starts with a quote. Check environment variables.");
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/_lib/auth.ts app/_lib/auth.config.ts
git commit -m "perf(auth): gate debug logging to development only"
```

---

## Task 9: Build, measure, and verify

**Files:** none (verification only)

- [ ] **Step 1: Full build + unit tests**

Run: `npm run build`
Expected: Build succeeds with no type/lint errors.
Run: `npm run test`
Expected: All tests pass (including `navigation-progress-util`).

- [ ] **Step 2: Capture the before/after measurement (success criterion 3)**

Start a production server: `npm run build && npm start`. In the browser DevTools → Network, click a product card (`/products/[id]`). Record:
- The RSC navigation request (`?_rsc=`) duration.
- That a skeleton appears **immediately** on click (no blank "beat") and the progress bar animates.

Note the numbers in the PR/commit description. (If a pre-change baseline was not captured, check out `main` before this branch, repeat, and record — the qualitative "instant skeleton vs wait-then-snap" difference is the primary signal.)

- [ ] **Step 3: Manual click-through of every changed route**

In the production server, confirm instant feedback (skeleton and/or progress bar, no white flash) on:
`/products/[id]`, `/categories`, `/account`, `/account/security`, `/account/addresses`, `/admin/settings`, `/admin/orders/[id]`, `/admin/products/new`, `/admin/products/[id]/edit`, `/admin/customers/[id]`, the home "View all" link, and the about-page "contact form" link.

- [ ] **Step 4: Commit any measurement notes**

```bash
git add -A
git commit -m "docs(nav): record perceived-performance before/after notes" --allow-empty
```

---

## Task 10 (Optional): Playwright e2e for the progress bar

**Files:**
- Create: `tests/e2e/navigation-progress.spec.ts`

Only do this if the Playwright harness runs cleanly in this environment (`npm run test:e2e`). The bar is transient, so assert it becomes attached during a navigation triggered by a `<Link>` click.

- [ ] **Step 1: Write the e2e spec**

```ts
// tests/e2e/navigation-progress.spec.ts
import { test, expect } from "@playwright/test";

test("navigation progress bar appears on internal navigation", async ({ page }) => {
  await page.goto("/");
  // The "View all" link routes to /categories.
  const viewAll = page.getByRole("link", { name: /view all/i });
  await viewAll.click();
  // The bar mounts (h-0.5 fixed top element) during the transition.
  await expect(page).toHaveURL(/\/categories/);
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- navigation-progress`
Expected: PASS. If the harness needs an isolated DB or a running server it cannot start here, mark this task deferred (consistent with the repo's existing deferred-e2e note) and move on.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/navigation-progress.spec.ts
git commit -m "test(nav): e2e for navigation progress bar"
```

---

## Phase 2 (deferred, gated — NOT in this plan)

Implement only if Task 9's measurement shows content still lingers behind the skeleton:
- Cache the category-landing case of `getProducts` (categorySlug + default sort), or use `generateStaticParams` + ISR for category pages.
- Trim/paginate admin list queries (`admin/orders`, `admin/products`, `admin/customers`).
- `searchProducts` stays dynamic/uncached.

## Self-review notes (resolved)
- **Spec coverage:** loading boundaries (Tasks 1-4), global indicator (Task 5), `<a>`→`<Link>` (Task 6), debug logging (Task 8) all map to spec components. The role-gated Admin link (Task 7) is an addition requested during planning.
- **Boundary correction:** admin detail pages already inherit `admin/loading.tsx`; Task 4 provides shape-correct overrides rather than first-time boundaries (matches the refined route map).
- **Type consistency:** helper `shouldStartProgress(currentPath, href, currentSearch)` signature is identical in test, implementation, and the component call site. `session.user.role` typed via `auth-types.d.ts`.
