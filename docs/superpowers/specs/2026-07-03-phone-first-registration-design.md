# Phone-First Customer Registration — Design

**Date:** 2026-07-03
**Status:** Draft — pending implementation plan
**Branch:** `feat/phone-first-registration` (single branch, phased)

---

## 1. Goal

Let customers register and sign in with a **phone number as the primary identifier**, so people who don't have (or don't want to use) email can still create an account. Concretely:

- **Signup is phone-first:** phone required and **verified via a 6-digit SMS OTP** (Notify.lk), plus `name` and `password`. **Email becomes optional.**
- **Login accepts either phone or email** + password — one identifier field, one lookup.
- **Password reset works by phone** (SMS OTP) as well as the existing email link.
- **Existing email-only customers are unaffected** — they keep logging in by email and can add a phone later.
- All of this lands **without** disturbing admin login, guest checkout, order creation, the PayHere/Koko/MintPay payment flow, the Curfox courier integration, or the cart.

The store serves a Sri Lankan market where the order domain is already phone-centric (`Order.customerPhone` is required, `guestEmail` optional), so extending phone from *contact channel* to *identity* is consistent with existing modeling.

## 2. Non-goals

- **Email is not removed.** It stays as an optional login method, an optional recovery channel, and the carrier for the existing HTML transactional emails (order confirmation, dispatch, cancellation, admin alerts). We make it *optional*, not gone. Removing it would break the email comms machinery and force a hard migration — explicitly rejected during brainstorming.
- **No forced migration of existing users.** Current accounts keep working by email; no "add a phone before you can continue" wall.
- **No SMS order confirmations in this change.** Phone-only customers currently receive no order receipt (receipts are HTML email). Closing that gap with an SMS receipt is a **recommended follow-up** (see §10), not part of this spec — it is an order-comms concern, not an identity concern.
- **No SMS for marketing.** Notify.lk is used strictly for transactional OTP (signup verification + password reset).
- **No passwordless / OTP-only login.** Password is still required; OTP proves phone ownership, it does not replace the password.
- **No admin-side changes.** Admin bootstrap and admin login stay email/password. Phone is a customer-facing identifier.
- **No change to payment, courier, or cart internals.**

## 3. Constraints from the existing codebase

- **NextAuth v5**, **JWT session strategy** (`session.strategy = "jwt"`, 30-day `maxAge`), no DB adapter. **Credentials provider** with `bcryptjs` (cost 10) in `app/_lib/auth.ts`.
- **Edge/runtime split is load-bearing:** route protection lives in `proxy.ts` and imports only `auth.config.ts` (`providers: []`, no Prisma/bcrypt) so it stays Edge-safe. All Prisma/bcrypt (and now the phone-or-email lookup + SMS) live in `auth.ts` / server actions / `app/_lib/*` (Node runtime). This split is preserved.
- **Prisma + PostgreSQL.** String-typed status/role fields by convention (no Prisma enums).
- **No local database in this workspace.** `DATABASE_URL` is unset here, so `prisma migrate dev` and `next build` prerender cannot run locally. Migrations are **hand-authored SQL** applied through the repo's decoupled `.github/workflows/migrate.yml` flow (see `2026-06-04-decouple-db-migrate-from-build-design.md` and README). Local validation gate is **`npm run test` (Vitest) + `tsc --noEmit` typecheck**, not `next build`.
- **`User.email` is `String @unique`, non-nullable today.** `User.passwordHash` is `String?` (nullable — Google-only users, from the prior auth change). There is **no phone field on `User`** today.
- **`LkPhoneSchema` already exists** (`app/_lib/validation.ts`): it accepts `0771234567`, `+94771234567`, `94771234567`, `771234567` and strips separators — but it **does not canonicalize the prefix**, so those forms remain distinct strings. It also accepts landlines (`011…`), which cannot receive SMS.
- **`Order.customerPhone` is required; `guestEmail`/`guestName` optional.** Checkout already treats phone as the required contact field.
- **Email is currently normalized to lowercase** on write via `normalizeEmail()` (prior auth change), and the login/signup/reset flows preserve **neutral, enumeration-resistant messaging**.
- **Existing SMTP mailer** (`app/_lib/mailer.ts`) uses Brevo as the SMTP relay; all customer/admin transactional email routes through it. `sendOrderConfirmationEmail`, `sendCustomerDispatchEmail`, `sendCustomerCancellationEmail` all send **to `order.customerEmail`**.
- Tests: **Vitest** under `app/**/__tests__/`; **Playwright** E2E under `tests/e2e/` with DB-seeded fixtures and form-based login.

