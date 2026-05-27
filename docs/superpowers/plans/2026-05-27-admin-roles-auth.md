# Admin Roles & Route Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `role` field to `User`, gate `/admin/*` routes to ADMINs only (middleware + server helper, defense in depth), redirect admins to `/admin` after login, and provide a CLI to seed/promote admins. Foundational for specs #2–#9.

**Architecture:** Two-layer protection — Edge middleware imports only `auth.config.ts` (no bcrypt) and redirects unauthenticated → `/login`, non-admin → `/`; `requireAdmin()` / `requireAdminApi()` server helpers re-check in every admin server component / action / API route. Role exposed through NextAuth `jwt` + `session` callbacks. First admin seeded via `npm run admin:create`.

**Tech Stack:** Next.js 16 (App Router), NextAuth v5 (JWT, Credentials), Prisma + Postgres, bcryptjs, Zod, vitest.

**Source spec:** `docs/superpowers/specs/2026-05-27-admin-roles-auth-design.md`

**Plan deviations from spec:** Schema change uses `prisma db push` (matches repo's existing workflow — no prior migration files exist). Moving the repo to proper `prisma migrate` history is a separate housekeeping task and not part of this plan.

---

## File map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | edit | Add `role String @default("CUSTOMER")` to User |
| `app/_lib/validation.ts` | edit | Export `RoleSchema` (zod enum) |
| `app/_lib/auth-types.d.ts` | edit | Augment Session/JWT with `role` |
| `app/_lib/auth.ts` | edit | `authorize` returns `role` from DB row |
| `app/_lib/auth.config.ts` | edit | `jwt`/`session` carry role; remove `authorized` |
| `app/_lib/admin-auth.ts` | new | `requireAdmin()` + `requireAdminApi()` server guards |
| `app/_lib/admin-seed.ts` | new | `createAdminUser()` pure logic, testable |
| `app/(auth)/login-redirect.ts` | new | `chooseLoginRedirect(role, callbackUrl)` pure decision |
| `app/(auth)/actions.ts` | edit | `loginAction` uses `chooseLoginRedirect` |
| `middleware.ts` | new | Edge-level route gate for `/account`, `/admin`, `/wishlist` |
| `scripts/create-admin.ts` | new | CLI wrapper for `createAdminUser` |
| `package.json` | edit | Add `admin:create` script |
| `app/_lib/__tests__/role-schema.test.ts` | new | RoleSchema validation tests |
| `app/_lib/__tests__/admin-auth.test.ts` | new | requireAdmin/requireAdminApi behaviour tests |
| `app/_lib/__tests__/admin-seed.test.ts` | new | createAdminUser branch tests |
| `app/(auth)/__tests__/login-redirect.test.ts` | new | chooseLoginRedirect decision matrix |

**One responsibility per file:** `admin-auth.ts` is read-only auth checks; `admin-seed.ts` is the only write path for admin role; `login-redirect.ts` is a pure function (no I/O) so it imports cleanly into the `"use server"` actions file without becoming a server action itself; `middleware.ts` is the edge gate; `scripts/create-admin.ts` is the thin CLI wrapper.

---

## Task 1: Add `RoleSchema` to validation.ts

**Files:**
- Modify: `app/_lib/validation.ts` (append at end)
- Test: `app/_lib/__tests__/role-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/role-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { RoleSchema } from "../validation";

describe("RoleSchema", () => {
  it("accepts ADMIN", () => {
    expect(RoleSchema.parse("ADMIN")).toBe("ADMIN");
  });

  it("accepts CUSTOMER", () => {
    expect(RoleSchema.parse("CUSTOMER")).toBe("CUSTOMER");
  });

  it("rejects lowercase admin", () => {
    expect(RoleSchema.safeParse("admin").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(RoleSchema.safeParse("").success).toBe(false);
  });

  it("rejects unknown roles", () => {
    expect(RoleSchema.safeParse("STAFF").success).toBe(false);
    expect(RoleSchema.safeParse("MANAGER").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/role-schema.test.ts`
Expected: import error — `RoleSchema` is not exported from `../validation`.

- [ ] **Step 3: Implement RoleSchema**

Append to `app/_lib/validation.ts` (after the last `export type ...`):

```ts
export const RoleSchema = z.enum(["ADMIN", "CUSTOMER"]);
export type Role = z.infer<typeof RoleSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/role-schema.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/validation.ts app/_lib/__tests__/role-schema.test.ts
git commit -m "feat(auth): add RoleSchema for ADMIN | CUSTOMER validation"
```

---

## Task 2: Add `role` column to `User` schema

**Files:**
- Modify: `prisma/schema.prisma:10-22` (User model)

- [ ] **Step 1: Edit the User model**

In `prisma/schema.prisma`, modify the `User` model. Find:

```prisma
model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  passwordHash  String
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  addresses     Address[]
  wishlist      WishlistItem[]
  resetTokens   PasswordResetToken[]
  orders        Order[]
}
```

Replace with (one new line, between `passwordHash` and `createdAt`):

```prisma
model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  passwordHash  String
  role          String    @default("CUSTOMER") @db.VarChar(16)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  addresses     Address[]
  wishlist      WishlistItem[]
  resetTokens   PasswordResetToken[]
  orders        Order[]
}
```

- [ ] **Step 2: Push schema to dev DB**

Run: `npm run db:push`
Expected: `The database is now in sync with your Prisma schema.` All existing User rows get `role = "CUSTOMER"` because of the default.

Note for production: same `npm run db:push` against the prod `DATABASE_URL` when deploying this change. (See spec §6 for rollout order.)

- [ ] **Step 3: Regenerate Prisma client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client`. The generated types now include `User.role`.

- [ ] **Step 4: Verify TypeScript still compiles**

Run: `npx tsc --noEmit`
Expected: clean (no new errors). The new column is unused by existing code, so nothing should break.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): add User.role column defaulting to CUSTOMER"
```

---

## Task 3: Augment NextAuth types with `role`

**Files:**
- Modify: `app/_lib/auth-types.d.ts`

- [ ] **Step 1: Edit the type augmentation**

Replace the contents of `app/_lib/auth-types.d.ts` with:

```ts
// app/_lib/auth-types.d.ts
import type { DefaultSession } from "next-auth";
import type {} from "next-auth/jwt";

type AppRole = "ADMIN" | "CUSTOMER";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppRole;
    } & DefaultSession["user"];
  }

  interface User {
    role?: AppRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: AppRole;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. (No callers read `session.user.role` yet, so adding the type doesn't break anything.)

- [ ] **Step 3: Commit**

```bash
git add app/_lib/auth-types.d.ts
git commit -m "feat(auth): augment NextAuth Session/JWT types with role"
```

---

## Task 4: Return `role` from `authorize()`

**Files:**
- Modify: `app/_lib/auth.ts:72` (the `return` inside `authorize`)

- [ ] **Step 1: Edit the authorize return**

In `app/_lib/auth.ts`, find:

```ts
return { id: user.id, name: user.name, email: user.email };
```

Replace with:

```ts
return {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role === "ADMIN" ? "ADMIN" : "CUSTOMER",
};
```

The explicit ternary normalizes any unexpected DB value (defensive — the schema default and seed script both write only ADMIN/CUSTOMER, but reading from the DB never trusts blindly).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. `User.role` exists in the Prisma client (Task 2) and the returned shape matches the augmented `User` type (Task 3).

- [ ] **Step 3: Verify existing tests still pass**

Run: `npx vitest run`
Expected: all green. No test directly exercises `authorize()` and this change doesn't alter the authentication outcome — only the user payload.

- [ ] **Step 4: Commit**

```bash
git add app/_lib/auth.ts
git commit -m "feat(auth): include role in authorize() return so JWT carries it"
```

---

## Task 5: Extend `jwt` / `session` callbacks; remove `authorized`

**Files:**
- Modify: `app/_lib/auth.config.ts`

- [ ] **Step 1: Replace the callbacks**

Replace the entire contents of `app/_lib/auth.config.ts` with:

```ts
// app/_lib/auth.config.ts
import type { NextAuthConfig } from "next-auth";

type AppRole = "ADMIN" | "CUSTOMER";

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user && "id" in user) {
        token.uid = user.id as string;
        const role = (user as { role?: AppRole }).role;
        token.role = role === "ADMIN" ? "ADMIN" : "CUSTOMER";
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = token.uid;
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "CUSTOMER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

console.log("[Auth Config]: Shared config loaded. Secret set:", !!process.env.AUTH_SECRET);
if (process.env.AUTH_SECRET?.startsWith('"')) {
  console.warn("[Auth Config]: WARNING: AUTH_SECRET starts with a quote. Check environment variables.");
}
```

Key changes vs. the existing file:
- Removed the `authorized` callback (middleware takes over route protection in Task 9).
- `jwt` now also writes `token.role` whenever a user is authenticated.
- `session` now also exposes `session.user.role` for every request.
- Pre-existing JWTs without a `role` claim fall back to `"CUSTOMER"` — the safety net for users with old sessions on deploy day.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Verify existing tests pass**

Run: `npx vitest run`
Expected: all green. (The change is observational — callbacks now expose role; nothing existing reads it yet.)

- [ ] **Step 4: Commit**

```bash
git add app/_lib/auth.config.ts
git commit -m "feat(auth): expose role through jwt/session callbacks; drop authorized callback"
```

---

## Task 6: Build `admin-auth.ts` server guards

**Files:**
- Create: `app/_lib/admin-auth.ts`
- Test: `app/_lib/__tests__/admin-auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/_lib/__tests__/admin-auth.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { redirectMock, authMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    // next/navigation's redirect() throws internally; we mirror that.
    throw new Error(`REDIRECT:${url}`);
  }),
  authMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/app/_lib/auth", () => ({ auth: authMock }));

