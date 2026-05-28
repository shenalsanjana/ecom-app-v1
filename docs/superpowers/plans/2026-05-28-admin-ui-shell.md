# Admin UI Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin chrome (top bar + left sidebar) and a live KPI dashboard at `/admin`, foundational for specs #3-#6 (Orders, Products, Customers, Settings).

**Architecture:** Ten new files split across `app/admin/` (route segments), `app/_components/admin/` (chrome components), and `app/_lib/` (data + utilities). Server Components do the data fetching and chrome composition; two leaf `"use client"` components (`AdminSidebar`, `AdminTopBar`) handle the interactive bits. Dashboard data comes from `getDashboardKpis()` — four indexed `COUNT` queries running in parallel, no caching. Mobile drawer via shadcn `Sheet`; loading state via shadcn `Skeleton`.

**Tech Stack:** Next.js 16 (App Router, Server Components), NextAuth v5 (`requireAdmin()` from spec #1), Prisma + Postgres, shadcn UI (existing primitives + new `Sheet` and `Skeleton`), Tailwind v4 (boutique palette tokens), Vitest (unit tests), Playwright (e2e).

**Source spec:** `docs/superpowers/specs/2026-05-28-admin-ui-shell-design.md`

---

## File map

| File | Action | Responsibility |
|------|--------|---------------|
| `components/ui/sheet.tsx` | generated | shadcn primitive (CLI generated in Task 1) |
| `components/ui/skeleton.tsx` | generated | shadcn primitive (CLI generated in Task 1) |
| `app/_lib/time.ts` | new | `startOfTodaySLT()` — Asia/Colombo day boundary |
| `app/_lib/__tests__/time.test.ts` | new | 3 boundary cases (noon, just-after-midnight, just-before-midnight SLT) |
| `app/_lib/admin-kpis.ts` | new | `getDashboardKpis()` + `DashboardKpis` type |
| `app/_lib/__tests__/admin-kpis.test.ts` | new | 5 cases — 4 query-shape + 1 return-shape |
| `app/_components/admin/kpi-tile.tsx` | new | `<KpiTile label value variant?>` Server Component |
| `app/_components/admin/admin-sidebar.tsx` | new | Desktop sidebar; exports `ADMIN_NAV` + `isActive()` |
| `app/_components/admin/__tests__/admin-sidebar.test.ts` | new | `isActive()` predicate cases |
| `app/_components/admin/admin-top-bar.tsx` | new | Top bar + mobile `Sheet` drawer + user `DropdownMenu` |
| `app/admin/layout.tsx` | new | `requireAdmin()` + chrome composition |
| `app/admin/page.tsx` | new | Dashboard — 1 hero tile + 3 secondary |
| `app/admin/loading.tsx` | new | Skeleton tiles in the hero+3 layout |
| `app/admin/error.tsx` | new | Error boundary, console-logged + retry button |
| `tests/e2e/admin-shell.spec.ts` | new | Behavioural e2e (chrome, sidebar nav, drawer, dropdown, KPI numeric values) |

**One responsibility per file:** `time.ts` is the only place SL day math lives; `admin-kpis.ts` is the only consumer of dashboard prisma queries; `kpi-tile.tsx` is presentation-only and is reusable by any future admin sub-page; `admin-sidebar.tsx` owns `ADMIN_NAV` as a single source of truth that `admin-top-bar.tsx` imports for the mobile drawer; layout/page/loading/error are the Next.js route conventions for `/admin`.

---

## Task 1: Install shadcn `Sheet` and `Skeleton` primitives

Pre-work for downstream tasks. No tests.

- [ ] **Step 1: Run shadcn add**

Run: `npx shadcn@latest add sheet skeleton`

Expected: creates `components/ui/sheet.tsx` and `components/ui/skeleton.tsx`. If the CLI asks "Would you like to overwrite?" or similar interactive prompts (unlikely on fresh adds), answer No / use defaults. If the CLI refuses to run non-interactively, add `--yes`: `npx shadcn@latest add sheet skeleton --yes`.

- [ ] **Step 2: Verify the primitives exist**

Run: `ls components/ui/sheet.tsx components/ui/skeleton.tsx`

Expected: both files listed.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: clean. shadcn additions reference `cn()` from `@/lib/utils`; the project already has shadcn primitives installed (Card, Button, DropdownMenu in `components/ui/`), so this utility is already wired up.

- [ ] **Step 4: Commit**

```bash
git add components/ui/sheet.tsx components/ui/skeleton.tsx
git commit -m "chore(ui): add shadcn Sheet and Skeleton primitives"
```

---

## Task 2: Add `startOfTodaySLT()` in `time.ts`

**Files:**
- Create: `app/_lib/time.ts`
- Test: `app/_lib/__tests__/time.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/time.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { startOfTodaySLT } from "../time";

// Sri Lanka = UTC+5:30, no DST.
// SLT 00:00 corresponds to UTC 18:30 of the previous day.

describe("startOfTodaySLT", () => {
  it("returns SLT day boundary when called at noon SLT", () => {
    // Noon SLT on 2026-05-28 = 06:30 UTC on 2026-05-28
    const noonSlt = new Date("2026-05-28T06:30:00.000Z");
    const result = startOfTodaySLT(noonSlt);
    // SLT 00:00 on 2026-05-28 = UTC 18:30 on 2026-05-27
    expect(result.toISOString()).toBe("2026-05-27T18:30:00.000Z");
  });

  it("returns same-day SLT boundary just after midnight SLT", () => {
    // 00:01 SLT on May 28 = 18:31 UTC on May 27
    const justAfter = new Date("2026-05-27T18:31:00.000Z");
    const result = startOfTodaySLT(justAfter);
    expect(result.toISOString()).toBe("2026-05-27T18:30:00.000Z");
  });

  it("returns previous-day SLT boundary just before midnight SLT", () => {
    // 23:59 SLT on May 27 = 18:29 UTC on May 27
    const justBefore = new Date("2026-05-27T18:29:00.000Z");
    const result = startOfTodaySLT(justBefore);
    // SLT 00:00 on 2026-05-27 = UTC 18:30 on 2026-05-26
    expect(result.toISOString()).toBe("2026-05-26T18:30:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/time.test.ts`

Expected: import error — `../time` does not exist.

- [ ] **Step 3: Implement `startOfTodaySLT`**

Create `app/_lib/time.ts`:

```ts
// Asia/Colombo day-boundary helper. SL is UTC+5:30 with no DST,
// so a fixed offset + Date.UTC arithmetic is safe across year/month/leap boundaries.

const SL_OFFSET_MINUTES = 5 * 60 + 30;

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/_lib/__tests__/time.test.ts`

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/time.ts app/_lib/__tests__/time.test.ts
git commit -m "feat(time): startOfTodaySLT for Asia/Colombo day boundaries"
```

---

## Task 3: Build `getDashboardKpis()` in `admin-kpis.ts`

**Files:**
- Create: `app/_lib/admin-kpis.ts`
- Test: `app/_lib/__tests__/admin-kpis.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/_lib/__tests__/admin-kpis.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { orderCount, productCount } = vi.hoisted(() => ({
  orderCount: vi.fn(),
  productCount: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: { count: orderCount },
    product: { count: productCount },
  },
}));

