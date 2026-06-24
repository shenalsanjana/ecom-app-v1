# Customer Auth: Google OAuth + Email/Password Hardening — Design

**Date:** 2026-06-24
**Status:** Draft — pending implementation plan
**Branch:** `feat/auth-google-and-hardening` (single branch, phased)

---

## 1. Goal

Bring the Dressing Bear customer login/auth flow up to a standard ecommerce pattern:

- **Google OAuth** ("Continue with Google") alongside the existing email/password login, with create-or-link-by-email so the same person never ends up with two accounts.
- **Email normalization to lowercase everywhere**, killing the root cause of future duplicate accounts.
- A **clean, mobile-responsive login UI** exposing: Continue with Google · Log in with Email · Create Account · Forgot Password.
- **Customer-friendly errors** — technical/server errors never reach the customer.
- **Verified-email guest-order sync**: a guest's past orders attach to their account automatically when they sign in with Google (Google verifies the email).
- A documented **"set a password"** path for Google-only users, reusing the existing reset flow.

All of this lands **without** disturbing admin login, guest checkout, order creation, confirmation emails, the PayHere/Koko/Mintpay payment flow, or the cart.

## 2. Non-goals

- **No Prisma DB-session adapter** (`@auth/prisma-adapter`) and **no `Account`/`Session`/`VerificationToken` tables.** The Credentials provider is unsupported under database sessions; adopting it would break email/password *and* admin login. We stay on JWT sessions. (See §3 and §11.)
- **No email verification on password signup in v1.** That is the prerequisite for auto-linking guest orders to *password* accounts; it is explicitly deferred (the seam is left in place — see §4.6 and §10).
- **No other OAuth providers** (Facebook, Apple, etc.). Google only.
- **No admin-side changes.** Admin auth, `proxy.ts`, `requireAdmin()`, and the admin login experience are untouched. Google sign-in can never grant ADMIN.
- **No change to payment, courier, cart, or email internals.** We only add email normalization and a soft checkout prompt.
- **No "magic link" / passwordless email login.**

## 3. Constraints from the existing codebase