import { requireAdmin, requireAdminApi } from "../admin-auth";

describe("requireAdmin", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    authMock.mockReset();
  });

  it("redirects to /login when no session", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login?callbackUrl=/admin");
  });

  it("redirects to / when authenticated but not admin", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "CUSTOMER" } });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/");
  });

  it("returns the session when role === ADMIN", async () => {
    const session = { user: { id: "u1", role: "ADMIN" } };
    authMock.mockResolvedValue(session);
    await expect(requireAdmin()).resolves.toEqual(session);
  });
});

describe("requireAdminApi", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it("returns 401 Response when no session", async () => {
    authMock.mockResolvedValue(null);
    const result = await requireAdminApi();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("returns 403 Response when authenticated but not admin", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "CUSTOMER" } });
    const result = await requireAdminApi();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("returns { session } when role === ADMIN", async () => {
    const session = { user: { id: "u1", role: "ADMIN" } };
    authMock.mockResolvedValue(session);
    const result = await requireAdminApi();
    expect(result).toEqual({ session });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-auth.test.ts`
Expected: import error — `../admin-auth` does not exist yet.

- [ ] **Step 3: Implement the guards**

Create `app/_lib/admin-auth.ts`:

```ts
// app/_lib/admin-auth.ts
// Server-side admin guards. Use in any /admin server component, server
// action, or API route. The middleware (middleware.ts) also blocks /admin
// at the edge — these helpers are the defense-in-depth layer that catches
// any route the middleware matcher might miss.
import { redirect } from "next/navigation";
import { auth } from "@/app/_lib/auth";

type Session = NonNullable<Awaited<ReturnType<typeof auth>>>;

/**
 * Server-component / server-action guard. Redirects unauthenticated users
 * to /login and non-admin authenticated users to /. Returns the session
 * when the caller is an admin.
 */
export async function requireAdmin(): Promise<Session> {
  const session = await auth();
  if (!session?.user) {
    redirect(`/login?callbackUrl=/admin`);
  }
  if (session.user.role !== "ADMIN") {
    redirect("/");
  }
  return session;
}

/**
 * API-route guard. Returns the admin session on success, or a 401/403
 * Response the caller should return directly.
 *
 *   const guard = await requireAdminApi();
 *   if (guard instanceof Response) return guard;
 *   const { session } = guard;
 */
export async function requireAdminApi(): Promise<{ session: Session } | Response> {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if (session.user.role !== "ADMIN") return new Response("Forbidden", { status: 403 });
  return { session };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/_lib/__tests__/admin-auth.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/admin-auth.ts app/_lib/__tests__/admin-auth.test.ts
git commit -m "feat(auth): add requireAdmin/requireAdminApi server guards"
```

---

## Task 7: Build `admin-seed.ts` core

**Files:**
- Create: `app/_lib/admin-seed.ts`
- Test: `app/_lib/__tests__/admin-seed.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/_lib/__tests__/admin-seed.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";

const { userFindUnique, userCreate, userUpdate } = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: userFindUnique,
      create: userCreate,
      update: userUpdate,
    },
  },
}));