## 4. Design

### 4.1 Schema changes (one hand-authored migration)

`prisma/schema.prisma`:

```prisma
model User {
  id              String    @id @default(cuid())
  name            String
  email           String?   @unique   // was: String @unique  → now OPTIONAL (nullable, still unique when present)
  phone           String?   @unique   // NEW — canonical E.164 (+94XXXXXXXXX); null for legacy rows
  phoneVerifiedAt DateTime?           // NEW — set when the signup OTP is verified
  passwordHash    String?             // unchanged (already nullable)
  role            String    @default("CUSTOMER") @db.VarChar(16)
  ...
}

model PhoneChallenge {                // NEW — mirrors the PasswordResetToken pattern
  id         String   @id @default(cuid())
  phone      String                   // canonical E.164 target
  codeHash   String                   // sha256 of the 6-digit code (raw code never stored)
  purpose    String   @db.VarChar(16) // "SIGNUP" | "RESET"
  payload    String?                  // SIGNUP only: JSON { name, passwordHash, email } for the pending account
  attempts   Int      @default(0)
  expiresAt  DateTime                 // createdAt + 10 min
  consumedAt DateTime?
  createdAt  DateTime @default(now())

  @@index([phone, purpose])
  @@index([expiresAt])
}
```

- PostgreSQL allows **multiple `NULL`s under a unique index**, so legacy email-only rows (null `phone`) don't collide, and phone-only rows (null `email`) don't collide either.
- **Migration SQL (hand-authored)** does three things and backfills nothing:
  1. `ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;`
  2. `ALTER TABLE "User" ADD COLUMN "phone" TEXT, ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);` + `CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");`
  3. `CREATE TABLE "PhoneChallenge" (...)` + its indexes.
- Existing rows: `phone`/`phoneVerifiedAt` stay `NULL`, `email` stays populated — they are untouched and keep logging in by email.

### 4.2 Phone canonicalization (the subtle bug-magnet)

The uniqueness guarantee is only as good as the canonical form. `LkPhoneSchema` validates but leaves the prefix as-typed, so `0771234567` / `+94771234567` / `771234567` would become **three unique keys for one phone**. Add a single normalizer:

```ts
// app/_lib/phone.ts
// Canonical form = E.164: "+94" + 9-digit subscriber number.
export function canonicalizeLkPhone(raw: string): string {
  const digits = raw.replace(/[\s()-]/g, "").replace(/^\+/, ""); // strip separators + leading '+'
  const local = digits.replace(/^94/, "").replace(/^0/, "");     // drop 94 or leading 0 → 9-digit subscriber
  return `+94${local}`;
}
```

- **One definition, used everywhere** a phone is stored or compared: signup, login lookup, reset lookup, and the SMS target derivation.
- **Storage + uniqueness check** use the `+94…` form. **Notify.lk** wants `94XXXXXXXXX` (no `+`), so the SMS client strips the `+` at send time.
- **Mobile-only for OTP:** `LkPhoneSchema` accepts landlines (`011…`), which can't receive SMS and would dead-end signup. Signup validation additionally requires a **mobile** number (subscriber begins `7`, i.e. `+947XXXXXXXX`). Add a `LkMobileSchema` (or a `.refine` on the existing schema) used specifically by signup/reset; landlines are rejected with a clear message.
- Unit-tested with a table: every accepted input form → exactly one canonical key; landline → rejected.

### 4.3 SMS client — `app/_lib/sms.ts` (mirrors `mailer.ts`)

A small, isolated Notify.lk client:

```ts
// Reads env: NOTIFY_LK_USER_ID, NOTIFY_LK_API_KEY, NOTIFY_LK_SENDER_ID
// POST https://app.notify.lk/api/v1/send  with { user_id, api_key, sender_id, to, message }
//   to = canonical phone with '+' stripped (94XXXXXXXXX)
// Throws on non-success (caller decides). Structured error log like logMailerError.
export async function sendOtpSms(phone: string, code: string, purpose: "SIGNUP" | "RESET"): Promise<void>;
```

