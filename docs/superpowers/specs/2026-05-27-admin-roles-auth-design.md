# Admin Roles & Route Protection — Design

**Date:** 2026-05-27
**Spec #:** 1 of 9 (Dressing Bear admin dashboard)
**Status:** Draft — pending implementation plan

---

## 1. Goal

Add a role-based authorization layer to the existing NextAuth setup so that:

- Users have one of two roles: `ADMIN` or `CUSTOMER`.
- `/admin/*` routes and admin API routes are accessible only to admins.
- Customers are redirected away from admin routes; unauthenticated visitors are sent to `/login`.
- The first admin can be created (or promoted from an existing customer) via a CLI script.

This spec is foundational: every subsequent admin-dashboard spec (#2 through #9) depends on the auth gates landed here.

## 2. Non-goals

- Admin UI (sidebar, dashboard, screens) — spec #2.
- Admin-specific API routes (orders, products, etc.) — spec #3 onward.
- Multi-role / fine-grained permissions (STAFF, MANAGER, etc.) — explicitly out; reconsider only when a real second role appears.
- Admin-specific forgot-password flow — admins reuse the existing customer flow.
- Audit log of admin actions — defer to a later cross-cutting spec.
- Session-revocation-on-role-change — see §9 caveat.

## 3. Constraints from the existing codebase

- **NextAuth v5** (`next-auth: ^5.0.0-beta.31`), JWT session strategy (`session.strategy = "jwt"`), 30-day `maxAge`.
- **Credentials provider** with `bcryptjs` password hashing.
- Protection currently lives in `app/_lib/auth.config.ts` `callbacks.authorized` — a static path list (`/account`, `/wishlist`). There is no `middleware.ts` yet.
- **Prisma + PostgreSQL** (production) / SQLite (local). String-typed status fields elsewhere in the schema (`Order.status`, `Order.paymentStatus`) — same convention here.
- `auth-types.d.ts` augments NextAuth's `Session` type — must extend it for `role`.
- `app/(auth)/login/page.tsx` + `app/(auth)/actions.ts` is the existing customer login page; admins log in there too.

## 4. Design

### 4.1 Schema change

Add a single column to `User`:

```prisma
model User {
  ...
  role          String    @default("CUSTOMER") @db.VarChar(16)
  ...
}
```

- **Type:** `String` (not Prisma enum) to match the repo convention and keep migrations portable.
- **Default:** `"CUSTOMER"` — every existing row gets this on migration.
- **Validation:** centralized Zod schema (`RoleSchema = z.enum(["ADMIN", "CUSTOMER"])`) used by the seed script and any future admin tooling.

Migration: `npx prisma migrate dev --name add_user_role`. Generates an `ALTER TABLE` SQL file under `prisma/migrations/` for code review and deterministic production rollout.

### 4.2 Auth callbacks

`app/_lib/auth.ts` — `authorize()` already loads the user row; extend the returned object to include `role`:

```ts
return { id: user.id, name: user.name, email: user.email, role: user.role };
```

`app/_lib/auth.config.ts` — extend `jwt` and `session` callbacks:

```ts
jwt({ token, user }) {
  if (user && "id" in user) {
    token.uid = user.id as string;
    token.role = (user as { role?: string }).role ?? "CUSTOMER";
  }
  return token;
}
session({ session, token }) {
  if (token.uid && session.user) {
    session.user.id = token.uid;
    session.user.role = (token.role as "ADMIN" | "CUSTOMER" | undefined) ?? "CUSTOMER";
  }
  return session;
}
```

`app/_lib/auth-types.d.ts` — augment the Session and JWT types so `session.user.role` and `token.role` are typed.

**Token-state compatibility**: Users with JWTs minted before this change will have no `role` claim. The `?? "CUSTOMER"` fallback in `session` is the safety net — they're treated as customer. Admins simply log in again post-deploy to mint a fresh token with `role: "ADMIN"`.

### 4.3 Route protection — defense in depth

#### Layer 1: Middleware

New file at project root: `middleware.ts`.

**Important constraint:** The middleware runs on the Edge runtime. `bcryptjs` (used by the Credentials provider in `auth.ts`) is not Edge-safe. Therefore middleware must import only from `auth.config.ts` — which already has `providers: []` and no bcrypt dependency — and not from `auth.ts`. This file split is the canonical NextAuth v5 pattern and is already in place in this repo.

```ts
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/app/_lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const isAuthed = !!req.auth;
  const isAdmin = req.auth?.user?.role === "ADMIN";

  // /admin requires an authenticated admin
  if (path.startsWith("/admin")) {
    if (!isAuthed) {
      return NextResponse.redirect(new URL(`/login?callbackUrl=${path}`, req.url));
    }
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // /account, /wishlist require any authenticated user (preserves current behaviour)
  const requiresAuth = path.startsWith("/account") || path.startsWith("/wishlist");
  if (requiresAuth && !isAuthed) {
    return NextResponse.redirect(new URL(`/login?callbackUrl=${path}`, req.url));
  }
});

export const config = {
  matcher: ["/account/:path*", "/admin/:path*", "/wishlist/:path*"],
};
```

The existing `authorized` callback in `auth.config.ts` is removed (its behaviour is now in the middleware). Without `authorized`, NextAuth defaults to "any session is authorized" — the middleware is the sole gate.

#### Layer 2: Server-side helper

`app/_lib/admin-auth.ts` (new file):

```ts
import { auth } from "@/app/_lib/auth";
import { redirect } from "next/navigation";

/**
 * Server-side guard. Call at the top of any /admin page, server action,
 * or admin API route. Redirects unauthenticated users to login and
 * non-admin authenticated users to home.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/admin`);
  if (session.user.role !== "ADMIN") redirect("/");
  return session;
}

