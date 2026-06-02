# Admin Customers Page — Design

**Date:** 2026-06-02
**Spec #:** 5 of 9 (Dressing Bear admin dashboard)
**Status:** Draft — pending implementation plan
**Depends on:** Spec #1 (roles & route protection), #2 (UI shell), #3 (Orders), #4 (Products) — all shipped.

---

## 1. Goal

Build the **Customers** admin page at `/admin/customers` (directory) and `/admin/customers/[id]` (profile) — a lookup surface for registered users with two light management actions. An admin can search/filter the user directory, open a customer profile (orders, addresses, wishlist, lifetime stats), change a user's role (CUSTOMER ↔ ADMIN, guarded), and trigger the standard password-reset email.

## 2. Non-goals

- **Guest "customers."** Guests (orders with `guestEmail`, null `userId`) are **not** listed here — they're already visible on the Orders page. Only `User` rows appear.
- **Account deletion / deactivation.** Out of scope (no destructive account actions in v1).
- **Editing customer PII** (name/email/address) from the admin. Read-only profile; customers manage their own details. (Role is the only mutable field.)
- **Admin sets a new password directly.** The reset action emails the customer the standard reset link; the admin never sees or sets passwords.
- **New roles** (STAFF/MANAGER) — only CUSTOMER/ADMIN exist (per spec #1).
- **Customer messaging / notes / segments / export** — deferred.
- Orders / Products / Settings pages — specs #3–#4 (done) / #6.

## 3. Constraints from the existing codebase

- **Next.js 16 App Router.** Pages render inside `app/admin/layout.tsx` (chrome + `requireAdmin()`). Server Components for pages/data; interactive bits are leaf `"use client"`. No `async` Server Component inside a client component (CLAUDE.md §3).
- **Auth:** every Server Action calls `requireAdmin()`. The session carries `role` and `user.id` (NextAuth v5, spec #1) — used for the self-guard.
- **Prisma + Postgres, `connection_limit=2`.** Directory = one `findMany` + one `count` + one `groupBy` for order aggregates (mirrors the `attachAggregates` pattern in `app/_lib/products.ts`). Keep it light; paginate.
- **Data model (`prisma/schema.prisma`) — NO schema change needed:**
  - `User`: `id` (cuid), `name`, `email` (unique), `passwordHash` (never exposed), `role String @default("CUSTOMER")`, `createdAt`. Relations: `orders Order[]`, `addresses Address[]`, `wishlist WishlistItem[]`, `resetTokens PasswordResetToken[]`.
  - `Order`: `userId String?` (`onDelete: SetNull`), `total`, `status`, `paymentStatus`, `webNumber`, `createdAt`.
  - `Address`: `{ label, line1, line2?, city, country, isDefault }`.
  - `PasswordResetToken`: `{ userId, tokenHash, expiresAt }`.
- **Existing password-reset flow** lives inline in `app/(auth)/actions.ts` (`requestPasswordReset`): `randomBytes(32)` → sha256 `tokenHash` → create `PasswordResetToken` (30-min expiry) → `resetUrl = ${APP_URL}/reset-password?token=${rawToken}` → `sendPasswordResetEmail(email, resetUrl)`. This logic will be **extracted into a shared helper** (§4.2) and reused by the admin action — no duplication.
- **shadcn primitives** (`badge`, `table`, `select`, `dialog`) already installed (specs #3/#4). Reuse.
- **Patterns to mirror:** `app/_lib/admin-orders.ts` / `admin-products.ts` (pure helpers + queries split), `app/admin/*/actions.ts` (action shape `{success:true}|{success:false,error}`, `requireAdmin` first, `revalidatePath`), the Orders/Products list+detail UI, and the `attachAggregates` order-aggregation pattern.

## 4. Design

### 4.1 Routes & file map

| File | Type | Responsibility |
|------|------|----------------|
| `app/admin/customers/page.tsx` | Server | Read `searchParams` (`q,role,sort,page`), call `listCustomers` + role counts, render toolbar + table |
| `app/admin/customers/loading.tsx` | Server | Skeleton |
| `app/admin/customers/[id]/page.tsx` | Server | `getCustomer(id)` (404 if missing), render profile |
| `app/admin/customers/[id]/not-found.tsx` | Server | "Customer not found" |
| `app/admin/customers/actions.ts` | `"use server"` | `changeRole`, `sendPasswordReset` |
| `app/_lib/admin-customers.ts` | server module | `buildCustomerWhere`, `listCustomers`, `getCustomer`, `countAdmins`, types |
| `app/_lib/password-reset.ts` | server module | `issuePasswordReset(user)` — extracted shared token+email helper |
| `app/_components/admin/customers/customers-toolbar.tsx` | `"use client"` | search + role tabs + sort (URL-driven) |
| `app/_components/admin/customers/customers-table.tsx` | Server | directory rows |
| `app/_components/admin/customers/role-control.tsx` | `"use client"` | role promote/demote with confirm dialog |
| `app/_components/admin/customers/password-reset-button.tsx` | `"use client"` | trigger `sendPasswordReset` + toast |
| `app/_lib/__tests__/admin-customers.test.ts` | unit | `buildCustomerWhere` + query shapes (mock prisma) |
| `app/_lib/__tests__/password-reset.test.ts` | unit | `issuePasswordReset` (token created + email called) |
| `app/admin/customers/__tests__/actions.test.ts` | unit | action guards (self / last-admin), role change, reset |
| `tests/e2e/admin-customers.spec.ts` | e2e | directory, role tabs, profile, not-found |

### 4.2 Shared password-reset helper (refactor)

Extract the token-issue logic from `app/(auth)/actions.ts` into `app/_lib/password-reset.ts`:

```ts
export async function issuePasswordReset(user: { id: string; email: string }): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
  const resetUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail(user.email, resetUrl);
}
```

`requestPasswordReset` in `app/(auth)/actions.ts` is refactored to call this (preserving its existing enumeration-safe behavior — it still only issues when the user exists and otherwise returns the same generic response). The admin `sendPasswordReset` action also calls it. One source of truth for token format/expiry/URL.

> `Date.now()` is used here exactly as the existing code does — fine in app runtime (not a workflow script).

### 4.3 Directory page (`/admin/customers`)

- **Toolbar:** search (`q` — matches `name`, `email`), Sort select (`sort`: newest / name / orders / spent).
- **Role tabs** with counts: **Customers** (`role=CUSTOMER`, default), **Admins** (`role=ADMIN`), **All**.
- **Columns:** avatar (initials) + Name · Email · Role badge · Orders (lifetime count) · Total spent (Σ order totals excluding `status=CANCELLED`) · Joined (`createdAt`).
- Row click → `/admin/customers/[id]`. Server-side pagination, 25/page.
- **Aggregates:** after the page of users is fetched, one `prisma.order.groupBy({ by: ["userId"], where: { userId: { in: ids }, status: { not: "CANCELLED" } }, _count, _sum: { total } })` maps counts + spend onto rows (the `attachAggregates` pattern). `sort` by orders/spent sorts the mapped rows in-memory for the current page (documented limitation: cross-page ordering by aggregate is approximate — acceptable for a low-volume admin; revisit if needed).

### 4.4 Profile page (`/admin/customers/[id]`)

Two-column (stacks on mobile):

- **Header:** back link, avatar, name, role badge, email; right side **Change role** (`role-control`) and **Send password reset** (`password-reset-button`).
- **Main:** **Stats** (orders count, total spent, last-order date, wishlist count); **Orders** (recent 10, each row links to `/admin/orders/[orderId]`, plus "View all in Orders ↗" → `/admin/orders?q=<email or name>`); **Addresses** (saved, default flagged).
- **Side:** **Account** (email, role, joined, customer id); **Actions** (role control + password reset with the guard hint).

`getCustomer(id)` returns the user + recent orders + addresses + wishlist count + aggregate stats (count, sum, last order date over non-cancelled orders).

### 4.5 Server actions (`actions.ts`)

Each: `requireAdmin()` → validate → mutate → `revalidatePath` → `{success}|{error}`.

| Action | Behavior | Guards |
|--------|----------|--------|
| `changeRole(userId, role)` | Set `user.role` to `"ADMIN"` or `"CUSTOMER"`. `revalidatePath('/admin/customers')` + `/admin/customers/[id]`. | Reject invalid role. **Reject changing your own role** (`userId === session.user.id` → "You can't change your own role"). **Reject demoting the last admin** (`role==="CUSTOMER"` && target is ADMIN && `countAdmins() <= 1` → "Can't demote the last admin"). Reject if user not found. |
| `sendPasswordReset(userId)` | Look up user; call `issuePasswordReset(user)`. Returns success. | User must exist + have an email. Wrap in try/catch → generic error result; never expose token. |

`countAdmins()` (in `admin-customers.ts`): `prisma.user.count({ where: { role: "ADMIN" } })`.

> Session-revocation caveat (carried from spec #1 §9): a demoted admin keeps admin access until their JWT (30-day TTL) expires. Documented, not solved here.

### 4.6 Pure helper + queries (`admin-customers.ts`)

- `buildCustomerWhere({ role, q }): Prisma.UserWhereInput` — role tab → `{role:"CUSTOMER"|"ADMIN"}` or `{}` (all); `q` → `OR` on `name`/`email` (insensitive). Unit-testable.
- `listCustomers(params & {page,pageSize})` → `{ rows, total }` where each row has the user fields + `{ orderCount, totalSpent }` from the groupBy map.
- `getCustomer(id)` → user + recent orders + addresses + `_count.wishlist` + stats; null if missing.
- `countAdmins()`.
- `CUSTOMER_TABS = ["customers","admins","all"] as const` + `CustomerTab` type. The tab value is carried in the `role` search param; `buildCustomerWhere` maps `"customers"→{role:"CUSTOMER"}`, `"admins"→{role:"ADMIN"}`, `"all"→{}`.

### 4.7 Data flow

```
List:   /admin/customers?role=customers&sort=spent
        → page.tsx → listCustomers(parsed) (findMany + count + order groupBy) + role counts
        → table ; row → /admin/customers/[id]
Profile:/admin/customers/[id] → getCustomer → render
        → role-control → changeRole ; password-reset-button → sendPasswordReset
        → revalidatePath → fresh render / toast
```

### 4.8 Error handling

- Discriminated `ActionResult`; client surfaces success/error (toast or inline), mirroring Orders/Products.
- `changeRole` guard violations return clear messages (self / last-admin / invalid / not-found).
- `sendPasswordReset` wraps token+email in try/catch → "Couldn't send reset email."
- `getCustomer` missing → `not-found`.
- `passwordHash` is never selected into any view/query result returned to the client.

### 4.9 Testing

**Unit (`.ts`, mock prisma):**
- `buildCustomerWhere` (each role tab + search).
- `listCustomers` query shape (findMany take/skip/orderBy, groupBy where `status != CANCELLED`, aggregate mapping onto rows).
- `getCustomer` include shape (orders recent/ordered, addresses, wishlist count); null path.
- `issuePasswordReset` — creates a token (sha256 hash, 30-min expiry) and calls `sendPasswordResetEmail` with a `/reset-password?token=` URL.
- Actions: `requireAdmin` rejection; `changeRole` happy path; **self-guard** (changing own id rejected); **last-admin guard** (`countAdmins()===1` blocks demotion); invalid role rejected; `sendPasswordReset` calls `issuePasswordReset`.

**E2E (`tests/e2e/admin-customers.spec.ts`, seeded admin):**
1. Directory renders; role tabs (Customers/Admins/All) + search are URL-driven.
2. Row → `/admin/customers/[id]`; profile shows account + (conditionally) orders/addresses.
3. Unknown id → not-found.
4. (If the seeded admin opens their own profile) the role control is disabled/guarded for self.

## 5. Rollout plan

1. No DB migration (no schema change).
2. Extract `issuePasswordReset` (§4.2); refactor `app/(auth)/actions.ts` to use it; confirm existing auth tests still pass.
3. Implement `admin-customers.ts`, actions, pages, components on `feat/admin-customers` off `main`.
4. Smoke as seeded admin: directory search/filter; open a profile; promote/demote a test user (verify self + last-admin guards); send a reset email (verify it arrives / token row created).
5. Deploy: no env-var changes.

## 6. Open / deferred decisions

- **Account deletion / GDPR erase** — out; revisit if needed.
- **Editing customer PII** — out (read-only).
- **Aggregate sort across pages** — current sort orders the fetched page by mapped aggregates; full cross-page aggregate sort would need a DB-side join/raw query. Deferred; acceptable at current scale.
- **Customer notes / tags / segments / CSV export** — deferred.
- **Guest unification** — guests stay on Orders.

## 7. Risks & mitigations

- **Connection pool (limit 2):** directory = findMany + count + 1 groupBy (+ up to 3 role counts). Acceptable; compute role counts in one `groupBy by role` if it strains.
- **Last-admin lockout:** the `countAdmins()` guard + self-guard prevent removing the last admin or self-demotion. Unit-tested.
- **PII exposure:** admin sees customer email/addresses/order history — expected for an admin tool, gated by `requireAdmin()` + the proxy. `passwordHash` is never selected.
- **Password-reset abuse:** the admin action issues the same time-limited token as the public flow; only admins can trigger it. No new exposure.
- **JWT TTL 30-day** (spec #1 §9): demoted admin retains access until token expiry. Documented caveat.
- **Refactor risk:** extracting `issuePasswordReset` touches the public auth flow — keep `requestPasswordReset`'s enumeration-safe response unchanged; verify with existing auth tests.

## 8. Caveats (carried forward)

- Pre-existing e2e/lint debt (spec #2 §9); this spec's own files must pass clean.

## 9. Acceptance criteria

1. `/admin/customers` lists registered users with search (name/email), role tabs (Customers/Admins/All) with counts, sort, and server-side pagination — all URL-driven.
2. Each row shows name, email, role badge, lifetime order count, total spent (excluding cancelled), and joined date.
3. `/admin/customers/[id]` shows account info, stats, recent orders (linking to the Orders admin), addresses, and wishlist count; missing id → not-found.
4. `changeRole` promotes/demotes CUSTOMER↔ADMIN, and **rejects** changing your own role and demoting the last admin (with clear messages); invalid role rejected.
5. `sendPasswordReset` issues a standard reset token (sha256, 30-min) and emails the customer the reset link, via the shared `issuePasswordReset` helper also used by the public forgot-password flow.
6. Guests (orders without a `userId`) do not appear in the directory.
7. `passwordHash` is never returned to the client in any query/view.
8. Every Server Action enforces `requireAdmin()`; spec #1 redirect/401/403 invariants hold.
9. All unit + e2e tests pass; `npm run build`, `tsc --noEmit`, `npm run lint` clean for this spec's files.