- **Secrets only in env** — `NOTIFY_LK_API_KEY` is never in code or git. The key shown in the dashboard during brainstorming should be **regenerated** before launch.
- A **test transport seam** like `mailer.ts`'s `__setTestTransport` so unit tests never hit the network and assert on the payload.
- Message copy is short and branded, e.g. `"Your Dressing Bear code is 123456. Valid 10 minutes."`
- Exact endpoint/param names confirmed against Notify.lk docs during implementation; the client is the single place that shape lives.

### 4.4 OTP challenge lifecycle — `app/_lib/phone-challenge.ts`

Mirrors `password-reset.ts`. Parameters (bound to cap SMS cost and abuse):

- **6-digit numeric** code; **sha256-hashed** at rest (raw code only ever in the SMS).
- **10-minute expiry**; **max 5 verify attempts** per challenge (then invalidated); **60-second resend cooldown**; **cap of N sends per phone per rolling hour** (rate limit).
- `issueChallenge({ phone, purpose, payload? })` → creates the row, sends SMS via `sendOtpSms`; on SMS failure, deletes the row so no dangling challenge (same pattern as `issuePasswordReset`).
- `verifyChallenge({ phone, purpose, code })` → finds the active (unconsumed, unexpired) challenge, compares hash, increments/checks attempts, marks `consumedAt`. Returns the `payload` for SIGNUP.

### 4.5 Signup flow (two steps, one page) — enumeration-safe

**Step 1 — details.** User submits `name`, `phone`, `password`, and *optional* `email`. Server action:
1. Validate with a phone-first signup schema (mobile-only, §4.2); canonicalize the phone.
2. Look up whether a **verified** account already owns that phone.
3. **Always respond identically** ("We sent a code to your phone — enter it below") and **always advance the UI to the code-entry step**, regardless of registration state. This is what keeps the web layer enumeration-safe.
   - **If the phone already belongs to a verified account:** send an SMS that says *"You already have a Dressing Bear account — log in or reset your password."* and create **no usable SIGNUP challenge**. The owner learns the truth via SMS (fine — only they receive it); an attacker probing the number sees the same neutral web response and cannot distinguish.
   - **If the phone is free:** hash the password, create a `SIGNUP` `PhoneChallenge` whose `payload` holds `{ name, passwordHash, email }`, and send the 6-digit code.
   - **Optional-email collision:** if an email was supplied and already belongs to another account, do **not** attach it — fall back to the same neutral "code sent" response and either omit the email from the payload or surface a neutral message, consistent with the existing signup enumeration stance. (Email is optional; a collision must never leak or hard-fail the phone signup.)