import { createAdminUser } from "../admin-seed";

const BASE_INPUT = {
  email: "founder@dressingbear.com",
  password: "StrongPass1",
  name: "Founder",
  promote: false,
};

beforeEach(() => {
  userFindUnique.mockReset();
  userCreate.mockReset();
  userUpdate.mockReset();
});

describe("createAdminUser", () => {
  it("creates a new admin when the email doesn't exist", async () => {
    userFindUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "u1" });

    const result = await createAdminUser(BASE_INPUT);

    expect(result).toEqual({ ok: true, action: "created", userId: "u1" });
    expect(userCreate).toHaveBeenCalledOnce();
    const arg = userCreate.mock.calls[0][0];
    expect(arg.data.email).toBe(BASE_INPUT.email);
    expect(arg.data.name).toBe(BASE_INPUT.name);
    expect(arg.data.role).toBe("ADMIN");
    // password should be hashed, never stored plain
    expect(arg.data.passwordHash).not.toBe(BASE_INPUT.password);
    expect(await bcrypt.compare(BASE_INPUT.password, arg.data.passwordHash)).toBe(true);
  });

  it("refuses when the user already exists as admin", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", role: "ADMIN" });

    const result = await createAdminUser(BASE_INPUT);

    expect(result).toEqual({
      ok: false,
      reason: "already_admin",
      message: expect.stringContaining("already exists as admin"),
    });
    expect(userCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("refuses to promote a customer without --promote flag", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", role: "CUSTOMER" });

    const result = await createAdminUser({ ...BASE_INPUT, promote: false });

    expect(result).toEqual({
      ok: false,
      reason: "needs_promote_flag",
      message: expect.stringContaining("--promote"),
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("promotes a customer when --promote is set, without changing password", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", role: "CUSTOMER" });
    userUpdate.mockResolvedValue({ id: "u1" });

    const result = await createAdminUser({ ...BASE_INPUT, promote: true });

    expect(result).toEqual({ ok: true, action: "promoted", userId: "u1" });
    expect(userUpdate).toHaveBeenCalledOnce();
    const arg = userUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "u1" });
    expect(arg.data).toEqual({ role: "ADMIN" });
    // passwordHash must NOT appear in the update payload
    expect(Object.keys(arg.data)).not.toContain("passwordHash");
  });

  it("rejects invalid input (bad email)", async () => {
    const result = await createAdminUser({ ...BASE_INPUT, email: "not-an-email" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_input");
    }
  });

  it("rejects invalid input (weak password)", async () => {
    const result = await createAdminUser({ ...BASE_INPUT, password: "short" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_input");
    }
  });

  it("rejects invalid input (empty name)", async () => {
    const result = await createAdminUser({ ...BASE_INPUT, name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_input");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-seed.test.ts`
Expected: import error — `../admin-seed` does not exist yet.

- [ ] **Step 3: Implement createAdminUser**

Create `app/_lib/admin-seed.ts`:

```ts
// app/_lib/admin-seed.ts
// Pure logic for creating or promoting an admin user. Called from
// scripts/create-admin.ts and any future admin-bootstrap path. Never
// invoked from user-facing request flows — admins are only created via
// the CLI.
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { PasswordSchema } from "@/app/_lib/validation";

const InputSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: PasswordSchema,
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  promote: z.boolean().default(false),
});

export type CreateAdminInput = z.input<typeof InputSchema>;

export type CreateAdminResult =
  | { ok: true; action: "created" | "promoted"; userId: string }
  | {
      ok: false;
      reason: "already_admin" | "needs_promote_flag" | "invalid_input";
      message: string;
    };

const BCRYPT_COST = 10;

export async function createAdminUser(input: CreateAdminInput): Promise<CreateAdminResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_input",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const { email, password, name, promote } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role === "ADMIN") {
      return {
        ok: false,
        reason: "already_admin",
        message: `User ${email} already exists as admin.`,
      };
    }
    if (!promote) {
      return {
        ok: false,
        reason: "needs_promote_flag",
        message: `User ${email} exists as customer. Pass --promote to flip their role to admin (password unchanged).`,
      };
    }
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { role: "ADMIN" },
    });
    return { ok: true, action: "promoted", userId: updated.id };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const created = await prisma.user.create({
    data: { email, name, passwordHash, role: "ADMIN" },
  });
  return { ok: true, action: "created", userId: created.id };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/_lib/__tests__/admin-seed.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/admin-seed.ts app/_lib/__tests__/admin-seed.test.ts
git commit -m "feat(auth): createAdminUser core with create/promote/refuse branches"
```

---

## Task 8: Build the `create-admin` CLI + npm script

**Files:**
- Create: `scripts/create-admin.ts`
- Modify: `package.json` (scripts section)

- [ ] **Step 1: Implement the CLI script**

Create `scripts/create-admin.ts`:

```ts
// scripts/create-admin.ts
// Thin CLI wrapper around createAdminUser. Run as:
//
//   npm run admin:create -- --email founder@dressingbear.com \
//     --password 'StrongPass1' --name 'Founder' [--promote]
//
// On Vercel/CI, DATABASE_URL is already in process.env. For local runs
// we load .env / .env.local the same way prisma/seed.ts does.
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { createAdminUser } from "@/app/_lib/admin-seed";

for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      password: { type: "string" },
      name: { type: "string" },
      promote: { type: "boolean", default: false },
      help: { type: "boolean", default: false, short: "h" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(
      "Usage: npm run admin:create -- --email <email> --password <pw> --name <name> [--promote]\n\n" +
        "  --email     required\n" +
        "  --password  required, min 8 chars with a letter and a number\n" +
        "  --name      required, min 2 chars\n" +
        "  --promote   if the email is an existing CUSTOMER, flip them to ADMIN\n" +
        "              (password is NOT changed by promotion)\n",
    );
    process.exit(0);
  }

  if (!values.email || !values.password || !values.name) {
    fail("Missing required flag. Run with --help for usage.");
  }

  const result = await createAdminUser({
    email: values.email,
    password: values.password,
    name: values.name,
    promote: values.promote ?? false,
  });

  if (!result.ok) {
    fail(result.message);
  }

  if (result.action === "created") {
    console.log(`✓ Admin created: ${values.email} (id: ${result.userId})`);
  } else {
    console.log(`✓ User promoted to admin: ${values.email} (id: ${result.userId})`);
  }
}

main().catch((err) => {
  console.error("✗ Unexpected error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `package.json`, find the `"scripts"` block:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "check:contrast": "tsx scripts/check-contrast.ts",
  "db:push": "prisma db push",
  "db:migrate": "prisma migrate dev",
  "db:seed": "prisma db seed",
  "db:reset": "prisma migrate reset --force"
},
```

Add `"admin:create"` after `"check:contrast"`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "check:contrast": "tsx scripts/check-contrast.ts",
  "admin:create": "tsx scripts/create-admin.ts",
  "db:push": "prisma db push",
  "db:migrate": "prisma migrate dev",
  "db:seed": "prisma db seed",
  "db:reset": "prisma migrate reset --force"
},
```

- [ ] **Step 3: Smoke test the help flag**

Run: `npm run admin:create -- --help`
Expected: prints usage text and exits 0.

- [ ] **Step 4: Smoke test the missing-flag path**

Run: `npm run admin:create -- --email foo@bar.com`
Expected: exits 1 with "Missing required flag. Run with --help for usage."

- [ ] **Step 5: Smoke test the invalid-input path (no DB needed)**

Run: `npm run admin:create -- --email not-an-email --password Weak --name X`
Expected: exits 1 with a validation message (e.g., "Enter a valid email; Password must be at least 8 characters; Name must be at least 2 characters").

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add scripts/create-admin.ts package.json
git commit -m "feat(auth): admin:create CLI for seeding/promoting the first admin"
```

---

## Task 9: Add `middleware.ts` for route protection

**Files:**
- Create: `middleware.ts` (at project root, NOT under `app/`)

- [ ] **Step 1: Create the middleware**

Create `middleware.ts` at the project root:

```ts
// middleware.ts
// Edge-level route protection. Must import only from auth.config.ts —
// auth.ts pulls in bcryptjs, which is not Edge-safe. The server-side
// requireAdmin() / requireAdminApi() helpers in app/_lib/admin-auth.ts
// provide the second layer of defense.
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/app/_lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const isAuthed = !!req.auth;
  const isAdmin = req.auth?.user?.role === "ADMIN";

  if (path.startsWith("/admin")) {
    if (!isAuthed) {
      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${path}`, req.url),
      );
    }
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return;
  }

  // /account, /wishlist — any authenticated user. Preserves the
  // pre-existing behaviour previously enforced by auth.config.authorized.
  if (path.startsWith("/account") || path.startsWith("/wishlist")) {
    if (!isAuthed) {
      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${path}`, req.url),
      );
    }
  }
});

export const config = {
  matcher: ["/account/:path*", "/admin/:path*", "/wishlist/:path*"],
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Build and verify bcrypt does not land in the middleware bundle**

Run: `npm run build`
Expected: succeeds. Inspect output: the build summary should not flag bcrypt in middleware (the build will fail loudly if a Node-only module is bundled for Edge).

If the build does fail with an Edge runtime error, the import chain is wrong — verify that `middleware.ts` imports from `@/app/_lib/auth.config` (NOT `@/app/_lib/auth`).

- [ ] **Step 4: Smoke test the customer-blocked path (manual, optional)**

If a dev DB is available:
1. `npm run dev`
2. Visit `http://localhost:3000/admin` while logged out — should redirect to `/login?callbackUrl=/admin`.
3. Log in as any existing customer (their role is `"CUSTOMER"` by default after Task 2), visit `/admin` — should redirect to `/`.

This step is documentation-only if no dev DB is set up; the unit tests for `requireAdmin` cover the same matrix at the helper level.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts
git commit -m "feat(auth): edge middleware gates /admin /account /wishlist by role"
```

---

## Task 10: Add `chooseLoginRedirect` helper and wire into `loginAction`

**Files:**
- Create: `app/(auth)/login-redirect.ts`
- Test: `app/(auth)/__tests__/login-redirect.test.ts`
- Modify: `app/(auth)/actions.ts` (the `loginAction` function only)

- [ ] **Step 1: Write the failing tests**

Create `app/(auth)/__tests__/login-redirect.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { chooseLoginRedirect } from "../login-redirect";

describe("chooseLoginRedirect", () => {
  describe("admin", () => {
    it("defaults to /admin when callbackUrl is '/'", () => {
      expect(chooseLoginRedirect("ADMIN", "/")).toBe("/admin");
    });

    it("defaults to /admin when callbackUrl is empty string", () => {
      expect(chooseLoginRedirect("ADMIN", "")).toBe("/admin");
    });

    it("honours an explicit /admin/something callbackUrl", () => {
      expect(chooseLoginRedirect("ADMIN", "/admin/orders")).toBe("/admin/orders");
    });

    it("honours a non-admin callbackUrl (admin can also act as customer)", () => {
      expect(chooseLoginRedirect("ADMIN", "/checkout")).toBe("/checkout");
      expect(chooseLoginRedirect("ADMIN", "/account/orders")).toBe("/account/orders");
    });
  });

  describe("customer", () => {
    it("returns callbackUrl when it is '/'", () => {
      expect(chooseLoginRedirect("CUSTOMER", "/")).toBe("/");
    });

    it("returns callbackUrl when set", () => {
      expect(chooseLoginRedirect("CUSTOMER", "/checkout")).toBe("/checkout");
    });

    it("returns '/' for empty callbackUrl", () => {
      expect(chooseLoginRedirect("CUSTOMER", "")).toBe("/");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run login-redirect`
(Substring filter avoids vitest's minimatch interpreting the `(auth)` parens as a glob group.)
Expected: import error — `../login-redirect` does not exist.

- [ ] **Step 3: Implement chooseLoginRedirect**

Create `app/(auth)/login-redirect.ts`:

```ts
// app/(auth)/login-redirect.ts
// Pure decision function: given the just-authenticated user's role and the
// callbackUrl from the login form, return where to send them next. Kept
// outside actions.ts so it stays free of the "use server" directive and is
// trivially unit-testable.

type Role = "ADMIN" | "CUSTOMER";

export function chooseLoginRedirect(role: Role, callbackUrl: string): string {
  const normalized = callbackUrl || "/";
  if (role === "ADMIN" && (normalized === "/" || normalized === "")) {
    return "/admin";
  }
  return normalized;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run login-redirect`
Expected: 7 passed.

- [ ] **Step 5: Wire into `loginAction`**

In `app/(auth)/actions.ts`, find `loginAction`:

```ts
export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  console.log("[Login Action]: Starting...");
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    console.warn("[Login Action]: Validation failed");
    return { error: "Invalid email or password" };
  }

  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl") as string | null);
  console.log(`[Login Action]: Attempting signIn for ${parsed.data.email} with callbackUrl: ${callbackUrl}`);

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
    console.log("[Login Action]: signIn cookie set, returning redirectTo for client navigation");
    return { redirectTo: callbackUrl };
  } catch (error) {
    if (error instanceof AuthError) {
      console.warn("[Login Action]: AuthError during signIn", error.type);
      return { error: "Invalid email or password" };
    }
    console.error("[Login Action]: Unexpected error during signIn", error);
    throw error;
  }
}
```

Replace it with (also add the imports for `auth` and `chooseLoginRedirect` near the top of the file):

```ts
export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  console.log("[Login Action]: Starting...");
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    console.warn("[Login Action]: Validation failed");
    return { error: "Invalid email or password" };
  }

  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl") as string | null);
  console.log(`[Login Action]: Attempting signIn for ${parsed.data.email} with callbackUrl: ${callbackUrl}`);

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });

    // signIn set the session cookie; auth() now returns the new session.
    const session = await auth();
    const role = session?.user?.role === "ADMIN" ? "ADMIN" : "CUSTOMER";
    const redirectTo = chooseLoginRedirect(role, callbackUrl);

    console.log(`[Login Action]: signIn cookie set, role=${role}, redirectTo=${redirectTo}`);
    return { redirectTo };
  } catch (error) {
    if (error instanceof AuthError) {
      console.warn("[Login Action]: AuthError during signIn", error.type);
      return { error: "Invalid email or password" };
    }
    console.error("[Login Action]: Unexpected error during signIn", error);
    throw error;
  }
}
```

At the top of `app/(auth)/actions.ts`, alongside the existing `import { signIn }`, add `auth`:

```ts
import { signIn, auth } from "@/app/_lib/auth";
```

And below the other imports, add:

```ts
import { chooseLoginRedirect } from "./login-redirect";
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Verify all existing tests still pass**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add app/(auth)/login-redirect.ts app/(auth)/__tests__/login-redirect.test.ts app/(auth)/actions.ts
git commit -m "feat(auth): admin lands on /admin after login (callbackUrl honoured otherwise)"
```

---

## Task 11: Full-suite verification

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run all unit tests**

Run: `npm test`
Expected: all suites green. The new tests are:
- `app/_lib/__tests__/role-schema.test.ts` (5 cases)
- `app/_lib/__tests__/admin-auth.test.ts` (6 cases)
- `app/_lib/__tests__/admin-seed.test.ts` (7 cases)
- `app/(auth)/__tests__/login-redirect.test.ts` (7 cases)

Total new: 25 cases. Plus the pre-existing 86 cases — expect 111 total.

- [ ] **Step 4: Run the production build**

Run: `npm run build`
Expected: succeeds. Confirms middleware compiles for Edge runtime and the whole app type-checks against the new schema.

- [ ] **Step 5: Verify the spec's acceptance criteria are met**

Cross-check against `docs/superpowers/specs/2026-05-27-admin-roles-auth-design.md` §10:

1. `User.role` exists with `"CUSTOMER"` default — Task 2. ✓
2. Admin login populates `session.user.role === "ADMIN"` — Tasks 4 + 5. ✓
3. Visiting `/admin/*` while unauthenticated redirects to `/login?callbackUrl=...` — Task 9 (middleware). ✓
4. Visiting `/admin/*` as a customer redirects to `/` — Task 9 (middleware). ✓
5. `requireAdmin()` / `requireAdminApi()` enforce same rules from server context — Task 6. ✓
6. `npm run admin:create -- --email ... --password ... --name ...` creates or refuses with clear message — Task 8. ✓
7. Unit tests pass; `npm run build` and `tsc --noEmit` clean — this task. ✓

- [ ] **Step 6: Final commit (only if any cleanup was needed)**

If `npm run lint` revealed any auto-fixable issues that weren't part of the earlier tasks' commits, commit them now:

```bash
git add <files>
git commit -m "chore: lint fixes from final verification"
```

Otherwise skip — the tree should already be clean.

---

## Manual smoke test (after merge, before declaring done)

Not part of the automated suite, but documented for the operator:

1. Deploy this branch to a non-production environment (or run locally with a dev DB).
2. Run the seed: `npm run admin:create -- --email <you> --password '<new strong pw>' --name '<you>'`. Expect "Admin created" or "promoted" message.
3. Open `/login`, sign in with that admin. Expect to land on `/admin` (currently shows 404 — that's fine; spec #2 builds the dashboard).
4. Sign out, sign in as any pre-existing customer (or sign up a fresh one). Expect to land on `/account` (or whatever callbackUrl was).
5. As that customer, manually navigate to `/admin`. Expect redirect to `/`.
6. Sign out, navigate to `/admin` directly. Expect redirect to `/login?callbackUrl=/admin`.

If all six pass, this spec is complete and unblocks spec #2.

---

## Notes for future specs

- Migration history: this plan used `prisma db push`. Spec #2 or a separate housekeeping spec should establish a migrations baseline (`prisma migrate dev --name baseline` followed by `prisma migrate resolve --applied <name>` against prod) before any further schema changes.
- Audit log of admin actions (out of scope for spec #1) will likely fold into spec #3 (order management) once admins start mutating order state.
- Session revocation on role change: defer to spec #9 (Settings) if a force-logout-all knob is wanted.

---

## Execution notes (added during Task 11)

Two deviations from the plan emerged during implementation; both are recorded here for traceability.

1. **`Session` type derivation (Task 6).** The plan's `type Session = NonNullable<Awaited<ReturnType<typeof auth>>>` resolves to `NextMiddleware` because NextAuth v5's `auth` is overloaded and TypeScript picks the last overload. Fixed by `import type { Session } from "next-auth"` — the augmentation in `auth-types.d.ts` provides the correct shape. (Commit 6675d4b.)

2. **`middleware.ts` → `proxy.ts` (Task 9).** Next.js 16 renamed `middleware.ts` to `proxy.ts`. The build refuses to coexist with both. The implementation lives at `proxy.ts` with identical logic and matcher. (Commit 318cd1d.)

3. **Pre-`signIn` role lookup (Task 10).** The plan called `await auth()` after `await signIn(..., { redirect: false })` to read the role. NextAuth v5 doesn't reliably propagate the new cookie to a same-request `auth()` call. Switched to a pre-`signIn` indexed `prisma.user.findUnique({ select: { role: true } })`. (Commit 9ae4124.)
