# Admin Customers Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin Customers page — directory (`/admin/customers`) + profile (`/admin/customers/[id]`) — with guarded role change and a password-reset-email action.

**Architecture:** Server Components fetch via `app/_lib/admin-customers.ts` (pure helper + queries); mutations are Server Actions (`app/admin/customers/actions.ts`) gated by `requireAdmin()`. The password-reset token logic is extracted into a shared `app/_lib/password-reset.ts` used by both the public forgot-password flow and the admin action. No schema change. Client-consumed tab constants live in a prisma-free `app/_lib/customer-tabs.ts`. Mirrors the shipped Orders/Products patterns.

**Tech Stack:** Next.js 16 App Router, NextAuth v5, Prisma + Postgres, vitest (node env, `.ts` only), Playwright e2e, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-02-admin-customers-page-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `app/_lib/password-reset.ts` | `issuePasswordReset(user)` — token create + email (shared) |
| `app/(auth)/actions.ts` | Refactor `requestResetAction` to call the helper |
| `app/_lib/customer-tabs.ts` | `CUSTOMER_TABS` + `CustomerTab` (prisma-free, client-safe) |
| `app/_lib/admin-customers.ts` | `buildCustomerWhere`, `listCustomers`, `getCustomer`, `countAdmins` |
| `app/admin/customers/actions.ts` | `changeRole`, `sendPasswordReset` |
| `app/admin/customers/page.tsx`, `loading.tsx` | Directory |
| `app/admin/customers/[id]/page.tsx`, `not-found.tsx` | Profile |
| `app/_components/admin/customers/*.tsx` | toolbar, table, role-control, password-reset-button |
| `app/_lib/__tests__/password-reset.test.ts`, `admin-customers.test.ts`, `admin-customers-queries.test.ts` | unit |
| `app/admin/customers/__tests__/actions.test.ts` | action unit tests |
| `tests/e2e/admin-customers.spec.ts` | e2e |

---

## Task 1: Extract `issuePasswordReset` shared helper

**Files:** Create `app/_lib/password-reset.ts`; Modify `app/(auth)/actions.ts`; Test `app/_lib/__tests__/password-reset.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/password-reset.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { tokenCreate } = vi.hoisted(() => ({ tokenCreate: vi.fn() }));
const { sendPasswordResetEmail } = vi.hoisted(() => ({ sendPasswordResetEmail: vi.fn() }));

vi.mock("@/app/_lib/prisma", () => ({ prisma: { passwordResetToken: { create: tokenCreate } } }));
vi.mock("@/app/_lib/mailer", () => ({ sendPasswordResetEmail }));

import { issuePasswordReset } from "../password-reset";
import { createHash } from "crypto";

beforeEach(() => {
  tokenCreate.mockReset().mockResolvedValue({});
  sendPasswordResetEmail.mockReset().mockResolvedValue(undefined);
  process.env.APP_URL = "https://shop.test";
});

describe("issuePasswordReset", () => {
  it("creates a 30-min sha256 token and emails a reset link", async () => {
    await issuePasswordReset({ id: "u1", email: "a@b.test" });

    const data = tokenCreate.mock.calls[0][0].data;
    expect(data.userId).toBe("u1");
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    const ttlMs = data.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(29 * 60_000);
    expect(ttlMs).toBeLessThanOrEqual(30 * 60_000);

    const [to, url] = sendPasswordResetEmail.mock.calls[0];
    expect(to).toBe("a@b.test");
    expect(url).toMatch(/^https:\/\/shop\.test\/reset-password\?token=[a-f0-9]{64}$/);
    // the emailed raw token hashes to the stored tokenHash
    const rawToken = url.split("token=")[1];
    expect(createHash("sha256").update(rawToken).digest("hex")).toBe(data.tokenHash);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/password-reset.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

Create `app/_lib/password-reset.ts`:

```ts
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/app/_lib/prisma";
import { sendPasswordResetEmail } from "@/app/_lib/mailer";

/**
 * Issues a password-reset token for the user and emails the reset link.
 * Shared by the public forgot-password flow and the admin Customers action.
 * May throw if the email send fails (callers decide how to handle).
 */
export async function issuePasswordReset(user: { id: string; email: string }): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const resetUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail(user.email, resetUrl);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/password-reset.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `requestResetAction` to use the helper**

In `app/(auth)/actions.ts`, replace the token block inside `requestResetAction`'s `if (user) { ... }` with a call to the helper (preserve the swallow-and-log behavior so the action stays enumeration-safe). Add `import { issuePasswordReset } from "@/app/_lib/password-reset";` at the top, and replace lines 139–152 (the `rawToken`…`sendPasswordResetEmail` block incl. its try/catch) with:

```ts
    try {
      await issuePasswordReset(user);
    } catch (e) {
      console.error("[forgot-password] reset issue failed:", e);
    }
```

Remove now-unused imports from `app/(auth)/actions.ts` **only if** `randomBytes`/`createHash`/`sendPasswordResetEmail` are no longer referenced anywhere else in that file (check first — `resetPasswordAction` also uses `createHash`; keep what's still used).

- [ ] **Step 6: Verify the auth flow still builds + tests pass**

Run: `npx tsc --noEmit && npx vitest run app/_lib/__tests__/password-reset.test.ts`
Expected: clean + PASS. If `app/(auth)/__tests__` exists, run it too and expect green.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/password-reset.ts app/_lib/__tests__/password-reset.test.ts "app/(auth)/actions.ts"
git commit -m "refactor(auth): extract issuePasswordReset shared helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `customer-tabs.ts` + `buildCustomerWhere` + `countAdmins`

**Files:** Create `app/_lib/customer-tabs.ts`, `app/_lib/admin-customers.ts`; Test `app/_lib/__tests__/admin-customers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/admin-customers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCustomerWhere } from "../admin-customers";
import { CUSTOMER_TABS } from "../customer-tabs";

describe("CUSTOMER_TABS", () => {
  it("is customers/admins/all", () => {
    expect(CUSTOMER_TABS).toEqual(["customers", "admins", "all"]);
  });
});

describe("buildCustomerWhere", () => {
  it("customers tab → role CUSTOMER", () => {
    expect(buildCustomerWhere({ role: "customers" })).toEqual({ role: "CUSTOMER" });
  });
  it("admins tab → role ADMIN", () => {
    expect(buildCustomerWhere({ role: "admins" })).toEqual({ role: "ADMIN" });
  });
  it("all tab → no role filter", () => {
    expect(buildCustomerWhere({ role: "all" })).toEqual({});
  });
  it("defaults (no tab) to customers", () => {
    expect(buildCustomerWhere({})).toEqual({ role: "CUSTOMER" });
  });
  it("adds case-insensitive search on name + email", () => {
    const w = buildCustomerWhere({ role: "all", q: "nimali" });
    expect(w.OR).toEqual([
      { name: { contains: "nimali", mode: "insensitive" } },
      { email: { contains: "nimali", mode: "insensitive" } },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-customers.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

Create `app/_lib/customer-tabs.ts` (prisma-free, client-safe):

```ts
export const CUSTOMER_TABS = ["customers", "admins", "all"] as const;
export type CustomerTab = (typeof CUSTOMER_TABS)[number];
```

Create `app/_lib/admin-customers.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import { CUSTOMER_TABS, type CustomerTab } from "@/app/_lib/customer-tabs";

export { CUSTOMER_TABS };
export type { CustomerTab };

export type CustomerListParams = { role?: CustomerTab; q?: string };

export function buildCustomerWhere(params: CustomerListParams): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};

  switch (params.role) {
    case "admins":
      where.role = "ADMIN";
      break;
    case "all":
      break;
    case "customers":
    default:
      where.role = "CUSTOMER";
  }

  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function countAdmins(): Promise<number> {
  return prisma.user.count({ where: { role: "ADMIN" } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/admin-customers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/customer-tabs.ts app/_lib/admin-customers.ts app/_lib/__tests__/admin-customers.test.ts
git commit -m "feat(admin-customers): customer-tabs + buildCustomerWhere + countAdmins

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `listCustomers` (directory query + order aggregates)

**Files:** Modify `app/_lib/admin-customers.ts`; Test `app/_lib/__tests__/admin-customers-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/admin-customers-queries.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { userFindMany, userCount, orderGroupBy } = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  userCount: vi.fn(),
  orderGroupBy: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { user: { findMany: userFindMany, count: userCount }, order: { groupBy: orderGroupBy } },
}));

import { listCustomers } from "../admin-customers";

beforeEach(() => {
  userFindMany.mockReset();
  userCount.mockReset();
  orderGroupBy.mockReset();
});

describe("listCustomers", () => {
  it("paginates, aggregates non-cancelled order count + spend, returns rows + total", async () => {
    userFindMany.mockResolvedValueOnce([
      { id: "u1", name: "Nimali", email: "n@x.test", role: "CUSTOMER", createdAt: new Date() },
      { id: "u2", name: "Ravi", email: "r@x.test", role: "CUSTOMER", createdAt: new Date() },
    ]);
    userCount.mockResolvedValueOnce(2);
    orderGroupBy.mockResolvedValueOnce([
      { userId: "u1", _count: { _all: 7 }, _sum: { total: 48300 } },
    ]);

    const res = await listCustomers({ role: "customers", page: 1, pageSize: 25 });

    // user query: select excludes passwordHash, paginates, ordered
    const uArg = userFindMany.mock.calls[0][0];
    expect(uArg.where).toEqual({ role: "CUSTOMER" });
    expect(uArg.take).toBe(25);
    expect(uArg.skip).toBe(0);
    expect(uArg.select.passwordHash).toBeUndefined();

    // aggregate query scoped to these users, excluding cancelled
    const gArg = orderGroupBy.mock.calls[0][0];
    expect(gArg.by).toEqual(["userId"]);
    expect(gArg.where).toEqual({ userId: { in: ["u1", "u2"] }, status: { not: "CANCELLED" } });

    expect(res.total).toBe(2);
    expect(res.rows[0]).toMatchObject({ id: "u1", orderCount: 7, totalSpent: 48300 });
    expect(res.rows[1]).toMatchObject({ id: "u2", orderCount: 0, totalSpent: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-customers-queries.test.ts`
Expected: FAIL — `listCustomers` not exported.

- [ ] **Step 3: Write the implementation** (append to `admin-customers.ts`)

```ts
export const PAGE_SIZE = 25;

export type CustomerRow = {
  id: string; name: string; email: string; role: string; createdAt: Date;
  orderCount: number; totalSpent: number;
};

export async function listCustomers(
  params: CustomerListParams & { page?: number; pageSize?: number },
): Promise<{ rows: CustomerRow[]; total: number }> {
  const where = buildCustomerWhere(params);
  const pageSize = Math.min(params.pageSize ?? PAGE_SIZE, 200);
  const page = Math.max(1, params.page ?? 1);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    prisma.user.count({ where }),
  ]);

  const ids = users.map((u) => u.id);
  const agg = ids.length
    ? await prisma.order.groupBy({
        by: ["userId"],
        where: { userId: { in: ids }, status: { not: "CANCELLED" } },
        _count: { _all: true },
        _sum: { total: true },
      })
    : [];
  const map = new Map(agg.map((a) => [a.userId, { count: a._count._all, sum: a._sum.total ?? 0 }]));

  const rows: CustomerRow[] = users.map((u) => {
    const m = map.get(u.id) ?? { count: 0, sum: 0 };
    return { ...u, orderCount: m.count, totalSpent: m.sum };
  });

  return { rows, total };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/admin-customers-queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-customers.ts app/_lib/__tests__/admin-customers-queries.test.ts
git commit -m "feat(admin-customers): listCustomers with order aggregates

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `getCustomer` (profile query)

**Files:** Modify `app/_lib/admin-customers.ts`; Test `app/_lib/__tests__/admin-customers-queries.test.ts`

- [ ] **Step 1: Write the failing test** (append; extend the prisma mock)

Replace the `vi.mock("@/app/_lib/prisma", ...)` block in `admin-customers-queries.test.ts` with one that also mocks `user.findUnique` and `order.aggregate`:

```ts
const { userFindMany, userCount, userFindUnique, orderGroupBy, orderAggregate } = vi.hoisted(() => ({
  userFindMany: vi.fn(), userCount: vi.fn(), userFindUnique: vi.fn(),
  orderGroupBy: vi.fn(), orderAggregate: vi.fn(),
}));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    user: { findMany: userFindMany, count: userCount, findUnique: userFindUnique },
    order: { groupBy: orderGroupBy, aggregate: orderAggregate },
  },
}));
```

Add to `beforeEach`: `userFindUnique.mockReset(); orderAggregate.mockReset();`

Then add:

```ts
import { getCustomer } from "../admin-customers";

