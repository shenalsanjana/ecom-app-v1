# Admin UI Shell — Design

**Date:** 2026-05-28
**Spec #:** 2 of 9 (Dressing Bear admin dashboard)
**Status:** Draft — pending implementation plan
**Depends on:** Spec #1 (admin roles & route protection), shipped on `feat/admin-roles-auth`

---

## 1. Goal

Add the admin UI chrome (top bar + left sidebar) and a live KPI dashboard at `/admin`. Foundational for specs #3-#6 (Orders, Products, Customers, Settings) — every subsequent admin page reuses this chrome and the sidebar's nav structure.

## 2. Non-goals

- Per-entity admin pages (Orders, Products, Customers, Settings screens) — specs #3-#6.
- Per-entity sub-dashboards — specs #3 onward.
- Charts / graphs / trend lines — defer to a later analytics spec if/when needed.
- Real-time updates (websocket push, polling) — admin pulls; reload to refresh.
- Search bar in top bar — defer until there's content to search across.
- Saved filters or dashboard customization — out of scope.
- Configurable low-stock threshold UI — hardcoded constant for now; spec #6 (Settings) can promote it to a stored value.
- Audit log of admin actions — still deferred (per spec #1 §8).
- 2FA for admins — still deferred (per spec #1 §8).

## 3. Constraints from the existing codebase

- **Next.js 16** App Router. Layouts compose top-down; the new `app/admin/layout.tsx` wraps `app/admin/page.tsx` and every future `app/admin/<entity>/...` page.
- **NextAuth v5** with role-aware session (spec #1). `requireAdmin()` is available in `app/_lib/admin-auth.ts`.
- **Prisma + Postgres** with `connection_limit=2` (`app/_lib/prisma.ts:14`). Dashboard queries must stay light to avoid exhausting the pool under concurrent admin requests.
- **Light-only design system.** Dark mode was intentionally dropped (see `app/globals.css:8`). Boutique palette: warm cream / cocoa / olive, with pre-defined sidebar tokens (`--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, `--sidebar-border`).
- **shadcn primitives** in `components/ui/`: Card, Button, DropdownMenu, Separator, etc. `Sheet` and `Skeleton` are NOT yet installed — add via `npx shadcn add sheet skeleton` as a one-time setup step.
- **Server vs Client constraint (CLAUDE.md §3):** no `async` Server Component inside a `"use client"` component. Layout + page + tiles + loading are Server; sidebar, top bar, error boundary are leaf `"use client"`.
- **Time:** server runs in UTC. Sri Lanka operator wants Asia/Colombo (UTC+5:30, no DST) day boundaries.
- **Existing chrome pattern** to mirror loosely: `app/account/layout.tsx` (SiteHeader + sidebar + main) and `AccountSidebar` (active-link style, signout button). The admin chrome is *not* a copy — it has its own header — but the active-link styling and `usePathname` pattern are reused.

## 4. Design

### 4.1 File map (10 new files)

| File | Type | Responsibility |
|------|------|----------------|
| `app/admin/layout.tsx` | Server | `requireAdmin()`, render `AdminTopBar` + `AdminSidebar` + main slot |
| `app/admin/page.tsx` | Server | Call `getDashboardKpis()`, render hero tile + 3 secondary |
| `app/admin/loading.tsx` | Server | 4 shadcn `Skeleton` tiles in the hero+3 layout |
| `app/admin/error.tsx` | `"use client"` | Error boundary; logs to console, shows retry button |
| `app/_components/admin/admin-top-bar.tsx` | `"use client"` | Brand link → `/admin`, mobile hamburger + Sheet (drawer), user dropdown (Back to store + Sign out) |
| `app/_components/admin/admin-sidebar.tsx` | `"use client"` | Desktop-only sidebar (`hidden md:block`), exports `ADMIN_NAV`, renders nav with active-state via `usePathname()` |
| `app/_components/admin/kpi-tile.tsx` | Server | Props `{ label, value, variant?: "hero" \| "default" }` |
| `app/_lib/admin-kpis.ts` | server module | `getDashboardKpis()` + types |
| `app/_lib/time.ts` | shared module | `startOfTodaySLT()` |
| `app/_lib/__tests__/admin-kpis.test.ts` | unit test | Mock prisma; assert query shapes + return shape |
| `tests/e2e/admin-shell.spec.ts` | e2e | Chrome render, sidebar active state, mobile drawer, user-menu actions, KPI values are numeric |

**Note:** `ADMIN_NAV` constant is exported from `admin-sidebar.tsx` and imported by `admin-top-bar.tsx` for the mobile drawer. One source of truth; no separate config file needed.

### 4.2 Chrome layout

```
┌──────────────────────────────────────────────────────────┐
│ Dressing Bear · Admin                          admin@… ▾ │ ← top bar (h-14, sticky, border-b)
├──────────┬───────────────────────────────────────────────┤
│ Dashboard│  Dashboard                                    │
│ Orders   │  ┌────────────────────────────────────────┐   │
│ Products │  │  PENDING DISPATCH               3      │   │ ← hero tile (Card, brand-tinted)
│ Customers│  └────────────────────────────────────────┘   │
│ Settings │  ┌────────┐  ┌────────┐  ┌────────┐           │
│          │  │  12    │  │   5    │  │   2    │           │ ← 3 secondary tiles
│          │  └────────┘  └────────┘  └────────┘           │
└──────────┴───────────────────────────────────────────────┘
   w-56                       flex-1
```

- **Top bar:** sticky, `h-14`, `border-b`, fills viewport width (no `max-w-7xl` — admin is app-like, not content-like).
- **Sidebar:** `w-56`, `border-r`, light cream background (`bg-sidebar` token). Hidden on `<md` via `hidden md:block`. Active item gets `bg-secondary` background, matching the `AccountSidebar` pattern.
- **Main slot:** `flex-1`, `p-6`, wraps the page content (dashboard or any future admin sub-page).

### 4.3 Sidebar nav

```ts
// admin-sidebar.tsx (exported)
export const ADMIN_NAV = [
  { href: "/admin",          label: "Dashboard" },
  { href: "/admin/orders",   label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/settings", label: "Settings" },
] as const;
```

Active-state predicate:
```ts
function isActive(itemHref: string, pathname: string): boolean {
  if (itemHref === "/admin") return pathname === "/admin"; // exact match for Dashboard
  return pathname === itemHref || pathname.startsWith(itemHref + "/");
}
```

The exact-match rule for `/admin` is critical — without it, Dashboard would light up on every admin sub-route. Sub-routes (Orders, Products, etc.) intentionally match deeper paths so `/admin/orders/123` keeps "Orders" highlighted.

Until specs #3-#6 ship, the four non-Dashboard links 404. Spec #1's proxy still gates them at `/admin/*` so anon/customer traffic still bounces — no leak.

### 4.4 Top bar

- **Brand link** (left): `<Link href="/admin">Dressing Bear · Admin</Link>`. Returning home for admin = the dashboard.
- **Hamburger** (visible `md:hidden`): shadcn `Sheet` trigger. Opens a left-side drawer containing the same nav items (rendered from `ADMIN_NAV` with the same active predicate). Sheet auto-closes on link click (`onSelect` or `onClick` callback to the underlying `setOpen(false)`).
- **User dropdown** (right): shadcn `DropdownMenu`. Trigger label is `session.user.name` (falling back to `email`, matching the `AccountSidebar` precedent). Items: "Back to store" → `<Link href="/">` and "Sign out" → `signOut({ redirect: false })` followed by `router.push("/")`. Sign-out mirrors the `AccountSidebar` logout flow exactly to avoid NextAuth redirecting through the proxy.

### 4.5 KPI tiles

```tsx
// kpi-tile.tsx (Server Component)
type Props = { label: string; value: number; variant?: "hero" | "default" };

export function KpiTile({ label, value, variant = "default" }: Props) {
  if (variant === "hero") {
    return (
      <Card className="bg-secondary border-brand/20">
        <CardContent className="p-6">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-5xl font-semibold text-brand">{value}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
```

Dashboard composition:
```tsx
<KpiTile variant="hero" label="Pending dispatch" value={kpis.pendingDispatch} />
<div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
  <KpiTile label="Today's orders" value={kpis.todaysOrders} />
  <KpiTile label="Pending COD" value={kpis.pendingCod} />
  <KpiTile label="Low-stock products" value={kpis.lowStock} />
</div>
```

### 4.6 KPI queries

```ts
// admin-kpis.ts
import { prisma } from "@/app/_lib/prisma";
import { startOfTodaySLT } from "@/app/_lib/time";

const LOW_STOCK_THRESHOLD = 5;

export type DashboardKpis = {
  pendingDispatch: number;
  todaysOrders: number;
  pendingCod: number;
  lowStock: number;
};

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const [pendingDispatch, todaysOrders, pendingCod, lowStock] = await Promise.all([
    prisma.order.count({ where: { status: "CONFIRMED", courierBookedAt: null } }),
    prisma.order.count({ where: { createdAt: { gte: startOfTodaySLT() } } }),
    prisma.order.count({ where: { paymentStatus: "COD_PENDING" } }),
    prisma.product.count({ where: { stock: { lte: LOW_STOCK_THRESHOLD } } }),
  ]);
  return { pendingDispatch, todaysOrders, pendingCod, lowStock };
}
```

Query definitions:

| KPI | Where clause | Notes |
|-----|--------------|-------|
| Pending dispatch | `status = "CONFIRMED" AND courierBookedAt IS NULL` | Order confirmed but not yet booked with Curfox |
| Today's orders | `createdAt >= startOfTodaySLT()` | Operator's "today" in Asia/Colombo |
| Pending COD | `paymentStatus = "COD_PENDING"` | Cash collection still owing on delivery |
| Low-stock | `stock <= 5` | Threshold is a module constant; promotable to a setting later |

### 4.7 Caching

**None.** The route is dynamic anyway via `requireAdmin()` reading cookies. Four indexed `COUNT` queries in parallel take ~30-100ms on Prisma Postgres — freshness wins over micro-latency on a low-traffic admin route. Revisit with `unstable_cache` if traffic grows or future specs add expensive queries.

### 4.8 Timezone helper

```ts
// time.ts
const SL_OFFSET_MINUTES = 5 * 60 + 30; // UTC+5:30, no DST

export function startOfTodaySLT(now: Date = new Date()): Date {
  const slMillis = now.getTime() + SL_OFFSET_MINUTES * 60_000;
  const sl = new Date(slMillis);
  const startSltUtcMillis = Date.UTC(
    sl.getUTCFullYear(),
    sl.getUTCMonth(),
    sl.getUTCDate(),
  );
  return new Date(startSltUtcMillis - SL_OFFSET_MINUTES * 60_000);
}
```

Returns the UTC instant of 00:00 today in Asia/Colombo. `Order.createdAt` is stored UTC; comparing `>= startOfTodaySLT()` gives the operator's local-day count.

Passing `now` as a parameter lets unit tests assert behaviour at noon SLT, just-after-midnight SLT, just-before-midnight SLT.

### 4.9 Loading state

```tsx
// admin/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    </>
  );
}
```

The chrome (layout) renders synchronously — only the page slot streams.

### 4.10 Error state

```tsx
// admin/error.tsx
"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("[Admin Dashboard Error]:", error);
  }, [error]);
  return (
    <div className="rounded-lg border p-8 text-center">
      <h2 className="text-lg font-semibold">Couldn&apos;t load the dashboard</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Something went wrong fetching the latest counts. Try again, or check the console for details.
      </p>
      <Button onClick={reset} className="mt-4">Retry</Button>
    </div>
  );
}
```

Generic message (no stack trace shown to the operator), error logged to console for ops.

### 4.11 Mobile drawer

At `>= 768px`: sidebar always visible, hamburger hidden.

At `< 768px`: hamburger in top bar opens a shadcn `Sheet` from the left. Sheet renders the same `ADMIN_NAV` items with the same active predicate. Each link is wrapped in `<SheetClose asChild>` so navigation closes the drawer automatically — no manual state plumbing.

### 4.12 E2E test plan

Reuse `seedTestUsers()` / `deleteTestUsers()` from spec #1's `tests/e2e/fixtures/users.ts` — the admin login flow is identical.

Tests cover **behaviour** (not exact KPI counts, to keep them robust against existing DB state):

1. Admin lands on `/admin` → chrome renders: brand text, sidebar with 5 items, "Dashboard" item has the active background.
2. Each of the 4 KPI tiles shows a numeric value matching `/^\d+$/`.
3. Click sidebar "Orders" → URL becomes `/admin/orders`. Sidebar's "Orders" now has the active styling (the page itself 404s; assert URL + active state, not page content).
4. Set viewport to 375×667 (mobile) → desktop sidebar is hidden; hamburger is present; tap opens the drawer; nav items are visible.
5. User dropdown → "Back to store" → URL becomes `/`.
6. User dropdown → "Sign out" → session is cleared (visit `/admin` after → redirect to `/login?callbackUrl=%2Fadmin`).

## 5. File-level change summary

(Identical to §4.1 — 10 new files + 2 shadcn primitives auto-generated via `npx shadcn add sheet skeleton`.)

## 6. Rollout plan

1. **Setup:** `npx shadcn add sheet skeleton` — generates `components/ui/sheet.tsx` and `components/ui/skeleton.tsx`.
2. **Implementation:** all 10 files in a single branch (`feat/admin-ui-shell` off of `main` after spec #1 merges).
3. **Smoke locally:** sign in as the seeded `e2e-admin@dressingbear.test` from spec #1's fixtures (or via `npm run admin:create`). Hit `/admin`. Verify chrome + KPI counts against dev data.
4. **Deploy:** no DB migration, no env-var changes.
5. **Acceptance smoke in prod:** the production admin lands on `/admin` and sees their dashboard.

## 7. Risks & mitigations

- **shadcn `Sheet` bundle impact.** Audit during `npm run build`. Mitigation if oversized: hand-roll a drawer with CSS transitions + a Portal. Acceptable risk — `Sheet` is built on Radix Dialog which the project's other shadcn pieces already pull in.
- **Timezone helper edge cases.** Sri Lanka has no DST, so the offset is fixed. The helper uses `Date.UTC` for year/month/day arithmetic which handles leap days and year rollovers correctly. Unit-test 3 cases (noon SLT, 00:30 SLT, 23:30 SLT) to cover the daily boundary.
- **Active sidebar state on nested routes.** `/admin/orders/123` should keep "Orders" highlighted. The `pathname.startsWith(itemHref + "/")` rule does this correctly. Dashboard's exact-match rule prevents the Dashboard item from also lighting up.
- **Connection pool exhaustion.** Prisma pool is capped at 2 (`app/_lib/prisma.ts:14-15`). `Promise.all` of 4 queries serializes through the pool — 2 then 2. Total ~50-100ms. Concurrent admin requests double this; for 1-2 admins it's fine.
- **Low-stock threshold hardcoded.** Future spec #6 (Settings) can promote `LOW_STOCK_THRESHOLD` to a stored config row.
- **Mobile UX below 640px.** Drawer fixes the sidebar issue. Secondary tile grid collapses to single-column via `grid-cols-1 sm:grid-cols-3`. Acceptable since admin is desktop-primary.
- **Brand-color hero tile clashing with cream sidebar.** The brand olive is WCAG-AA verified against cream (per `scripts/check-contrast.ts`). The hero tile background uses `bg-secondary` (light cream variant) with `text-brand` for the numeral — keeps within the tested palette.

## 8. Open / deferred decisions

- **Charts / trend lines:** explicitly out for spec #2. Future analytics spec, or fold into Settings as "recent activity".
- **Real-time updates / push notifications:** out of scope.
- **Per-admin saved filters or dashboard layouts:** out of scope.
- **Configurable low-stock threshold:** fold into Settings (spec #6).
- **i18n for dashboard labels:** out of scope; site is English-only currently.

## 9. Caveats (carried forward)

- **JWT TTL 30 days** (carried from spec #1 §9). A revoked admin can still see the dashboard until their token expires. Same risk profile.
- **Pre-existing e2e test debt** (10 failing tests in `payhere-*` and `order-confirmation` specs). These predate spec #1 and are unrelated to spec #2; flagged here so CI status is understood before merging spec #2.
- **Pre-existing lint debt** (5 errors / 5 warnings in non-admin files). Same disposition.

## 10. Acceptance criteria

The spec is implementable when:

1. `/admin` renders the chrome (top bar + sidebar + main slot) for an authenticated admin.
2. `/admin` shows the 4 KPI tiles with values from `getDashboardKpis()`. Hero tile is "Pending dispatch".
3. Sidebar shows 5 nav items; the active item matches the current pathname (exact match for `/admin`, prefix match for sub-routes).
4. Top bar's user dropdown has "Back to store" (→ `/`) and "Sign out" (clears session, → `/`).
5. At `< 768px`, hamburger opens a drawer with the same nav items; clicking a link closes the drawer.
6. Loading state renders skeleton tiles while server queries resolve.
7. Error boundary catches KPI query failures, logs to console, shows generic message + retry button.
8. Spec #1's redirect invariants still hold (anon → `/login`, customer → `/`, anon on `/api/admin/*` → 401, customer on `/api/admin/*` → 403).
9. All unit tests pass (existing + new `admin-kpis.test.ts`).
10. All e2e tests pass (existing admin-auth.spec.ts + new admin-shell.spec.ts).
11. `npm run build` clean, `tsc --noEmit` clean, `npm run lint` clean for spec #2's own files.