- **NextAuth v5** (`next-auth: ^5.0.0-beta.31`, `@auth/core: ^0.41.2`), **JWT session strategy** (`session.strategy = "jwt"`), 30-day `maxAge`. No DB adapter today.
- **Credentials provider** with `bcryptjs` (cost 10) in `app/_lib/auth.ts`.
- **Edge/runtime split is load-bearing:** route protection lives in `proxy.ts` (Next 16's renamed middleware) and imports only `auth.config.ts` (`providers: []`, no bcrypt) so it stays Edge-safe. `auth.ts` (with the providers + bcrypt) must never be imported into the proxy. This split is preserved.
- **Prisma + PostgreSQL** (prod) / SQLite (local). String-typed status/role fields by convention (no Prisma enums).
- `User.passwordHash` is currently **non-nullable** — a Google-only user has no password, so this must become nullable.
- `User.email` has a DB `@unique` constraint. Emails are currently stored as typed (only `.trim()`, **no lowercase**).
- The `Order` model already supports both paths: nullable `userId` **and** `guestName`/`guestEmail`. Logged-in checkout already sets `userId`; guest checkout sets `guestEmail`.
- **Forgot/reset password already exists and is secure**: SHA-256-hashed tokens, 30-min TTL, one-time use, atomic transaction (`app/_lib/password-reset.ts`, `PasswordResetToken` model, `app/(auth)/actions.ts`). We reuse it; we do not rebuild it.
- Tests: **Vitest** unit tests under `app/**/__tests__/`; **Playwright** E2E under `tests/e2e/` with DB-seeded fixtures (`tests/e2e/fixtures/users.ts`) and form-based login (no `storageState`). `playwright.config.ts` uses `baseURL http://localhost:3000`, `webServer: npm run dev`, `reuseExistingServer: true`.

## 4. Design

### 4.1 Schema change (one migration)

`prisma/schema.prisma` — two field changes on `User`:

```prisma
model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  passwordHash  String?   // was: String  (nullable: Google-only users have no password)
  image         String?   // NEW: Google avatar / profile picture
  role          String    @default("CUSTOMER") @db.VarChar(16)
  ...
}
```

- **`passwordHash String?`** — nullable. "Account created with Google, no password set" is represented by `passwordHash == null`.
- **`image String?`** — stores the Google profile picture (also usable in the header avatar later).
- **No new tables.** No `Account`, `Session`, or `VerificationToken`.

Migration: `npx prisma migrate dev --name auth_nullable_password_and_image`.

**Migration safety — duplicate scan before any backfill.** Before lowercasing existing emails, run a one-time check for case-variant duplicates:

```sql
SELECT lower(email) AS e, count(*) FROM "User" GROUP BY 1 HAVING count(*) > 1;
```

- **Zero rows (expected):** backfill with `UPDATE "User" SET email = lower(email) WHERE email <> lower(email);`.
- **Any rows returned:** **stop and surface** the colliding accounts for a manual merge decision. Never silently collide rows by force-lowercasing. The `@unique` constraint stays the guard; we do not add `citext` in v1.

The dup-scan + backfill is a small, idempotent script (`scripts/normalize-emails.ts`, run once) so production rollout is deterministic and reviewable.

### 4.2 The `normalizeEmail()` helper — one definition, used everywhere

New helper in `app/_lib/validation.ts`:

```ts
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
```

Applied in two ways:

1. **As a Zod transform** on every email field (`LoginSchema`, `SignupSchema`, `RequestResetSchema`, and the checkout guest-info schema): `z.string().trim().toLowerCase().email(...)` — so parsed data is already normalized.
2. **At every raw DB touchpoint** that doesn't go through those schemas — notably the Google `signIn`/`jwt` callbacks (which receive a raw provider profile, not form data).

Touchpoints: signup, login `authorize()`, login pre-read in `loginAction`, reset-request, reset lookup, **checkout order creation** (`guestEmail`), and the **Google callbacks**. This single normalization is what makes create-or-link and guest-order matching reliable.

### 4.3 Google OAuth provider + account linking

`app/_lib/auth.ts` — add the Google provider **conditionally**:

```ts
import Google from "next-auth/providers/google";

const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

providers: [
  Credentials({ /* unchanged */ }),
  ...(googleEnabled ? [Google({ allowDangerousEmailAccountLinking: true })] : []),
]
```

- **Conditional registration:** if `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are absent (local dev, CI without creds), the provider simply isn't added and the UI hides the button — nothing breaks.
- **`allowDangerousEmailAccountLinking: true`** is included for clarity/future-proofing, but note it is **effectively a no-op in this design** — that flag governs *adapter-driven* `Account` linking, and we have no adapter. **The real linking and the real safety are our custom callbacks**, not this flag: the `signIn` `email_verified` gate (`assertGoogleEmailVerified`) plus the create-or-link by normalized email in `linkOrCreateGoogleUser`. Linking a Google-verified email to an existing row is the explicit requirement; the `email_verified` gate is what makes it safe.

**The linking logic — extracted to a pure, testable function** in a new `app/_lib/google-auth.ts`:

```ts
// linkOrCreateGoogleUser(profile): resolves the canonical DB user for a Google login.
// 1. Reject if profile.email_verified !== true.
// 2. email = normalizeEmail(profile.email)
// 3. user = prisma.user.findUnique({ where: { email } })
//    - exists  -> LINK: update name/image if currently blank; KEEP existing role. Return user.
//    - missing -> CREATE: { email, name, image, passwordHash: null, role: "CUSTOMER" }. Return user.
// 4. Guest-order sync (verified email only):
//    prisma.order.updateMany({ where: { userId: null, guestEmail: email }, data: { userId: user.id } })
// Returns the DB user (with cuid id and DB role).
```

This function is the single source of truth for Google linking and is unit-tested for all three scenarios (new email / existing email / existing Google user).

### 4.4 The JWT callback fix (most important correctness item)

With JWT + no adapter, on an OAuth sign-in the `user` object passed to the `jwt` callback is built from **Google's profile**, so `user.id` is Google's `sub` — **not** our `User.id` (cuid). Left unfixed, `token.uid` would hold the Google sub and silently break `/account/orders`, order linking, and route protection (everything keyed on `session.user.id`).

**Where the Prisma-touching callbacks live — Edge safety.** `proxy.ts` does `NextAuth(authConfig).auth`, so **any callback in `auth.config.ts` is bundled into the Edge middleware** and must stay Prisma/bcrypt-free. Therefore:

- **`auth.config.ts` (Edge-safe, used by `proxy.ts`)** keeps its current synchronous `jwt`/`session` callbacks — they only copy `uid`/`role` between an already-minted token and the session. No Prisma. Unchanged.
- **`auth.ts` (Node runtime, the real signing instance used by the route handler and server `auth()`)** supplies its **own** `callbacks` object — which overrides `authConfig.callbacks` via the shallow spread in `NextAuth({ ...authConfig, callbacks: {...} })`. This is where the Google, Prisma-touching logic goes. It must re-declare the `session` callback too (since the override is shallow).

`auth.ts` callbacks:

```ts
callbacks: {
  // Runs at sign-in. Has the full Google `profile` (incl. email_verified).
  async signIn({ account, profile }) {
    if (account?.provider !== "google") return true;        // credentials path untouched
    if (profile?.email_verified !== true) return false;     // defense
    await linkOrCreateGoogleUser(profile);                  // create-or-link + guest-order sync
    return true;
  },
  async jwt({ token, user, account }) {
    if (account?.provider === "google" && token.email) {
      const dbUser = await prisma.user.findUnique({
        where: { email: normalizeEmail(token.email) },
      });
      if (dbUser) { token.uid = dbUser.id; token.role = dbUser.role; } // cuid + DB role, NEVER Google sub / never elevated
    } else if (user && "id" in user) {
      token.uid = user.id as string;                                   // credentials path, unchanged
      token.role = (user as { role?: AppRole }).role === "ADMIN" ? "ADMIN" : "CUSTOMER";
    }
    return token;
  },
  session({ session, token }) { /* same mapping as today: token.uid/role -> session.user */ },
}
```

> The `signIn` callback performs the create-or-link (it has `email_verified`); the `jwt` callback then re-reads the canonical user by normalized email to set `token.uid` (cuid) and `token.role` (DB role). Both run only in `auth.ts` (Node), so Prisma never enters the Edge `proxy.ts` bundle. (See §11 for the Edge-safety build check.)

**Testable seams (this is the highest-risk wiring, so it must be unit-tested, not just E2E'd).** The two Prisma-touching branches are extracted into pure functions in `app/_lib/google-auth.ts`, and the callbacks are thin wrappers over them:

- `assertGoogleEmailVerified(profile): boolean` — the `signIn` gate (`profile.email_verified === true`).
- `resolveGoogleToken(token, account): Promise<{ uid: string; role: AppRole } | null>` — the `jwt` Google branch: normalize `token.email`, look up the DB user, return `{ uid: cuid, role: dbRole }`, or `null` when not a Google account / no email / no match.

This matters because the E2E `mock-google` provider (§7.3) is a Credentials-style shim — it has **no `profile`, no `email_verified`, and `account.provider !== "google"`**, so it deliberately does **not** drive these two branches. Without the extracted seams, the cuid-resolution and verified-email gate would execute in production but be covered by no test. The unit tests in §7.1 call `resolveGoogleToken`/`assertGoogleEmailVerified` directly to close that gap.

**Security guardrail — Google never *grants* ADMIN.** New Google users are always `CUSTOMER`. Linked users keep their existing DB role. The OAuth flow can never elevate a customer to admin.

**Policy decision pending user sign-off (see §10.0):** by default, an admin whose verified Google email matches their admin row *can sign in via Google* — which adds a second auth path to admin accounts (anyone controlling that Google inbox reaches admin). This is **not** a requirements violation (the "keep admin auth separate" ask was conditional on the system already separating them, which it doesn't — admins use the same `/login`). But it is a security-posture choice. The stricter alternative is one line in `signIn`: if the resolved user's `role === "ADMIN"`, return `false` for the Google provider, keeping **admins password-only**. Defaulting to the stricter option is reasonable; the user decides.

### 4.5 Email/password hardening

`app/(auth)/actions.ts` and `app/_lib/auth.ts`:

- `normalizeEmail()` applied in `signupAction`, `loginAction`'s pre-read, the Credentials `authorize()`, and `requestResetAction`.
- **"Account created with Google" message.** `loginAction` already pre-reads the user before `signIn`. Add: if `user exists && user.passwordHash == null`, return the friendly copy *"This account was created with Google. Please continue with Google, or set a password using 'Forgot password'."* — instead of a generic failure.
  - Trade-off (documented, intentional): this is marginally less enumeration-resistant than the current neutral message, but is an explicit spec requirement and is scoped narrowly to the `passwordHash == null` case.
- **"Set a password" for Google users = reuse the existing reset flow.** No new code. A Google-only user clicks "Forgot password" → receives the email → `resetPasswordAction` writes `passwordHash` for the first time (null → value). Afterwards they can use *both* Google and email/password. The reset flow already handles this transition.
- The Credentials `authorize()` must handle `passwordHash == null` gracefully: if null, return `null` (no crash on `bcrypt.compare(password, null)`).

### 4.6 Checkout behavior

`app/checkout/actions.ts` and the checkout client:

- **Normalize the guest email** (`normalizeEmail`) before storing `guestEmail`, so later Google-login sync matches reliably.
- **Soft prompt (unconditional, no enumeration):** show *"Have an account? Log in to track this order faster."* to **all** guests, regardless of whether the email is registered. A *conditional* message (only when the email exists) would leak account existence — rejected. The unconditional version delivers the same UX nudge with zero leak.
- **Guest checkout stays fully non-blocking** even when the entered email belongs to an existing account — unchanged from today. No new gate, no forced login.
- **Logged-in checkout already attaches `userId`** — unchanged; protected by a new E2E assertion.
- **Guest-order sync is Google-only (v1):** it runs in the Google `signIn` path (§4.3 step 4). Password logins deliberately do **not** auto-claim orders. A clearly-commented seam marks where the future "email-verification → link" path (deferred option) plugs in.

### 4.7 Login & signup UI

`app/(auth)/login/page.tsx` and `app/(auth)/signup/page.tsx` — reuse existing brand tokens + shadcn components; mobile-first centered card.

```
┌─────────────────────────────────┐
│           Dressing Bear         │
│         Welcome back 🐻         │
│  ┌───────────────────────────┐  │
│  │  [G]  Continue with Google│  │  ← only when AUTH_GOOGLE_ID is set
│  └───────────────────────────┘  │
│  ───────────  or  ───────────   │
│  Email                          │
│  ┌───────────────────────────┐  │
│  Password          Forgot? →    │
│  ┌───────────────────────────┐  │
│  ┌───────────────────────────┐  │
│  │           Log in          │  │
│  └───────────────────────────┘  │
│  New here?  Create account →    │
│  [friendly error region]        │
└─────────────────────────────────┘
```

- **Friendly error mapping:** a small map from NextAuth/technical codes → human copy (e.g. `CredentialsSignin` → *"Email or password is incorrect."*; `OAuthAccountNotLinked`/`Configuration`/unknown → generic *"Something went wrong. Please try again."*). Raw errors stay in server logs only.
- **`data-testid`** on: Google button, email input, password input, submit button, error region (for stable E2E selectors).
- The signup page gets the same "Continue with Google" option + matching styling.
- The Google button is **fully hidden** when `AUTH_GOOGLE_ID` is unset, so the UI never advertises an unavailable method.

### 4.8 Route protection & redirects

- `/account`, `/account/orders`, `/wishlist`, `/admin` protection via `proxy.ts` + `requireAdmin()` + layout `auth()` checks — **all kept as-is.**
- **Google redirect-back:** the "Continue with Google" button forwards the current `callbackUrl`; NextAuth returns the user there. If none → `/account/orders`.
- **One deliberate behavior change:** `chooseLoginRedirect()` (`app/(auth)/login-redirect.ts`) — a customer with no `callbackUrl` currently lands on `/`; the spec wants `/account/orders`. Update: customer → `callbackUrl` else `/account/orders`; **admin still → `/admin`**. The existing unit test `app/(auth)/__tests__/login-redirect.test.ts` is updated to match.

## 5. File-level change summary

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | edit | `passwordHash String?`; add `image String?` |
| `prisma/migrations/<ts>_auth_nullable_password_and_image/` | new | Migration SQL |
| `scripts/normalize-emails.ts` | new | One-time dup-scan + lowercase backfill |
| `app/_lib/validation.ts` | edit | `normalizeEmail()`; add `.toLowerCase()` transform to email schemas |
| `app/_lib/google-auth.ts` | new | `linkOrCreateGoogleUser(profile)` + guest-order sync, plus the testable seams `assertGoogleEmailVerified(profile)` and `resolveGoogleToken(token, account)` (all pure, unit-tested) |
| `app/_lib/auth.ts` | edit | Conditional Google provider; `authorize()` handles null `passwordHash` + normalize; **Node-runtime `callbacks` override** (`signIn` link/gate, `jwt` DB-cuid/role resolution, `session`) |
| `app/_lib/auth.config.ts` | verify | **No change** — stays Edge-safe (no Prisma); confirm `proxy.ts` bundle excludes Prisma/bcrypt |
| `app/(auth)/actions.ts` | edit | Normalize emails; "created with Google" message in `loginAction` |
| `app/(auth)/login-redirect.ts` | edit | Customer default → `/account/orders` |
| `app/(auth)/login/page.tsx` | edit | Redesigned UI + Google button + `data-testid` + friendly errors |
| `app/(auth)/signup/page.tsx` | edit | Matching UI + Google button |
| `app/checkout/actions.ts` | edit | Normalize `guestEmail` |
| `app/checkout/checkout-client.tsx` | edit | Unconditional "log in to track faster" soft prompt |
| `app/_lib/auth-types.d.ts` | edit (if needed) | Ensure `image` flows through session types |
| `.env.local.example` | edit | Add `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `E2E_MOCK_GOOGLE` (names only) |
| `app/_lib/__tests__/google-auth.test.ts` | new | Link-or-create + sync + no-admin tests, **plus `resolveGoogleToken` (cuid/role) and `assertGoogleEmailVerified` seam tests** |
| `app/_lib/__tests__/normalize-email.test.ts` | new | `normalizeEmail` table tests |
| `app/(auth)/__tests__/login-redirect.test.ts` | edit | New customer default |
| `tests/e2e/customer-auth.spec.ts` | new | Login/signup/forgot/protection/mobile E2E |
| `tests/e2e/customer-checkout.spec.ts` | new | Guest/logged-in/existing-email checkout E2E |
| `tests/e2e/fixtures/users.ts` | edit | Add a Google-style (passwordHash null) seed helper |
| `app/_lib/auth.ts` (mock-google) | edit | Test-only `mock-google` provider, double-gated (see §7) |
| `docs/.../e2e-and-auth-setup.md` | new | Local + CI test/setup + Google Cloud Console steps |

## 6. Environment variables

| Var | Purpose | Status |
|-----|---------|--------|
| `AUTH_GOOGLE_ID` | Google OAuth client ID | **new** |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret | **new** |
| `AUTH_SECRET` | NextAuth JWT signing secret | exists |
| `AUTH_URL` / `APP_URL` | callback base URL | exists |
| `DATABASE_URL` | Prisma datasource | exists |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`, `BRAND_EMAIL` | reset + confirmation email | exists |
| `E2E_MOCK_GOOGLE` | test-only Google bypass (never set in prod) | **new (test-only)** |

- NextAuth v5 auto-detects `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` by convention.
- **Google Cloud Console** authorized redirect URI: `{APP_URL}/api/auth/callback/google` — plus the Vercel preview and production URLs.
- **Vercel:** set `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `AUTH_URL` in Project → Settings → Environment Variables. `AUTH_URL` must match the deployed origin for OAuth callbacks to resolve.

## 7. Testing strategy

### 7.1 Unit (Vitest, `app/**/__tests__/`) — the security-critical core

- **Google linking** (`google-auth.test.ts`): new email → creates CUSTOMER w/ null passwordHash · existing email → links, no duplicate, role preserved · existing Google user → idempotent · **never grants ADMIN** · guest orders with matching `guestEmail` get `userId` set, non-matching untouched.
- **Google token wiring — the highest-risk seams, tested directly** (`google-auth.test.ts`): `resolveGoogleToken` → for a verified-email Google account sets `uid` to the **DB cuid (never Google's `sub`)** and `role` from the **DB row (never elevated)**; returns `null` for a non-Google account, a missing `token.email`, or an email with no matching user. `assertGoogleEmailVerified` → `true` only when `email_verified === true`; rejects `false`/`undefined`. These cover the production code paths the `mock-google` E2E does **not** exercise.
- **Email/password**: `normalizeEmail` table tests · `authorize()` returns null on `passwordHash == null` · `loginAction` returns the "created with Google" message for password-null accounts.
- **Redirect**: updated `login-redirect.test.ts` (customer → `/account/orders`, admin → `/admin`, explicit callbackUrl honored).
- Reset-flow tests already exist; extend if needed for null→value first-set.

### 7.2 E2E (Playwright, `tests/e2e/`) — matches existing fixture/seed style

- `customer-auth.spec.ts`: login page loads · Google button visible when mock enabled / hidden when unset · email+password login works · invalid login → friendly error (and **no** raw/technical error text present) · create-account flow · forgot-password form submits · `/account/orders` redirects anon → `/login?callbackUrl=...` · logged-in user reaches `/account/orders` · **mobile viewport** (e.g. 390×844) renders the card correctly.
- `customer-checkout.spec.ts`: guest checkout (new email) completes · guest checkout with an **existing-account email is not blocked** · logged-in checkout attaches the order to the user (assert it appears on `/account/orders`).
- `admin-auth.spec.ts` (existing) — unchanged; serves as the **admin regression gate**.

### 7.3 Google in CI — deterministic, never hits real Google

A **test-only `mock-google` provider**, registered only when **both** `E2E_MOCK_GOOGLE === "1"` **and** `process.env.NODE_ENV !== "production"` (double-gated; impossible in a prod build). It is a Credentials-style shim whose `authorize` runs the **same `linkOrCreateGoogleUser` + guest-order-sync** code and returns the resolved DB user (cuid + role).

**Scope — what this E2E does and does NOT cover.** Because the shim is Credentials-style, it has no `profile`, no `email_verified`, and `account.provider !== "google"` — so it deliberately does **not** drive the real `signIn` `email_verified` gate or the `jwt` Google-resolution branch. Those two are the **highest-risk wiring and are covered by unit tests instead** (§7.1, via `resolveGoogleToken`/`assertGoogleEmailVerified`). The `mock-google` E2E is therefore scoped to the **app-level flow**: Google button visible → a session is established → the user lands on `/account/orders` → **guest orders synced by email appear**. The real `Google()` provider is never invoked in CI.

Acceptance: `next build` with `E2E_MOCK_GOOGLE` unset must produce a bundle that does **not** register `mock-google` (guard verified).

### 7.4 Commands

- Unit: `npm test` (`vitest run`).
- E2E: `npm run test:e2e` (`playwright test`) — unchanged command; `webServer` auto-starts `npm run dev`.
- Per-phase gate: `npm run build` green (per CLAUDE.md §2).

## 8. Phasing (one `feat/*` branch, `npm run build` green at each step)

1. **Normalization & schema** — `normalizeEmail`, email schema transforms, `passwordHash String?`, `image String?` migration, `scripts/normalize-emails.ts` dup-scan + backfill. Unit: `normalize-email.test.ts`.
2. **Google provider + callbacks** — conditional `Google()`, `linkOrCreateGoogleUser`, `signIn`/`jwt` cuid fix, no-admin guardrail, guest-order sync. Unit: `google-auth.test.ts`.
3. **Password hardening + checkout** — "created with Google" message, null-passwordHash `authorize()`, set-password via reset reuse, checkout email normalization + unconditional soft prompt, `chooseLoginRedirect` default change (+ updated unit test).
4. **UI** — login/signup redesign, Google button, `data-testid`, friendly error mapping.
5. **E2E + docs** — `mock-google` provider, `customer-auth.spec.ts`, `customer-checkout.spec.ts`, fixture helper, setup/docs.

## 9. Risks & mitigations

- **Breaking admin or credentials login** → no adapter, JWT untouched, Credentials provider config unchanged; `admin-auth.spec.ts` is the regression gate.
- **Wrong user id on the Google path** (Google `sub` vs cuid) → `jwt`-callback DB resolution extracted to `resolveGoogleToken` and **unit-tested directly** (the `mock-google` E2E does not exercise this branch — §7.3); app-level E2E additionally asserts a Google-logged-in user sees their orders.
- **Migration collision** when backfilling lowercase → dup-scan first; stop-and-surface on any collision; never force-collide.
- **Privilege escalation via Google** → role always sourced from the DB row; new Google users are CUSTOMER; OAuth cannot elevate.
- **Email enumeration** → unconditional checkout prompt; "created with Google" message scoped to the `passwordHash == null` case only.
- **Edge bundle bloat / bcrypt-in-edge** → Prisma-touching link logic lives in `auth.ts`'s config, not the `proxy.ts` import; verify `next build` keeps `proxy.ts` Edge-safe (no bcrypt/Prisma in the proxy bundle).
- **Test bypass leaking to prod** → `mock-google` double-gated on `E2E_MOCK_GOOGLE` + `NODE_ENV !== production`; build-time assertion.
- **Payment/email/cart regressions** → those internals are not modified; existing PayHere/order-confirmation E2E remain green.

## 10. Open / deferred decisions

- **Email verification on password signup** → deferred. It is the prerequisite for auto-linking guest orders to *password* accounts (spec option B). The sync seam is in place; turning it on for credentials accounts is a follow-up.
- **Explicit "claim an order by number"** path for password users → deferred (spec option C); not needed once email verification lands.
- **`citext` / functional unique index** for emails → not in v1; lowercase-on-write + backfill + `@unique` is sufficient. Revisit only if non-normalized writes are ever observed.
- **Linking the Google avatar into the header/profile UI** → `image` is stored now; surfacing it is a later UI tweak.
- **Account "linked methods" management UI** (show "Google connected", set/change password from account page) → nice-to-have follow-up; v1 routes password-setting through the existing Forgot-password flow.

## 11. Caveats (carried forward)

- **JWT TTL is 30 days.** Role/password changes don't retroactively invalidate live tokens (e.g. a freshly set password doesn't force re-login). Acceptable for this store; same caveat as the admin-roles spec.
- **`allowDangerousEmailAccountLinking`** does no protective work here (no adapter → no adapter-driven `Account` linking for it to govern); safety comes from our `email_verified` gate + custom `signIn`/`jwt` callbacks. If an adapter or a second OAuth provider is ever added, this flag and cross-provider linking-by-email across *untrusted* providers must be re-evaluated.
- **Credentials provider requires JWT sessions.** This is the hard constraint that fixes the whole architecture; do not migrate to DB sessions without first replacing the Credentials provider.

## 12. Acceptance criteria

### 10.0 Admin-via-Google policy — **needs user sign-off before implementation**

Does a Google login whose verified email matches an existing **admin** account grant admin access?

- **Option A (default in this spec):** yes — admins may also sign in with Google. Simpler; adds a second auth path to admin accounts.
- **Option B (stricter, recommended for admin safety):** no — `signIn` returns `false` when the resolved user is `ADMIN`, so **admins remain password-only** and the customer Google flow can never touch an admin account. One extra line.

This is the one decision with a security trade-off; the rest of the spec is settled. Default chosen pending the user's call.

---

The spec is implementable / done when:

1. `User.passwordHash` is nullable and `User.image` exists; existing rows migrated; no case-variant duplicate emails remain (or they were surfaced and resolved).
2. "Continue with Google" appears on `/login` (when `AUTH_GOOGLE_ID` is set) and completes a login that creates-or-links by normalized email, with **no duplicate** account.
3. A Google login resolves `session.user.id` to the **DB cuid**, so `/account/orders` shows that user's orders (incl. guest orders synced by verified email).
4. A new Google user is `CUSTOMER`; Google sign-in never yields `role === "ADMIN"`.
5. Email/password login, signup, forgot-password, and reset still work; emails are case-insensitive end-to-end.
6. A password-null (Google-only) login attempt shows the "created with Google / set a password" message; setting a password via Forgot-password then enables email/password login.
7. Guest checkout works, is not blocked by an existing-account email, shows the soft prompt; logged-in checkout attaches `userId`.
8. Admin login and `/admin` protection are unchanged (`admin-auth.spec.ts` green).
9. `npm run build`, `npm test`, and `npm run test:e2e` all pass; CI never contacts real Google.