describe("getCustomer", () => {
  it("returns null when the user does not exist", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    expect(await getCustomer("nope")).toBeNull();
  });

  it("returns user (no passwordHash) + addresses + recent orders + wishlist count + stats", async () => {
    userFindUnique.mockResolvedValueOnce({
      id: "u1", name: "Nimali", email: "n@x.test", role: "CUSTOMER", createdAt: new Date(),
      addresses: [{ id: "a1" }], orders: [{ id: "o1" }], _count: { wishlist: 3 },
    });
    orderAggregate.mockResolvedValueOnce({ _count: { _all: 7 }, _sum: { total: 48300 }, _max: { createdAt: new Date("2026-06-02") } });

    const res = await getCustomer("u1");

    const uArg = userFindUnique.mock.calls[0][0];
    expect(uArg.where).toEqual({ id: "u1" });
    expect(uArg.select.passwordHash).toBeUndefined();
    expect(uArg.select.orders.take).toBe(10);
    expect(uArg.select.orders.orderBy).toEqual({ createdAt: "desc" });
    expect(uArg.select._count.select.wishlist).toBe(true);

    const aArg = orderAggregate.mock.calls[0][0];
    expect(aArg.where).toEqual({ userId: "u1", status: { not: "CANCELLED" } });

    expect(res).toMatchObject({
      id: "u1", wishlistCount: 3,
      stats: { orderCount: 7, totalSpent: 48300 },
    });
    expect(res!.stats.lastOrderAt).toEqual(new Date("2026-06-02"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-customers-queries.test.ts`
Expected: FAIL — `getCustomer` not exported.

- [ ] **Step 3: Write the implementation** (append to `admin-customers.ts`)

```ts
export async function getCustomer(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true, createdAt: true,
      addresses: { orderBy: { isDefault: "desc" } },
      orders: {
        take: 10,
        orderBy: { createdAt: "desc" },
        select: { id: true, webNumber: true, total: true, status: true, paymentStatus: true, createdAt: true },
      },
      _count: { select: { wishlist: true } },
    },
  });
  if (!user) return null;

  const agg = await prisma.order.aggregate({
    where: { userId: id, status: { not: "CANCELLED" } },
    _count: { _all: true },
    _sum: { total: true },
    _max: { createdAt: true },
  });

  const { _count, ...rest } = user;
  return {
    ...rest,
    wishlistCount: _count.wishlist,
    stats: {
      orderCount: agg._count._all,
      totalSpent: agg._sum.total ?? 0,
      lastOrderAt: agg._max.createdAt ?? null,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/admin-customers-queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-customers.ts app/_lib/__tests__/admin-customers-queries.test.ts
git commit -m "feat(admin-customers): getCustomer profile query (orders/addresses/stats)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `changeRole` action (guarded)

**Files:** Create `app/admin/customers/actions.ts`; Test `app/admin/customers/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/admin/customers/__tests__/actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { userFindUnique, userUpdate, userCount } = vi.hoisted(() => ({
  userFindUnique: vi.fn(), userUpdate: vi.fn(), userCount: vi.fn(),
}));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: { user: { findUnique: userFindUnique, update: userUpdate, count: userCount } },
}));

import { changeRole } from "../actions";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { id: "admin1", email: "admin@x.test" } });
  userFindUnique.mockReset();
  userUpdate.mockReset();
  userCount.mockReset();
});

describe("changeRole", () => {
  it("rejects an invalid role", async () => {
    const res = await changeRole("u2", "WIZARD" as never);
    expect(res).toEqual({ success: false, error: "Invalid role" });
  });
  it("rejects changing your own role", async () => {
    const res = await changeRole("admin1", "CUSTOMER");
    expect(res).toEqual({ success: false, error: "You can't change your own role" });
    expect(userUpdate).not.toHaveBeenCalled();
  });
  it("rejects when the user is not found", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    const res = await changeRole("ghost", "ADMIN");
    expect(res).toEqual({ success: false, error: "User not found" });
  });
  it("rejects demoting the last admin", async () => {
    userFindUnique.mockResolvedValueOnce({ id: "u2", role: "ADMIN" });
    userCount.mockResolvedValueOnce(1); // only one admin
    const res = await changeRole("u2", "CUSTOMER");
    expect(res).toEqual({ success: false, error: "Can't demote the last admin" });
    expect(userUpdate).not.toHaveBeenCalled();
  });
  it("promotes a customer to admin", async () => {
    userFindUnique.mockResolvedValueOnce({ id: "u2", role: "CUSTOMER" });
    userUpdate.mockResolvedValueOnce({});
    const res = await changeRole("u2", "ADMIN");
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u2" }, data: { role: "ADMIN" } });
    expect(res).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/customers/__tests__/actions.test.ts`
Expected: FAIL — `actions.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `app/admin/customers/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { countAdmins } from "@/app/_lib/admin-customers";

export type ActionResult = { success: true } | { success: false; error: string };

const ROLES = ["ADMIN", "CUSTOMER"] as const;
type Role = (typeof ROLES)[number];

function revalidate(id: string) {
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
}

export async function changeRole(userId: string, role: Role): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!ROLES.includes(role)) return { success: false, error: "Invalid role" };
  if (userId === session.user.id) return { success: false, error: "You can't change your own role" };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, error: "User not found" };

  if (role === "CUSTOMER" && user.role === "ADMIN" && (await countAdmins()) <= 1) {
    return { success: false, error: "Can't demote the last admin" };
  }

  try {
    await prisma.user.update({ where: { id: userId }, data: { role } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate(userId);
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/customers/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/customers/actions.ts app/admin/customers/__tests__/actions.test.ts
git commit -m "feat(admin-customers): changeRole action (self + last-admin guards)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `sendPasswordReset` action

**Files:** Modify `app/admin/customers/actions.ts`; Test `app/admin/customers/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test** (append; extend mocks)

Add the mock for the shared helper near the top of the test file:

```ts
const { issuePasswordReset } = vi.hoisted(() => ({ issuePasswordReset: vi.fn() }));
vi.mock("@/app/_lib/password-reset", () => ({ issuePasswordReset }));
```

Add `issuePasswordReset.mockReset();` to `beforeEach`. Then:

```ts
import { sendPasswordReset } from "../actions";

describe("sendPasswordReset", () => {
  it("rejects when the user is not found", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    const res = await sendPasswordReset("ghost");
    expect(res).toEqual({ success: false, error: "User not found" });
    expect(issuePasswordReset).not.toHaveBeenCalled();
  });
  it("issues a reset for an existing user", async () => {
    userFindUnique.mockResolvedValueOnce({ id: "u2", email: "u2@x.test" });
    issuePasswordReset.mockResolvedValueOnce(undefined);
    const res = await sendPasswordReset("u2");
    expect(issuePasswordReset).toHaveBeenCalledWith({ id: "u2", email: "u2@x.test" });
    expect(res).toEqual({ success: true });
  });
  it("returns an error when the email send throws", async () => {
    userFindUnique.mockResolvedValueOnce({ id: "u2", email: "u2@x.test" });
    issuePasswordReset.mockRejectedValueOnce(new Error("smtp down"));
    const res = await sendPasswordReset("u2");
    expect(res).toEqual({ success: false, error: "Couldn't send the reset email." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/customers/__tests__/actions.test.ts`
Expected: FAIL — `sendPasswordReset` not exported.

- [ ] **Step 3: Write the implementation** (append to `actions.ts`)

```ts
import { issuePasswordReset } from "@/app/_lib/password-reset";

export async function sendPasswordReset(userId: string): Promise<ActionResult> {
  await requireAdmin();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) return { success: false, error: "User not found" };

  try {
    await issuePasswordReset(user);
  } catch {
    return { success: false, error: "Couldn't send the reset email." };
  }
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/customers/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/customers/actions.ts app/admin/customers/__tests__/actions.test.ts
git commit -m "feat(admin-customers): sendPasswordReset action

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Directory page + toolbar + table

**Files:** Create `app/admin/customers/page.tsx`, `loading.tsx`, `app/_components/admin/customers/{customers-toolbar,customers-table}.tsx`

- [ ] **Step 1: Toolbar (client)**

`app/_components/admin/customers/customers-toolbar.tsx`:

```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { CUSTOMER_TABS, type CustomerTab } from "@/app/_lib/customer-tabs";

const TAB_LABEL: Record<CustomerTab, string> = { customers: "Customers", admins: "Admins", all: "All" };
const SORTS = [["newest", "Newest"], ["name", "Name"], ["orders", "Orders"], ["spent", "Spent"]] as const;

export function CustomersToolbar({ counts }: { counts: Record<CustomerTab, number> }) {
  const router = useRouter();
  const sp = useSearchParams();
  const activeTab = (sp.get("role") as CustomerTab) || "customers";
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    router.push(`/admin/customers?${next.toString()}`);
  }
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          defaultValue={sp.get("q") ?? ""}
          placeholder="Search name or email…"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }}
        />
        <select className="rounded-md border px-2 py-2 text-sm" defaultValue={sp.get("sort") ?? "newest"}
          onChange={(e) => setParam("sort", e.target.value)}>
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {CUSTOMER_TABS.map((t) => (
          <button key={t} onClick={() => setParam("role", t === "customers" ? "" : t)}
            className={(activeTab === t ? "bg-primary text-primary-foreground " : "bg-secondary text-muted-foreground ") + "rounded-full px-3 py-1 text-xs font-medium"}>
            {TAB_LABEL[t]} <span className="opacity-70">{counts[t]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Table (server)**

`app/_components/admin/customers/customers-table.tsx`:

```tsx
import Link from "next/link";
import { formatPrice } from "@/app/_lib/format";
import { Badge } from "@/components/ui/badge";
import type { CustomerRow } from "@/app/_lib/admin-customers";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export function CustomersTable({ rows }: { rows: CustomerRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No customers match this view.</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
          <th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Role</th>
          <th className="p-2">Orders</th><th className="p-2">Total spent</th><th className="p-2">Joined</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className="border-b hover:bg-secondary/40">
            <td className="p-2 font-medium">
              <Link href={`/admin/customers/${c.id}`} className="flex items-center gap-2 hover:underline">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{initials(c.name)}</span>
                {c.name}
              </Link>
            </td>
            <td className="p-2 text-muted-foreground">{c.email}</td>
            <td className="p-2"><Badge variant={c.role === "ADMIN" ? "outline" : "secondary"}>{c.role === "ADMIN" ? "Admin" : "Customer"}</Badge></td>
            <td className="p-2">{c.orderCount}</td>
            <td className="p-2 font-medium">{c.totalSpent > 0 ? formatPrice(c.totalSpent) : "—"}</td>
            <td className="p-2">{c.createdAt.toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Page + loading (server)**

`app/admin/customers/page.tsx`:

```tsx
import { listCustomers, buildCustomerWhere, CUSTOMER_TABS, PAGE_SIZE, type CustomerTab, type CustomerRow } from "@/app/_lib/admin-customers";
import { prisma } from "@/app/_lib/prisma";
import { CustomersToolbar } from "@/app/_components/admin/customers/customers-toolbar";
import { CustomersTable } from "@/app/_components/admin/customers/customers-table";

export default async function AdminCustomersPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const role = (sp.role as CustomerTab) || "customers";
  const page = Number(sp.page ?? "1") || 1;

  const { rows, total } = await listCustomers({ role, q: sp.q, page });

  // sort the current page by aggregate when requested (cross-page sort is approximate)
  const sorted: CustomerRow[] = [...rows];
  if (sp.sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sp.sort === "orders") sorted.sort((a, b) => b.orderCount - a.orderCount);
  else if (sp.sort === "spent") sorted.sort((a, b) => b.totalSpent - a.totalSpent);

  const counts = Object.fromEntries(
    await Promise.all(CUSTOMER_TABS.map(async (t) => [t, await prisma.user.count({ where: buildCustomerWhere({ role: t }) })])),
  ) as Record<CustomerTab, number>;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefFor = (p: number) => {
    const next = new URLSearchParams(sp as Record<string, string>);
    next.set("page", String(p));
    return `/admin/customers?${next.toString()}`;
  };

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Customers</h1>
      <CustomersToolbar counts={counts} />
      <CustomersTable rows={sorted} />
      <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
        {page > 1 ? <a className="hover:underline" href={hrefFor(page - 1)}>‹ Prev</a> : <span className="opacity-40">‹ Prev</span>}
        <span>Page {page} of {pages} · {total} customers</span>
        {page < pages ? <a className="hover:underline" href={hrefFor(page + 1)}>Next ›</a> : <span className="opacity-40">Next ›</span>}
      </div>
    </section>
  );
}
```

`app/admin/customers/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div>;
}
```

- [ ] **Step 4: Verify build + commit**

Run: `npm run build` → `✓ Compiled successfully`. Manually: visit `/admin/customers`, confirm tabs/counts/search/sort/table/pagination render; clicking a row opens a profile (404 until Task 8 — that's fine for now, the route renders after Task 8).

```bash
git add app/admin/customers/page.tsx app/admin/customers/loading.tsx app/_components/admin/customers
git commit -m "feat(admin-customers): directory page with toolbar, tabs, table, pagination

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Profile page + role-control + password-reset components

**Files:** Create `app/admin/customers/[id]/page.tsx`, `[id]/not-found.tsx`, `app/_components/admin/customers/{role-control,password-reset-button}.tsx`

- [ ] **Step 1: Role control (client)**

`app/_components/admin/customers/role-control.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeRole } from "@/app/admin/customers/actions";

export function RoleControl({ userId, role, isSelf }: { userId: string; role: string; isSelf: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const target = role === "ADMIN" ? "CUSTOMER" : "ADMIN";
  const label = role === "ADMIN" ? "Demote to Customer" : "Promote to Admin";

  if (isSelf) return <span className="text-xs text-muted-foreground" title="You can't change your own role">Role: {role} (you)</span>;

  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`${label}?`)) return;
        start(async () => { const r = await changeRole(userId, target as "ADMIN" | "CUSTOMER"); alert(r.success ? "Role updated" : r.error); router.refresh(); });
      }}
      className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Password-reset button (client)**

`app/_components/admin/customers/password-reset-button.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { sendPasswordReset } from "@/app/admin/customers/actions";

export function PasswordResetButton({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Email this customer a password-reset link?")) return;
        start(async () => { const r = await sendPasswordReset(userId); alert(r.success ? "Reset email sent" : r.error); });
      }}
      className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
    >
      ✉ Send password reset
    </button>
  );
}
```

- [ ] **Step 3: not-found + profile page (server)**

`app/admin/customers/[id]/not-found.tsx`:

```tsx
export default function NotFound() {
  return <div className="rounded-lg border p-8 text-center"><h2 className="text-lg font-semibold">Customer not found</h2></div>;
}
```

`app/admin/customers/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/app/_lib/auth";
import { getCustomer } from "@/app/_lib/admin-customers";
import { formatPrice } from "@/app/_lib/format";
import { Badge } from "@/components/ui/badge";
import { paymentStatusLabel } from "@/app/_lib/order-status";
import { RoleControl } from "@/app/_components/admin/customers/role-control";
import { PasswordResetButton } from "@/app/_components/admin/customers/password-reset-button";

export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [customer, session] = await Promise.all([getCustomer(id), auth()]);
  if (!customer) notFound();
  const isSelf = session?.user?.id === customer.id;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/admin/customers" className="text-sm text-muted-foreground">‹ Customers</Link>
        <h1 className="text-xl font-bold">{customer.name}</h1>
        <Badge variant={customer.role === "ADMIN" ? "outline" : "secondary"}>{customer.role === "ADMIN" ? "Admin" : "Customer"}</Badge>
        <span className="text-muted-foreground">{customer.email}</span>
        <span className="ml-auto flex gap-2">
          <RoleControl userId={customer.id} role={customer.role} isSelf={isSelf} />
          <PasswordResetButton userId={customer.id} />
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <div className="rounded-lg border p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Stats</h4>
            <div className="flex flex-wrap gap-6 text-sm">
              <div><div className="text-xl font-bold">{customer.stats.orderCount}</div>Orders</div>
              <div><div className="text-xl font-bold">{formatPrice(customer.stats.totalSpent)}</div>Total spent</div>
              <div><div className="text-xl font-bold">{customer.stats.lastOrderAt ? customer.stats.lastOrderAt.toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" }) : "—"}</div>Last order</div>
              <div><div className="text-xl font-bold">{customer.wishlistCount}</div>Wishlist</div>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">Orders</h4>
              <Link href={`/admin/orders?q=${encodeURIComponent(customer.email)}`} className="text-xs text-primary">View all in Orders ↗</Link>
            </div>
            {customer.orders.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p> : (
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {customer.orders.map((o) => (
                    <tr key={o.id} className="border-b">
                      <td className="p-1.5"><Link href={`/admin/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.webNumber ?? o.id}</Link></td>
                      <td className="p-1.5">{o.createdAt.toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" })}</td>
                      <td className="p-1.5">{formatPrice(o.total)}</td>
                      <td className="p-1.5">{o.status}</td>
                      <td className="p-1.5 text-muted-foreground">{paymentStatusLabel(o.paymentStatus) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-lg border p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Addresses</h4>
            {customer.addresses.length === 0 ? <p className="text-sm text-muted-foreground">No saved addresses.</p> :
              customer.addresses.map((a) => (
                <div key={a.id} className="mb-2 rounded border p-2 text-sm">
                  <span className="font-medium">{a.label}</span>{a.isDefault && <span className="ml-2 text-xs text-primary">default</span>}
                  <br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city} · {a.country}
                </div>
              ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Account</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{customer.email}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Role</span><span>{customer.role}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Joined</span><span>{customer.createdAt.toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" })}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">ID</span><span className="text-muted-foreground">{customer.id}</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Verify build + manual smoke + commit**

Run: `npm run build` → `✓ Compiled successfully`. Manually: open a customer profile (stats, orders link into Orders admin, addresses); promote/demote a test user (confirm dialog + self-guard shows "(you)" on your own profile); send a reset email.

```bash
git add app/admin/customers/[id] app/_components/admin/customers/role-control.tsx app/_components/admin/customers/password-reset-button.tsx
git commit -m "feat(admin-customers): profile page + role control + password reset

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: E2E tests

**Files:** Create `tests/e2e/admin-customers.spec.ts`

- [ ] **Step 1: Write the e2e spec**

Use the real fixtures (`tests/e2e/fixtures/users.ts`: `ADMIN`, `seedTestUsers`, `deleteTestUsers`) and the inline `/about`-callback login from `tests/e2e/admin-shell.spec.ts`. The seeded `ADMIN` is a real admin user, so it appears in the directory. Create `tests/e2e/admin-customers.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { ADMIN, seedTestUsers, deleteTestUsers } from "./fixtures/users";

test.beforeAll(seedTestUsers);
test.afterAll(deleteTestUsers);

async function login(page) {
  await page.goto("/login?callbackUrl=/about");
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await Promise.all([page.waitForURL("/about"), page.click('button[type="submit"]')]);
}

test("directory renders with role tabs + search, URL-driven", async ({ page }) => {
  await login(page);
  await page.goto("/admin/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  for (const t of ["Customers", "Admins", "All"]) {
    await expect(page.getByRole("button", { name: new RegExp(t) })).toBeVisible();
  }
  await page.getByRole("button", { name: /Admins/ }).click();
  await expect(page).toHaveURL(/role=admins/);
  // the seeded admin shows under the Admins tab
  await expect(page.getByText(ADMIN.email)).toBeVisible();
});

test("opening own profile shows the self-guard and unknown id 404s", async ({ page }) => {
  await login(page);
  await page.goto("/admin/customers?role=admins");
  await page.getByText(ADMIN.email).click();
  await expect(page).toHaveURL(/\/admin\/customers\/.+/);
  await expect(page.getByText(/\(you\)/)).toBeVisible(); // self-guard on own role

  await page.goto("/admin/customers/does-not-exist-xyz");
  await expect(page.getByText("Customer not found")).toBeVisible();
});
```

- [ ] **Step 2: Run e2e**

Run: `npx playwright test tests/e2e/admin-customers.spec.ts`
Expected: PASS. (If browsers missing: `npx playwright install chromium` once. If the environment can't run the server, commit for CI and note it.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/admin-customers.spec.ts
git commit -m "test(admin-customers): e2e for directory, role tab, profile self-guard, not-found

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Full verification

- [ ] **Step 1: Unit suite** — `npx vitest run` → all green.
- [ ] **Step 2: Types + lint + build** — `npx tsc --noEmit` clean; `npx eslint app/admin/customers app/_components/admin/customers app/_lib/admin-customers.ts app/_lib/customer-tabs.ts app/_lib/password-reset.ts "app/(auth)/actions.ts"` clean; `npm run build` compiles.
- [ ] **Step 3: Client-safety check** — `grep -rl "use client" app/_components/admin/customers app/admin/customers | xargs grep -n "admin-customers\|_lib/prisma"` returns nothing (clients only import `customer-tabs`, `format`, and the actions).
- [ ] **Step 4: Acceptance smoke** — walk spec §9 (1–9) as the seeded admin: directory search/tabs/sort/pagination; profile; promote/demote with self + last-admin guards; password reset email; confirm guests don't appear.
- [ ] **Step 5: Final commit (if cleanup)**

```bash
git add -A && git commit -m "chore(admin-customers): final verification pass

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes (plan vs. spec)

- **Spec coverage:** password-reset helper + refactor (T1, AC#5); tabs/where/countAdmins (T2); listCustomers aggregates (T3, AC#1/#2); getCustomer profile (T4, AC#3); changeRole guards (T5, AC#4); sendPasswordReset (T6, AC#5); directory UI (T7); profile UI + actions (T8); e2e (T9); verification incl. passwordHash-never-exposed + client-safety + guests-excluded (T10, AC#6/#7/#8). All §9 criteria mapped.
- **Type consistency:** `ActionResult`, `CustomerTab`/`CUSTOMER_TABS`, `CustomerListParams`, `CustomerRow`, `buildCustomerWhere`, `listCustomers`/`getCustomer`/`countAdmins`, `changeRole`/`sendPasswordReset`, `issuePasswordReset` defined once and reused with matching signatures.
- **Client-safety (learned from spec #4):** `CUSTOMER_TABS`/`CustomerTab` live in prisma-free `customer-tabs.ts`; the client toolbar imports only from there. `admin-customers.ts` (prisma) is imported only by server components. Verified in T10 Step 3.
- **Reuse:** `requireAdmin`, `revalidatePath`, `formatPrice`, `paymentStatusLabel`, `Badge`/`Skeleton`, the order-aggregate (`groupBy`) pattern, the `/about`-callback e2e login, the `vi.hoisted`+`vi.mock` test pattern. `passwordHash` excluded from every `select`.
- **Deferred (spec §2):** guest unification, account deletion, PII editing, cross-page aggregate sort, notes/tags/export.
```