/**
 * For API routes: returns the admin session or throws a 403 Response.
 * Caller catches and returns the response.
 */
export async function requireAdminApi(): Promise<{ session: Awaited<ReturnType<typeof auth>> } | Response> {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if (session.user.role !== "ADMIN") return new Response("Forbidden", { status: 403 });
  return { session };
}
```

Every `/admin` page/action/API route must call one of these. Both are intentionally duplicative of the middleware: if the matcher ever drops a path, the helper still blocks the request.

### 4.4 Login redirect

`loginAction` in `app/(auth)/actions.ts` currently:

1. Calls `signIn("credentials", { ..., redirect: false })`.
2. Returns `{ redirectTo: safeCallbackUrl(formData.get("callbackUrl")) }` for the client form component to navigate.

Updated logic: after `signIn` succeeds, call `auth()` to read the new session, then choose the redirect target by role.

```ts
await signIn("credentials", { email, password, redirect: false });

const rawCallback = safeCallbackUrl(formData.get("callbackUrl") as string | null);
const session = await auth();
const isAdmin = session?.user?.role === "ADMIN";

// Customers: existing behaviour (honour callbackUrl, default "/").
// Admins: honour an /admin callbackUrl explicitly; otherwise default to "/admin"
// rather than "/", so a bare /login press lands them on the dashboard.
let redirectTo = rawCallback;
if (isAdmin && (rawCallback === "/" || rawCallback === "")) {
  redirectTo = "/admin";
}