const FROZEN_TODAY = new Date("2026-05-28T00:00:00.000Z");
vi.mock("@/app/_lib/time", () => ({
  startOfTodaySLT: () => FROZEN_TODAY,
}));

import { getDashboardKpis } from "../admin-kpis";

beforeEach(() => {
  orderCount.mockReset();
  productCount.mockReset();
});

describe("getDashboardKpis", () => {
  it("queries pending dispatch with status=CONFIRMED and courierBookedAt=null", async () => {
    orderCount.mockResolvedValueOnce(7).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    productCount.mockResolvedValueOnce(0);

    const result = await getDashboardKpis();

    expect(orderCount).toHaveBeenNthCalledWith(1, {
      where: { status: "CONFIRMED", courierBookedAt: null },
    });
    expect(result.pendingDispatch).toBe(7);
  });

  it("queries today's orders using startOfTodaySLT as the gte boundary", async () => {
    orderCount.mockResolvedValueOnce(0).mockResolvedValueOnce(12).mockResolvedValueOnce(0);
    productCount.mockResolvedValueOnce(0);

    const result = await getDashboardKpis();

    expect(orderCount).toHaveBeenNthCalledWith(2, {
      where: { createdAt: { gte: FROZEN_TODAY } },
    });
    expect(result.todaysOrders).toBe(12);
  });

  it("queries pending COD with paymentStatus=COD_PENDING", async () => {
    orderCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(4);
    productCount.mockResolvedValueOnce(0);

    const result = await getDashboardKpis();

    expect(orderCount).toHaveBeenNthCalledWith(3, {
      where: { paymentStatus: "COD_PENDING" },
    });
    expect(result.pendingCod).toBe(4);
  });

  it("queries low-stock with stock<=5 threshold", async () => {
    orderCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    productCount.mockResolvedValueOnce(2);

    const result = await getDashboardKpis();

    expect(productCount).toHaveBeenCalledWith({
      where: { stock: { lte: 5 } },
    });
    expect(result.lowStock).toBe(2);
  });

  it("returns all four KPIs in the expected shape", async () => {
    orderCount.mockResolvedValueOnce(7).mockResolvedValueOnce(12).mockResolvedValueOnce(4);
    productCount.mockResolvedValueOnce(2);

    const result = await getDashboardKpis();

    expect(result).toEqual({
      pendingDispatch: 7,
      todaysOrders: 12,
      pendingCod: 4,
      lowStock: 2,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-kpis.test.ts`

Expected: import error — `../admin-kpis` does not exist.

- [ ] **Step 3: Implement `getDashboardKpis`**

Create `app/_lib/admin-kpis.ts`:

```ts
// Single source for admin dashboard KPI queries. Four indexed COUNTs
// in parallel; expected ~30-100ms on Prisma Postgres. No caching —
// the /admin route is dynamic via requireAdmin() reading cookies, and
// freshness wins over micro-latency on a low-traffic admin route.
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/_lib/__tests__/admin-kpis.test.ts`

Expected: 5 passed.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/admin-kpis.ts app/_lib/__tests__/admin-kpis.test.ts
git commit -m "feat(admin): getDashboardKpis with 4 parallel COUNT queries"
```

---

## Task 4: Build `KpiTile` presentation component

**Files:**
- Create: `app/_components/admin/kpi-tile.tsx`

No unit test — presentation-only Server Component, behaviour covered by e2e in Task 11.

- [ ] **Step 1: Implement `KpiTile`**

Create `app/_components/admin/kpi-tile.tsx`:

```tsx
// Presentation tile for admin dashboard stats. Hero variant uses the
// brand olive token; default variant is plain. Server Component — no
// client interactivity needed, so it composes safely under any layout.
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  label: string;
  value: number;
  variant?: "hero" | "default";
};

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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/_components/admin/kpi-tile.tsx
git commit -m "feat(admin): KpiTile with hero and default variants"
```

---

## Task 5: Build `AdminSidebar` + `ADMIN_NAV` + `isActive`

**Files:**
- Create: `app/_components/admin/admin-sidebar.tsx`
- Test: `app/_components/admin/__tests__/admin-sidebar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/_components/admin/__tests__/admin-sidebar.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isActive } from "../admin-sidebar";

describe("isActive", () => {
  it("matches exact /admin (Dashboard) only at exactly /admin", () => {
    expect(isActive("/admin", "/admin")).toBe(true);
    expect(isActive("/admin", "/admin/orders")).toBe(false);
    expect(isActive("/admin", "/admin/orders/123")).toBe(false);
  });

  it("matches sub-route exact path", () => {
    expect(isActive("/admin/orders", "/admin/orders")).toBe(true);
  });

  it("matches nested paths under a sub-route", () => {
    expect(isActive("/admin/orders", "/admin/orders/123")).toBe(true);
    expect(isActive("/admin/products", "/admin/products/category/tees")).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(isActive("/admin/orders", "/admin/products")).toBe(false);
    expect(isActive("/admin/orders", "/account")).toBe(false);
  });

  it("does not match partial path segments (Orders vs OrdersExtra)", () => {
    // The trailing-'/' rule in startsWith prevents /admin/orders matching /admin/ordersextra.
    expect(isActive("/admin/orders", "/admin/ordersextra")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_components/admin/__tests__/admin-sidebar.test.ts`

Expected: import error — `../admin-sidebar` does not exist.

- [ ] **Step 3: Implement `AdminSidebar`, `ADMIN_NAV`, and `isActive`**

Create `app/_components/admin/admin-sidebar.tsx`:

```tsx
"use client";
// Desktop-only sidebar (hidden below md). ADMIN_NAV and isActive are
// exported so admin-top-bar.tsx can render the same items inside its
// mobile drawer.
import Link from "next/link";
import { usePathname } from "next/navigation";

export const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export function isActive(itemHref: string, pathname: string): boolean {
  if (itemHref === "/admin") return pathname === "/admin";
  return pathname === itemHref || pathname.startsWith(itemHref + "/");
}

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:block w-56 shrink-0 border-r border-sidebar-border bg-sidebar">
      <nav className="flex flex-col gap-1 p-4 text-sm">
        {ADMIN_NAV.map((it) => {
          const active = isActive(it.href, pathname);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={
                active
                  ? "rounded px-2 py-1.5 bg-secondary font-medium text-foreground"
                  : "rounded px-2 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/_components/admin/__tests__/admin-sidebar.test.ts`

Expected: 5 passed.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/_components/admin/admin-sidebar.tsx app/_components/admin/__tests__/admin-sidebar.test.ts
git commit -m "feat(admin): AdminSidebar with ADMIN_NAV + isActive predicate"
```

---

## Task 6: Build `AdminTopBar` (brand, mobile drawer, user dropdown)

**Files:**
- Create: `app/_components/admin/admin-top-bar.tsx`

No unit tests — interactive Sheet + DropdownMenu behaviour is covered by Task 11 e2e.

- [ ] **Step 1: Implement `AdminTopBar`**

Create `app/_components/admin/admin-top-bar.tsx`:

```tsx
"use client";
// Admin top bar: brand link (→ /admin), mobile hamburger that opens a
// Sheet with the same ADMIN_NAV items, and a user dropdown with
// "Back to store" + "Sign out".
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ADMIN_NAV, isActive } from "./admin-sidebar";

export function AdminTopBar({ userLabel }: { userLabel: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 h-14 border-b bg-background flex items-center px-4 sm:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden mr-2"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64">
          <nav className="mt-6 flex flex-col gap-1 text-sm">
            {ADMIN_NAV.map((it) => {
              const active = isActive(it.href, pathname);
              return (
                <SheetClose asChild key={it.href}>
                  <Link
                    href={it.href}
                    className={
                      active
                        ? "rounded px-3 py-2 bg-secondary font-medium text-foreground"
                        : "rounded px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }
                  >
                    {it.label}
                  </Link>
                </SheetClose>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <Link href="/admin" className="font-semibold tracking-tight">
        Dressing Bear · Admin
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="ml-auto text-sm font-normal text-muted-foreground"
          >
            {userLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href="/">Back to store</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleSignOut}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: clean.

`lucide-react` is already a project dependency (used by `app/_components/home/site-header.tsx`), so the `Menu` icon import resolves.

- [ ] **Step 3: Commit**

```bash
git add app/_components/admin/admin-top-bar.tsx
git commit -m "feat(admin): AdminTopBar with mobile drawer + user dropdown"
```

---

## Task 7: Build `app/admin/layout.tsx`

**Files:**
- Create: `app/admin/layout.tsx`

- [ ] **Step 1: Implement the layout**

Create `app/admin/layout.tsx`:

```tsx
// Admin chrome. requireAdmin() is the layer-2 server-side guard; the
// proxy.ts edge gate is layer 1 (spec #1).
import { requireAdmin } from "@/app/_lib/admin-auth";
import { AdminTopBar } from "@/app/_components/admin/admin-top-bar";
import { AdminSidebar } from "@/app/_components/admin/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const userLabel = session.user.name || session.user.email || "Admin";

  return (
    <div className="flex min-h-screen flex-col">
      <AdminTopBar userLabel={userLabel} />
      <div className="flex flex-1">
        <AdminSidebar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "feat(admin): layout with requireAdmin gate and chrome composition"
```

---

## Task 8: Build `app/admin/page.tsx` (dashboard)

**Files:**
- Create: `app/admin/page.tsx`

- [ ] **Step 1: Implement the dashboard page**

Create `app/admin/page.tsx`:

```tsx
// /admin dashboard. Server Component — awaits getDashboardKpis()
// and renders 1 hero tile + 3 secondary tiles. No client interactivity.
import { getDashboardKpis } from "@/app/_lib/admin-kpis";
import { KpiTile } from "@/app/_components/admin/kpi-tile";

export default async function AdminDashboardPage() {
  const kpis = await getDashboardKpis();

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Dashboard</h1>
      <KpiTile variant="hero" label="Pending dispatch" value={kpis.pendingDispatch} />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile label="Today's orders" value={kpis.todaysOrders} />
        <KpiTile label="Pending COD" value={kpis.pendingCod} />
        <KpiTile label="Low-stock products" value={kpis.lowStock} />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat(admin): dashboard page with hero + 3 KPI tiles"
```

---

## Task 9: Build `app/admin/loading.tsx`

**Files:**
- Create: `app/admin/loading.tsx`

- [ ] **Step 1: Implement the skeleton state**

Create `app/admin/loading.tsx`:

```tsx
// Skeleton state shown by Next.js while the dashboard's server queries
// resolve. The chrome (layout) renders synchronously above this slot.
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section>
      <Skeleton className="mb-6 h-8 w-40 rounded" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/admin/loading.tsx
git commit -m "feat(admin): loading.tsx with skeleton tiles"
```

---

## Task 10: Build `app/admin/error.tsx`

**Files:**
- Create: `app/admin/error.tsx`

- [ ] **Step 1: Implement the error boundary**

Create `app/admin/error.tsx`:

```tsx
"use client";
// Error boundary for the dashboard. Catches throws from getDashboardKpis()
// or any rendering issue. Shows a generic message (no internal details),
// logs the actual error to the console for ops.
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: clean.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run: `npm run dev`

Visit `http://localhost:3000/admin` after signing in as an admin (use the `e2e-admin@dressingbear.test` user that the e2e fixtures seed, or `npm run admin:create -- --email <you> --password <pw> --name <name>`).

Expected:
- Chrome renders: top bar with brand "Dressing Bear · Admin" + user dropdown right, left sidebar with 5 nav items, "Dashboard" highlighted.
- 4 KPI tiles render with values from your dev DB.
- Hovering each non-active sidebar item shows the hover state.
- Clicking the user dropdown shows "Back to store" + "Sign out".
- Shrinking the window below `768px` collapses the sidebar; hamburger appears in the top bar; tap opens the drawer.

If anything looks off, fix before moving to Task 11.

- [ ] **Step 4: Commit**

```bash
git add app/admin/error.tsx
git commit -m "feat(admin): error.tsx with console log + retry button"
```

---

## Task 11: E2E test — admin shell behaviour

**Files:**
- Create: `tests/e2e/admin-shell.spec.ts`

Reuses `seedTestUsers()` / `deleteTestUsers()` from `tests/e2e/fixtures/users.ts` (spec #1).

- [ ] **Step 1: Write the e2e test**

Create `tests/e2e/admin-shell.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { ADMIN, seedTestUsers, deleteTestUsers } from "./fixtures/users";

test.describe("Spec #2: admin UI shell", () => {
  test.beforeAll(async () => {
    await seedTestUsers();
  });

  test.afterAll(async () => {
    await deleteTestUsers();
  });

  test.describe("authenticated admin", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/login");
      await page.fill("#email", ADMIN.email);
      await page.fill("#password", ADMIN.password);
      await Promise.all([
        page.waitForURL("/admin"),
        page.click('button[type="submit"]'),
      ]);
    });

    test("chrome renders with brand and 5 sidebar items", async ({ page }) => {
      await expect(page.getByText("Dressing Bear · Admin")).toBeVisible();
      for (const label of ["Dashboard", "Orders", "Products", "Customers", "Settings"]) {
        await expect(page.getByRole("link", { name: label }).first()).toBeVisible();
      }
    });

    test("each of the 4 KPI tiles shows a numeric value", async ({ page }) => {
      const labels = [
        "Pending dispatch",
        "Today's orders",
        "Pending COD",
        "Low-stock products",
      ];
      for (const label of labels) {
        const labelEl = page.getByText(label, { exact: true });
        await expect(labelEl).toBeVisible();
        // The value sits as a sibling <p> inside the same Card.
        const value = labelEl.locator("xpath=following-sibling::p").first();
        await expect(value).toHaveText(/^\d+$/);
      }
    });

    test("clicking Orders navigates to /admin/orders", async ({ page }) => {
      await page.getByRole("link", { name: "Orders" }).first().click();
      await expect(page).toHaveURL("/admin/orders");
    });

    test("user dropdown 'Back to store' navigates to /", async ({ page }) => {
      await page.getByRole("button", { name: ADMIN.name }).click();
      await page.getByRole("menuitem", { name: "Back to store" }).click();
      await expect(page).toHaveURL("/");
    });

    test("user dropdown 'Sign out' clears the session", async ({ page }) => {
      await page.getByRole("button", { name: ADMIN.name }).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      await expect(page).toHaveURL("/");

      // Session cleared → /admin now bounces to /login.
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fadmin$/);
    });

    test("mobile viewport opens the drawer via hamburger", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();

      await page.getByRole("button", { name: "Open menu" }).click();

      // shadcn Sheet renders role="dialog"; scope assertions to the drawer
      // so they don't match the desktop sidebar's (CSS-hidden) duplicates.
      const drawer = page.getByRole("dialog");
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Dashboard" })).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Orders" })).toBeVisible();
    });
  });
});
```

- [ ] **Step 2: Run the e2e tests**

Run: `npx playwright test tests/e2e/admin-shell.spec.ts`

Expected: 6 passed (`test.beforeEach` doesn't count as a test).

If a test fails, debug with `npx playwright test tests/e2e/admin-shell.spec.ts --headed --debug`.

Common adjustments if something fails:
- KPI numeric-value selector: if the `following-sibling::p` xpath doesn't work because shadcn's Card injects an extra element, fall back to anchoring on the test id — add `data-testid={\`kpi-${label.replace(/ /g, "-").toLowerCase()}\`}` on `<Card>` in `kpi-tile.tsx` and use `page.getByTestId("kpi-pending-dispatch")` in the test.
- User-dropdown trigger: `getByRole("button", { name: ADMIN.name })` matches the button whose accessible name is "E2E Admin". If it's ambiguous, narrow with `.first()` or add `data-testid="admin-user-menu"`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/admin-shell.spec.ts
git commit -m "test(e2e): admin shell behaviour (chrome, drawer, dropdown, KPIs)"
```

---

## Task 12: Full-suite verification

- [ ] **Step 1: Run linter**

Run: `npm run lint`

Expected: pre-existing 5 errors / 5 warnings in non-admin files (`curfox`, `mailer`, `checkout/book-courier`, `prisma/seed.ts`, `scripts/*`). NO new errors or warnings introduced by spec #2's files (`app/admin/**`, `app/_components/admin/**`, `app/_lib/admin-kpis.ts`, `app/_lib/time.ts`, `tests/e2e/admin-shell.spec.ts`). If new lint errors appear in spec #2 files, fix them and re-run.

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`

Expected: clean.

- [ ] **Step 3: Run all unit tests**

Run: `npm test`

Expected: all green. New cases:
- `app/_lib/__tests__/time.test.ts`: 3 cases
- `app/_lib/__tests__/admin-kpis.test.ts`: 5 cases
- `app/_components/admin/__tests__/admin-sidebar.test.ts`: 5 cases

Total new: 13 cases. Plus pre-existing 175 → **expect 188 passed**.

- [ ] **Step 4: Run the full admin e2e suite**

Run: `npx playwright test tests/e2e/admin-auth.spec.ts tests/e2e/admin-shell.spec.ts`

Expected: 13 passed (7 from spec #1's `admin-auth.spec.ts` + 6 from spec #2's `admin-shell.spec.ts`). The wider e2e suite has 10 pre-existing failures in `payhere-*` and `order-confirmation` — those predate this branch and are unrelated to spec #2 (acknowledged in spec §9).

- [ ] **Step 5: Run the production build**

Run: `npm run build`

Expected: succeeds. In the route table, `/admin` should appear as `ƒ /admin` (dynamic). The `ƒ Proxy (Middleware)` line is still present.

- [ ] **Step 6: Verify acceptance criteria are met**

Cross-check against `docs/superpowers/specs/2026-05-28-admin-ui-shell-design.md` §10:

1. `/admin` renders the chrome (top bar + sidebar + main slot) for an authenticated admin — Tasks 7, 8 ✓
2. `/admin` shows the 4 KPI tiles with values from `getDashboardKpis()`; hero is Pending dispatch — Tasks 3, 4, 8 ✓
3. Sidebar shows 5 nav items; active item matches pathname — Task 5 (+ unit test) ✓
4. User dropdown has "Back to store" + "Sign out" — Task 6 ✓
5. At `<768px`, hamburger opens a drawer with same nav items — Task 6 ✓
6. Loading state renders skeleton tiles — Task 9 ✓ (visual confirmation in Task 10 Step 3 smoke)
7. Error boundary catches KPI failures — Task 10 ✓ (visual confirmation reserved for follow-up; throws caught by Next.js error boundary contract)
8. Spec #1 redirect invariants still hold — covered by re-running `admin-auth.spec.ts` in Task 12 Step 4 ✓
9. All unit tests pass — Task 12 Step 3 ✓
10. All e2e tests pass — Task 12 Step 4 ✓
11. `npm run build` / `tsc --noEmit` clean; lint clean for spec #2 files — Task 12 Steps 1, 2, 5 ✓

- [ ] **Step 7: Final commit (only if cleanup needed)**

If any lint or formatting issues surfaced during the verification steps and you fixed them inline above, commit:

```bash
git add <files>
git commit -m "chore: lint cleanup for spec #2"
```

Otherwise skip — the tree should already be clean.

---

## Manual smoke checklist (post-merge to main)

Not part of the automated suite, but documented for the operator:

1. Sign in as the production admin. Land on `/admin`. Confirm chrome + 4 KPI tiles render with real production values.
2. Click each sidebar item — all four sub-routes (Orders, Products, Customers, Settings) 404 (expected; specs #3-#6 fill them in). The sidebar's active state moves correctly.
3. User dropdown → "Back to store" → end at `/`. Storefront looks right; click back to `/admin`.
4. User dropdown → "Sign out" → end at `/`. Visiting `/admin` afterwards bounces to `/login?callbackUrl=%2Fadmin`.
5. Open `/admin` from a phone-sized viewport (or DevTools mobile emulator). Confirm hamburger present; drawer opens; nav items work; tapping a link closes the drawer.

If any of these fail, the spec is not complete and needs a follow-up commit before declaring done.

---

## Notes for future specs

- **Specs #3-#6 (Orders / Products / Customers / Settings)** each ship pages at `/admin/<entity>/...`. The chrome is automatic via this layout; sidebar active state already works for nested paths.
- **`KpiTile` is reusable** from `app/_components/admin/kpi-tile.tsx` for any sub-page that wants its own quick stats (e.g., Orders showing pending count, paid count).
- **`LOW_STOCK_THRESHOLD` constant** in `admin-kpis.ts` should be promoted to a stored config row in spec #6 (Settings).
- **Pre-existing e2e/lint debt** (10 e2e failures, 5 lint errors) is acknowledged in the spec §9 and not addressed here; a separate housekeeping task should triage before spec #6 lands.