**Step 2 — verify.** User enters the code:
- `verifyChallenge({ phone, purpose: "SIGNUP", code })`. On success, **create the `User`** from `payload` with `phone` (canonical), `phoneVerifiedAt = now`, optional `email`, `passwordHash`, `role: "CUSTOMER"`; consume the challenge; **auto-sign-in** and redirect (same as today's signup).
- Wrong code → decrement remaining attempts, friendly error. **Resend** available after the cooldown.
- **Concurrency:** two SIGNUP challenges for the same phone can coexist (no `User` row yet). First verify wins and creates the row; a second verify then hits the `phone` unique constraint — caught and shown the neutral *"already registered — please log in"* path (same as the already-verified branch). No duplicate account is ever created.

**Why create the User only after verification:** abandoned/failed signups leave no half-accounts, and we never expose "this number is taken" before ownership is proven. The pending `passwordHash`/name/email ride in the challenge `payload`.

### 4.6 Login — phone OR email (three concrete touchpoints)

Login resolves the user by **canonical phone or normalized email**, then bcrypt-compares as today. The three hard-coded-email sites that must change (enumerated so the plan sequences them):

1. **`app/_lib/validation.ts` (`LoginSchema`, lines ~22–25).** Today `email: z.string().email(...)` — `.email()` rejects a phone. Replace the `email` field with a generic **`identifier`** field (a non-empty string) and resolve its type (phone vs email) in the action/authorize. Add a helper `resolveIdentifier(raw)` → `{ kind: "phone" | "email", value: canonical }`.
2. **`app/_lib/auth.ts` Credentials provider (config + `authorize`, lines ~45–60).** The `credentials` field becomes `identifier` (label "Phone or email"). `authorize()` calls `resolveIdentifier`, then `prisma.user.findUnique({ where: kind === "phone" ? { phone } : { email } })`, then the existing bcrypt compare + null-`passwordHash` guard. Runs in Node (`auth.ts`), so Prisma stays out of the Edge `proxy.ts` bundle.
3. **`app/(auth)/actions.ts` `loginAction` role pre-read (lines ~105–108).** Today it pre-reads role by `email` before `signIn` (JWT-cookie-not-yet-visible workaround). Change to the same `resolveIdentifier` → phone-or-email `findUnique`. `chooseLoginRedirect` is unchanged.

Neutral "invalid phone/email or password" messaging is preserved on all failure branches.

### 4.7 Password reset — phone SMS or email link

`forgot-password` accepts a single **identifier** (phone or email), resolved by `resolveIdentifier`:
- **Phone →** issue a `RESET` `PhoneChallenge`, send the code by SMS; a verify step accepts the code and lets the user set a new password (reusing the `ResetPasswordSchema` password rules). Neutral response regardless of whether the phone is registered.
- **Email →** the **existing** SHA-256 token link flow (`issuePasswordReset` → `sendPasswordResetEmail`), unchanged.
- Both paths keep the current neutral copy ("If an account with that phone/email exists, you'll receive a code/link shortly.").

### 4.8 Email-optional ripple (must-not-crash list)

Making `email` nullable means every path assuming it exists must guard against `null`. Enumerated so none silently null-crashes a mailer call:

- **`sendOrderConfirmationEmail` / `sendCustomerDispatchEmail` / `sendCustomerCancellationEmail`** — all send `to: order.customerEmail`. When a customer has no email, these are **skipped, not called** (guard at the call sites in `app/checkout/actions.ts` and `app/admin/orders/actions.ts`). Checkout already `try/catch`-wraps sends so orders never fail on email; the change makes the null-skip explicit and adds a log line ("order confirmation skipped — no customer email").
- **`sendPasswordResetEmail`** — only reached on the email reset branch (§4.7), which by definition has an email. No change needed, but the phone branch must not fall through to it.
- **Admin alert / dispatch-to-brand emails** send to `BRAND_EMAIL` (not the customer) — unaffected.
- **Profile / account pages** that render or edit `email` must handle `null` (show "Add an email" affordance rather than an empty field). `ProfileSchema` makes email optional.
- **Order confirmation still records `customerEmail` when present**; the order flow already tolerates guest orders without a user.

### 4.9 UI

- **Signup page** (`app/(auth)/signup/page.tsx`): phone (with a short "we'll text you a code" hint) + name + password + an **optional** email field clearly marked optional; on submit, swap to a **6-digit code entry** panel with a resend link + cooldown timer. Reuse existing brand tokens / shadcn components; `data-testid` on phone input, email input, password input, submit, code input, verify button, error region.
- **Login page** (`app/(auth)/login/page.tsx`): the email field becomes **"Phone or email"**; everything else (Google button when enabled, forgot-password link, layout) stays.
- **Forgot-password page:** identifier field labelled "Phone or email"; phone path shows the code-entry + new-password panel.
- Copy stays customer-friendly; raw errors stay in server logs.

## 5. File-level change summary

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | edit | `email String?`; add `phone String? @unique`, `phoneVerifiedAt DateTime?`; add `PhoneChallenge` model |
| `prisma/migrations/<ts>_phone_first_registration/` | new | Hand-authored SQL: email nullable, add phone columns + unique index, create `PhoneChallenge` |
| `app/_lib/phone.ts` | new | `canonicalizeLkPhone()` + `resolveIdentifier()` (pure, unit-tested) |
| `app/_lib/validation.ts` | edit | `LkMobileSchema` (mobile-only); phone-first `SignupSchema`; `LoginSchema` → `identifier`; `RequestResetSchema` → identifier; `ProfileSchema` email optional |
| `app/_lib/sms.ts` | new | Notify.lk client `sendOtpSms()` + test transport seam |
| `app/_lib/phone-challenge.ts` | new | `issueChallenge()` / `verifyChallenge()` — OTP lifecycle (hash, expiry, attempts, cooldown) |
| `app/_lib/auth.ts` | edit | Credentials `identifier` field; `authorize()` phone-or-email lookup + existing bcrypt/null guards |
| `app/(auth)/actions.ts` | edit | Two-step `signupAction` (issue + verify), `loginAction` phone-or-email pre-read, reset action phone branch |
| `app/(auth)/signup/page.tsx` | edit | Phone-first form + optional email + code-entry step + resend |
| `app/(auth)/login/page.tsx` | edit | "Phone or email" identifier field |
| `app/(auth)/forgot-password/page.tsx` | edit | Identifier field + phone code-entry + new-password panel |
| `app/checkout/actions.ts` | edit | Skip confirmation email when `customerEmail` is null (explicit guard + log) |
| `app/admin/orders/actions.ts` | edit | Same null-email guard for dispatch/cancellation emails |
| account/profile pages | edit | Render/edit optional email (null-safe) |
| `.env.local.example` | edit | Add `NOTIFY_LK_USER_ID`, `NOTIFY_LK_API_KEY`, `NOTIFY_LK_SENDER_ID` (names only) |
| `app/_lib/__tests__/phone.test.ts` | new | Canonicalization table + identifier resolution + landline rejection |
| `app/_lib/__tests__/phone-challenge.test.ts` | new | Issue/verify/expiry/attempts/cooldown; SMS mocked |
| `app/(auth)/__tests__/signup-phone.test.ts` | new | Happy path, wrong code, resend, already-registered neutral path, concurrent-verify |
| `app/(auth)/__tests__/login-identifier.test.ts` | new | Phone login, email login, invalid identifier |
| `app/_lib/__tests__/mailer-null-email.test.ts` | new | Confirmation/dispatch/cancellation skip when email null |
| `tests/e2e/phone-signup.spec.ts` | new | Two-step signup + phone login E2E (SMS mocked) |

## 6. Environment variables

| Var | Purpose | Status |
|-----|---------|--------|
| `NOTIFY_LK_USER_ID` | Notify.lk API user id | **new** |
| `NOTIFY_LK_API_KEY` | Notify.lk API key (regenerate the brainstorm-exposed one) | **new** |
| `NOTIFY_LK_SENDER_ID` | Approved Notify.lk sender id (e.g. `DBEAR`) | **new** |
| `AUTH_SECRET`, `AUTH_URL`/`APP_URL`, `DATABASE_URL` | NextAuth / base URL / Prisma | exist |
| `SMTP_*`, `BRAND_EMAIL` | email reset + confirmation | exist |

- **Sender ID** must be approved in the Notify.lk dashboard before production OTP delivers; `NotifyDEMO` is available for testing.
- **Vercel:** set the three `NOTIFY_LK_*` vars in Project → Settings → Environment Variables.

## 7. Testing strategy

Local gate = **`npm run test` (Vitest) + `tsc --noEmit`** (no local DB → no `next build` prerender; no `prisma migrate dev`). SMS and email are mocked; nothing hits Notify.lk or Brevo.

**Unit (Vitest):**
- **Canonicalization** (`phone.test.ts`): all input forms → one `+94…` key; `resolveIdentifier` classifies phone vs email; landline rejected by `LkMobileSchema`.
- **Challenge lifecycle** (`phone-challenge.test.ts`): issue creates + sends; verify success consumes; wrong code decrements; expiry rejects; attempts cap invalidates; SMS-failure deletes the row.
- **Signup** (`signup-phone.test.ts`): happy path creates a verified user + auto-login; wrong code; resend cooldown; **already-verified phone → neutral "code sent" web response + no dup**; concurrent verify → second hits unique, neutral path, no dup.
- **Login** (`login-identifier.test.ts`): phone login, email login (existing user), null-`passwordHash` guard, invalid identifier → neutral error.
- **Mailer null-email** (`mailer-null-email.test.ts`): confirmation/dispatch/cancellation are skipped (not thrown) when `customerEmail` is null.

**E2E (Playwright):** `phone-signup.spec.ts` — signup details → code-entry (test injects the code via a mocked SMS transport / test hook) → verified + logged in; then log out and log back in **by phone**; assert `/account/orders` reachable. Existing `admin-auth.spec.ts` is the admin regression gate.

## 8. Phasing (one `feat/*` branch; `tsc` + `npm run test` green at each step)

1. **Foundation** — `phone.ts` (canonicalize + resolveIdentifier + `LkMobileSchema`); schema change + hand-authored migration; email-optional mailer null-guards. Unit: `phone.test.ts`, `mailer-null-email.test.ts`.
2. **SMS + challenge** — `sms.ts` (Notify.lk client + test seam), `phone-challenge.ts` (OTP lifecycle). Unit: `phone-challenge.test.ts`.
3. **Signup** — two-step `signupAction` + signup UI + code-entry, enumeration-safe already-registered handling. Unit + E2E.
4. **Login + reset** — `LoginSchema`→identifier, `authorize()` + `loginAction` phone-or-email, forgot-password phone branch, UI labels. Unit + E2E.

Each phase is independently reviewable; phases 1–2 are pure infra with no user-visible change.

## 9. Risks & mitigations

- **Duplicate phone accounts from prefix variants** → single `canonicalizeLkPhone()` used at every store/compare site; table-tested; DB `@unique` is the backstop.
- **Account enumeration on signup** → identical neutral web response + always-advance-to-code-entry; registration state only ever revealed via SMS to the number's owner (§4.5).
- **`email`-null crashes** in mailers → explicit null-skip guards at every customer-email send site; `mailer-null-email.test.ts` locks it in (§4.8).
- **SMS cost / abuse** → 60-sec resend cooldown + per-phone hourly send cap + 5-attempt verify cap; OTP is transactional-only.
- **Landline signups dead-ending** → `LkMobileSchema` rejects non-mobile at step 1.
- **Notify.lk delivery failure / sender-ID not approved** → `issueChallenge` deletes the dangling challenge and surfaces a friendly "couldn't send a code, try again" error; sender-ID approval is a launch prerequisite (§6).
- **Edge bundle safety** → all Prisma/SMS/bcrypt stays in `auth.ts` / actions / `_lib`, never in `auth.config.ts` (the `proxy.ts` import).
- **Existing user disruption** → email login path and email reset path are untouched; `admin-auth.spec.ts` + an email-login E2E are the regression gates.
- **Concurrent same-phone signups** → first verify wins; second caught on unique violation → neutral path; never a duplicate.

## 10. Open / deferred decisions

- **SMS order confirmation for phone-only customers** → **recommended follow-up**, not in this spec. Today a phone-only customer gets no receipt (receipts are HTML email). A short Notify.lk SMS on order placement would close the gap; it's an order-comms change, scoped separately to keep this one focused on identity.
- **Verifying a phone added later by an existing (email) user** → the account page could let email users add + OTP-verify a phone. The `PhoneChallenge` machinery supports it; wiring the account-page affordance is a small follow-up.
- **Matching guest orders to a new phone account** (`Order.customerPhone` already exists) → deferred; analogous to the Google guest-order sync but phone-keyed.
- **Rate-limit store** → the per-hour send cap can start as a simple DB count over `PhoneChallenge.createdAt`; a dedicated limiter is a later optimization.

## 11. Acceptance criteria

The spec is implementable / done when:

1. `User.email` is nullable (still unique when present); `User.phone` (unique) and `User.phoneVerifiedAt` exist; the hand-authored migration applies cleanly through the decoupled migrate flow; existing rows are untouched and still log in by email.
2. A new customer can sign up with **phone + name + password (no email)**, receives a 6-digit SMS code, and on verifying it gets a logged-in, `phoneVerifiedAt`-stamped account — with **no half-account** left behind if they abandon before verifying.
3. Every accepted phone input form maps to **one** canonical `+94…` key; a second signup with a prefix-variant of a registered number cannot create a duplicate.
4. Signup is **enumeration-safe**: probing a registered vs unregistered number yields the same web response; only the number's owner learns the difference (by SMS).
5. Login works with **either phone or email** + password; existing email-only users are unaffected; neutral failure messaging preserved.
6. Password reset works **by phone (SMS OTP)** and by the existing **email link**; both neutral.
7. Order confirmation / dispatch / cancellation emails are **skipped, not crashed**, for customers without an email; orders still succeed.
8. `NOTIFY_LK_*` secrets live only in env; the brainstorm-exposed API key is regenerated; sender ID approved.
9. Admin login and `/admin` protection are unchanged (`admin-auth.spec.ts` green); `npm run test` + `tsc --noEmit` pass.