return { redirectTo };
```

Admins who land on `/login?callbackUrl=/checkout` still go to `/checkout`, not `/admin` — only an absent/`/` callbackUrl defaults to `/admin`. This preserves "admin can also act as a customer."

`signupAction` is left unchanged — new signups always start as customers (the seed script is the only path to admin).

### 4.5 First-admin seed script

`scripts/create-admin.ts`:

- CLI: `npm run admin:create -- --email founder@dressingbear.com --password 'StrongPass!1' --name 'Founder' [--promote]`
- Parses args with `node:util` `parseArgs`.
- Validates email via existing Zod `EmailSchema`, password via existing strong-password rules (in `app/_lib/validation.ts`).
- Looks up user by email:
  - **Not found:** create with `role: "ADMIN"`, hashed password (bcrypt cost 10 — matches existing signup flow).
  - **Found, role = ADMIN:** exit non-zero with `"User already exists as admin"`.
  - **Found, role = CUSTOMER, `--promote` flag set:** flip role to `"ADMIN"`. Do NOT update password (avoid surprising the customer if a typo). Log the promotion.
  - **Found, role = CUSTOMER, no `--promote`:** exit non-zero with `"User exists as customer. Pass --promote to flip their role to admin (password unchanged)."`
- Logs do NOT print the password.

Core logic factored into `createAdminUser({ email, password, name, promote })` in `app/_lib/admin-seed.ts` so it's unit-testable. The script file is the thin CLI wrapper.

`package.json` adds:
```json
"admin:create": "tsx scripts/create-admin.ts"
```

### 4.6 Tests

Vitest unit tests:

- `app/_lib/__tests__/role-schema.test.ts` — `RoleSchema` accepts ADMIN/CUSTOMER, rejects empty string, lowercase, unknown values.
- `app/_lib/__tests__/admin-seed.test.ts`:
  - Creates new admin when email doesn't exist.
  - Refuses to overwrite existing admin.
  - Refuses to promote without `--promote` flag.
  - Promotes existing customer when flag set.
  - Hashed password is bcrypt-verifiable (existing pattern check).
- `app/_lib/__tests__/admin-auth.test.ts`:
  - `requireAdmin()` redirects to /login when no session.
  - `requireAdmin()` redirects to / when session role !== ADMIN.
  - `requireAdmin()` returns session when role === ADMIN.
  - `requireAdminApi()` returns 401 / 403 / session per the same matrix.

Build/typecheck/lint must pass:
```
npm run build && npx tsc --noEmit && npm run lint && npm test
```

Playwright e2e tests are **deferred to spec #2** (needs the dashboard to exist to test against). Spec #1 ships with unit tests only.

## 5. File-level change summary

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | edit | Add `role String @default("CUSTOMER")` to `User` |
| `prisma/migrations/<ts>_add_user_role/` | new | Migration SQL |
| `app/_lib/auth.ts` | edit | Return `role` from `authorize()` |
| `app/_lib/auth.config.ts` | edit | Remove `authorized` callback; extend `jwt` and `session` to carry role |
| `app/_lib/auth-types.d.ts` | edit | Augment Session/JWT types with `role` |
| `app/_lib/admin-auth.ts` | new | `requireAdmin()` + `requireAdminApi()` |
| `app/_lib/admin-seed.ts` | new | `createAdminUser()` core logic |
| `app/_lib/__tests__/admin-auth.test.ts` | new | Server helper tests |
| `app/_lib/__tests__/admin-seed.test.ts` | new | Seed logic tests |
| `app/_lib/__tests__/role-schema.test.ts` | new | Role validation tests |
| `middleware.ts` | new | Route gate for `/account`, `/admin`, `/wishlist` |
| `app/(auth)/actions.ts` | edit | `loginAction` chooses `/admin` vs callbackUrl based on role |
| `scripts/create-admin.ts` | new | CLI for admin seeding |
| `package.json` | edit | Add `admin:create` script |

## 6. Rollout plan

1. Schema migration goes out first (no role-aware code yet). Existing users get `role = "CUSTOMER"`. No behaviour change.
2. Code changes (callbacks, middleware, helpers, redirect, seed script) deploy as one PR.
3. Run `npm run admin:create -- --email <you> --password <new-strong-password> --name <you>` on the production server (one-time).
4. Test: log in as the new admin → land on `/admin` → expect 404 (no dashboard yet, that's spec #2).
5. Test: log in as a customer → visit `/admin` → expect redirect to `/`.

## 7. Risks & mitigations

- **JWT compatibility:** existing sessions lack `role`. Mitigated by the `?? "CUSTOMER"` fallback. No forced logout.
- **Forgotten `requireAdmin()`** on a new admin route: middleware catches it. Both layers are intentionally redundant.
- **Seed script run against wrong email:** `--promote` flag is mandatory for existing users; no silent role changes.
- **Bcrypt + Edge runtime:** `bcryptjs` is not Edge-safe. The spec mandates middleware import only from `auth.config.ts` (edge-safe, `providers: []`) — never from `auth.ts` (loads the Credentials provider and bcrypt). The split is already in place; the spec preserves it. Acceptance includes verifying `next build` produces no bcrypt in the middleware bundle.

## 8. Open / deferred decisions

- **Audit log of admin actions:** not in this spec. Likely a cross-cutting addition once spec #3 (order edits) lands.
- **Admin-only IP allowlist** (e.g., office network): not requested; out of scope.
- **2FA for admins:** not in this spec; would be a follow-up after spec #9.

## 9. Caveats (carried forward)

- **JWT TTL is 30 days.** A revoked admin's existing token still grants admin access until expiry. Acceptable for a small store; revisit if the threat model changes (e.g., add a `User.sessionsInvalidatedAt` column and check it in `jwt` callback — likely cheaper as part of spec #9).

## 10. Acceptance criteria

The spec is implementable when:

1. `User.role` exists in the schema with `"CUSTOMER"` default and all existing rows migrated.
2. Logging in as an admin populates `session.user.role === "ADMIN"`.
3. Visiting `/admin/anything` while unauthenticated redirects to `/login?callbackUrl=/admin/anything`.
4. Visiting `/admin/anything` as a customer redirects to `/`.
5. `requireAdmin()` and `requireAdminApi()` enforce the same rules from server context.
6. `npm run admin:create -- --email ... --password ... --name ...` creates an admin or refuses with a clear message.
7. All unit tests pass; `npm run build` and `tsc --noEmit` clean.
