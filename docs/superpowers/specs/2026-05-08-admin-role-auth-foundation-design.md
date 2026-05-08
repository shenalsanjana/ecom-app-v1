# Admin Role + Auth Foundation — Design

**Date:** 2026-05-08
**Status:** Approved for implementation planning
**Branch:** `develop`
**Scope:** Add an `ADMIN` role to the existing user system and stand up a gated `/admin/*` namespace with placeholder pages. No admin features ship in this sub-project — only the foundation that all subsequent admin sub-projects will build on.

This is the **first sub-project** in a multi-spec admin initiative. Subsequent sub-projects (categories CRUD, products + variants, inventory, deals, hero CMS, orders admin, image storage) will be brainstormed in their own sessions and reuse the role/auth/IA established here.

## Goal

Give the storefront a single ADMIN role that:

- Is created by promoting an existing user via a one-shot script (no signup flow change, no admin self-registration).
- Gates a new `/admin/*` namespace at both the proxy (Next 16's renamed middleware) layer and inside the admin layout, so non-admins never see the admin UI exists.
- Is reflected in the next-auth JWT/session so server components can read `session.user.role` without a DB round-trip.
- After login, lands on `/admin` instead of the storefront when the user has no `callbackUrl`.

The deliverable is a working `/admin` shell (top bar + left sidebar) with placeholder pages for every future admin section. None of those pages do anything beyond rendering "coming soon" — but the URLs, layout, and role gating are real.

## Out of scope (handled in later sub-projects)

- Categories CRUD, products + variants, inventory adjustments, deals, hero CMS, orders detail view.
- Image upload infrastructure (where uploaded files live: local disk vs S3/R2 vs Vercel Blob).
- Per-feature permissions, multi-admin onboarding UI, audit logs, MFA.
- Promoting/demoting other users from the admin UI. The `admin:promote` script is the only path.

These constraints are deliberate. Each is a real decision that deserves its own spec.

## Stack additions

None. All work is on the existing Next.js 16.2.4 + next-auth v5 + Prisma + Postgres stack established by the [account/auth spec](./2026-04-29-account-auth-design.md).

The only new file outside `app/` is `scripts/promote-admin.ts`, run via `tsx`.

## Data model

### Schema delta

A single enum + one column added to `User`:

```prisma
enum UserRole {
  USER
  ADMIN
}

model User {
  // ...existing fields...
  role UserRole @default(USER)
}
```

Migration name: `add_user_role`. Existing rows backfill to `USER` automatically via the default.

**Why a single `role` column over a join table:** a 1–2-operator store does not need granular permissions; we explicitly chose the single-role model during brainstorming. If that ever changes, the migration path is clean — turn `role` into a relation to a `Permission` table and copy the existing values across. YAGNI today.

**Why the role lives in the JWT, not re-read on every request:** session reads happen on every server component render. A DB lookup in the `jwt` callback would add a round-trip to every navigation. The trade-off is staleness: a demoted admin keeps admin powers until the JWT expires (default 30 days from `auth.config.ts`). For this store, an admin demotion will be paired with a forced sign-out; if a more aggressive revocation guarantee becomes necessary, we can either shorten `maxAge` or re-issue the JWT on demotion.

## Auth integration

Three small edits across the existing auth files; no new files inside `app/_lib/`.

### `app/_lib/auth.ts` — return `role` from `authorize()`

```ts
return { id: user.id, name: user.name, email: user.email, role: user.role };
```

### `app/_lib/auth.config.ts` — propagate `role` through JWT and session

```ts
jwt({ token, user }) {
  if (user && "id" in user && typeof user.id === "string") token.uid = user.id;
  if (user && "role" in user) token.role = user.role;
  return token;
},
session({ session, token }) {
  if (token.uid && session.user) session.user.id = token.uid;
  if (token.role && session.user) session.user.role = token.role as UserRole;
  return session;
},
```

### `next-auth.d.ts` (new module-augmentation file)

Declares `role: UserRole` on `User` and `Session["user"]` so TypeScript surfaces the field everywhere. The file lives at the project root alongside `next-env.d.ts`.

## Route gating

The existing `proxy.ts` is Next 16's renamed middleware file. Today its matcher only fires for `/account` and `/wishlist`. We extend the matcher and the `authorized` callback.

### `proxy.ts` matcher

```ts
export const config = {
  matcher: ["/account/:path*", "/wishlist/:path*", "/admin/:path*"],
};
```

### `authorized()` in `auth.config.ts`

The proxy enforces only "must be authenticated" for `/admin`. The role check is delegated to the admin layout (next section), which calls `notFound()` for non-admins. This avoids a 302 → 404 chain and gives the namespace a real 404 instead of a redirect.

```ts
authorized({ auth, request }) {
  const path = request.nextUrl.pathname;

  // /admin/* — require a session; role check happens in the layout.
  if (path === "/admin" || path.startsWith("/admin/")) {
    if (auth) return true;
    const url = new URL("/login", request.url);
    url.searchParams.set("callbackUrl", path);
    return Response.redirect(url);
  }

  // existing /account, /wishlist gating preserved verbatim
  const protectedPaths = ["/account", "/wishlist"];
  const isProtected = protectedPaths.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
  if (!isProtected) return true;
  if (auth) return true;
  const url = new URL("/login", request.url);
  url.searchParams.set("callbackUrl", path);
  return Response.redirect(url);
},
```

### Login redirect

The login server action lives at `app/(auth)/actions.ts` (function `loginAction`) — not in a per-route file. Today it respects `callbackUrl` and otherwise sends users to `/`. Add a single branch: when there is no `callbackUrl`, look up the authenticated user's role and redirect admins to `/admin`.

```ts
const rawCallback = formData.get("callbackUrl") as string | null;
// ...existing signIn block unchanged...
if (rawCallback) {
  redirect(safeCallbackUrl(rawCallback));
}
const u = await prisma.user.findUnique({
  where: { email: parsed.data.email },
  select: { role: true },
});
redirect(u?.role === "ADMIN" ? "/admin" : "/");
```

The extra Prisma lookup is acceptable: it runs only on the rare login event, on a path that's already doing DB work via `authorize()`. Reading the role from the session was considered and rejected — `signIn(..., { redirect: false })` does not synchronously expose a session object inside the same server action, so a fresh DB read is the simplest correct approach.

## Admin shell

A new route group under `app/admin/`. The admin lives in a separate visual space — no `SiteHeader` / `SiteFooter`, no storefront chrome.

```
app/admin/
  layout.tsx                     # admin shell
  page.tsx                       # /admin dashboard stub
  categories/page.tsx            # stub: "Categories — coming soon"
  products/page.tsx              # stub
  inventory/page.tsx             # stub
  deals/page.tsx                 # stub
  hero/page.tsx                  # stub
  orders/page.tsx                # stub
  _components/
    admin-sidebar.tsx            # left nav: Dashboard, Categories, Products,
                                 #          Inventory, Deals, Hero, Orders
    admin-topbar.tsx             # logo, "View store" link, sign-out form
```

**Each stub page is intentionally trivial** — an `<h1>` and a one-line "coming soon" paragraph. The point is to lock in the URL shape and navigation so each subsequent sub-project just fills in its own page without re-deciding IA.

### Role check in the layout

`app/admin/layout.tsx` performs a server-side `auth()` check:

```ts
const session = await auth();
if (!session) redirect("/login?callbackUrl=/admin");
if (session.user?.role !== "ADMIN") notFound();
```

This is where the role gate lives — the proxy only ensures authentication. `notFound()` (from `next/navigation`) renders the existing `app/not-found.tsx` with a 404 status, so the admin namespace is indistinguishable from a missing page for any non-admin who somehow lands there. The layout-level `auth()` check also catches edge cases where the proxy doesn't run (e.g., server actions invoked directly), giving us defense-in-depth at no real cost.

### Sign-out

A server-action button in `admin-topbar.tsx` calls `signOut({ redirectTo: "/" })`. Drops the JWT, lands on the storefront. Same primitive used elsewhere in the app.

### "View store" affordance

A plain `<Link href="/" target="_blank">View store</Link>` in `admin-topbar.tsx`. No state-sharing concerns — opens the storefront in a new tab.

## Bootstrap script

`scripts/promote-admin.ts`:

```ts
import { prisma } from "../app/_lib/prisma";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) {
    console.error("Set ADMIN_EMAIL in the environment.");
    process.exit(1);
  }
  try {
    const user = await prisma.user.update({
      where: { email },
      data: { role: "ADMIN" },
      select: { id: true, email: true, role: true },
    });
    console.log("Promoted:", user);
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") {
      console.error(`No user with email ${email}. Sign up first, then re-run.`);
      process.exit(1);
    }
    throw err;
  }
}

main().finally(() => prisma.$disconnect());
```

`package.json` gets one new script entry:

```json
"admin:promote": "tsx scripts/promote-admin.ts"
```

**Usage flow** (documented in this spec, not in a separate runbook):

1. Sign up at `/signup` with the email you want to be an admin.
2. `ADMIN_EMAIL=you@example.com npm run admin:promote`
3. Sign out and back in (so the JWT carries the new role) — you'll land on `/admin`.

`prisma/seed.ts` is not modified. Seed data should not depend on real admin email addresses.

## Verification

The repo has no test framework configured (no Vitest, Jest, or Playwright). A single Playwright test would carry more setup overhead than this sub-project warrants. Verification is a documented manual smoke matrix instead, run after implementation:

| # | Scenario | Expected |
|---|---|---|
| 1 | Unauthenticated `GET /admin` | 302 → `/login?callbackUrl=/admin` |
| 2 | Unauthenticated `GET /admin/orders` | 302 → `/login?callbackUrl=/admin/orders` |
| 3 | Logged-in USER `GET /admin` | 404, renders `app/not-found.tsx` |
| 4 | Logged-in USER `GET /admin/orders` | 404, renders `app/not-found.tsx` |
| 5 | Logged-in ADMIN `GET /admin` | 200, dashboard renders |
| 6 | Logged-in ADMIN `GET /admin/orders` | 200, "coming soon" stub |
| 7 | `GET /account` (logged-in user) | unchanged from today |
| 8 | `GET /wishlist` (logged-in user) | unchanged from today |
| 9 | Login as ADMIN with no `callbackUrl` | lands on `/admin` |
| 10 | Login as USER with no `callbackUrl` | lands on `/` |
| 11 | Sign-out from admin top bar | redirected to `/`, session dropped |
| 12 | `npm run admin:promote` for nonexistent email | exits non-zero, prints "Sign up first" |

The implementer must run all 12 manually and report results in the PR description. Per the `verification-before-completion` discipline, "type-checks pass" is not the same as "feature works" — the manual matrix is the only honest signal here.

A future admin sub-project (most likely the orders admin view, since it's the first one with real interactivity) will introduce Playwright. At that point the matrix above can be ported over alongside the new tests.

## Open questions

None. All product decisions were made during brainstorming.

## Future specs

The remaining admin sub-projects, ordered by dependency:

1. **Image storage decision + admin upload primitive** — pick where uploaded bytes live (local `/public/uploads`, S3/R2, Vercel Blob), build a server-action upload helper. Required by every CMS-style admin page.
2. **Categories CRUD** — admin UI to create/edit/delete categories with image.
3. **Products + variants** — replace the comma-separated `sizes` string with a proper `ProductVariant` table; admin UI to upload images, set variants, list products.
4. **Inventory** — adjust per-variant stock. Builds on #3.
5. **Deals** — schema decision (start/end dates? percent off? a flag?), admin UI to mark products as "on deal".
6. **Hero panel CMS** — move the hardcoded hero copy and image out of `app/_components/home/hero.tsx` into a DB-backed singleton, admin UI to edit.
7. **Orders admin** — list + detail + status update view of `Order`/`OrderItem` (no schema changes needed).

Each will be brainstormed independently after the foundation lands.
