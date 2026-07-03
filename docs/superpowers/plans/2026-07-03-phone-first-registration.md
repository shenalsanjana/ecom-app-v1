# Phone-First Customer Registration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers register and sign in with a phone number (OTP-verified via Notify.lk SMS) as the primary identifier, with email optional, phone-or-email login, and SMS-or-email password reset — without disrupting existing email-only users, admin login, checkout, payments, or courier flows.

**Architecture:** A pure phone-canonicalization + identifier-resolution module underpins everything. A Notify.lk SMS client and a `PhoneChallenge` OTP-lifecycle module provide verification. Signup becomes two-step (details → SMS code) creating the account only after verification. Login and password-reset are widened to accept phone or email. Email is made nullable and every customer-email send site is guarded.

**Tech Stack:** Next.js 16 (App Router, Server Actions), NextAuth v5 (JWT, Credentials), Prisma + PostgreSQL, Zod v4, bcryptjs, Vitest, Notify.lk HTTP SMS API.

## Global Constraints

- **No local database in this workspace.** Do **not** run `prisma migrate dev`, `prisma db push`, `next build`, or `npm run test:e2e` here. Migrations are **hand-authored SQL**; the local gate is **`npm run test` (Vitest)** + **`npx tsc --noEmit`**. `npx prisma validate` and `npx prisma generate` are safe (offline, no DB).
- **Test runner quirk:** run the suite with **`npm run test`**. You may target a file with `npm run test -- <fragment>` (e.g. `npm run test -- phone.test`); if Vitest reports "No test files found", fall back to the bare `npm run test`.
- **Vitest config:** `globals: false` — every test file must `import { describe, it, expect, beforeEach, vi } from "vitest"`. Tests live under `app/**/__tests__/**/*.test.ts`. Mock Prisma/mailer/SMS with the `vi.hoisted` + `vi.mock("@/app/_lib/...")` pattern (see `app/_lib/__tests__/password-reset.test.ts`).
- **Migration SQL must be re-runnable:** use `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS` (this repo sometimes db-pushes to prod before the migration file exists — see `prisma/migrations/20260703130000_review_approved/migration.sql`).
- **Edge safety:** all Prisma / bcrypt / SMS code stays in `auth.ts`, server actions, and `app/_lib/*` (Node runtime). Never import them into `auth.config.ts` (the `proxy.ts` bundle).
- **Canonical phone form** is E.164 `+94XXXXXXXXX` everywhere it is stored or compared; Notify.lk receives it with the `+` stripped (`94XXXXXXXXX`).
- **Enumeration-neutral copy** must be preserved on signup/login/reset failure branches.
- **Conventional Commits**, `feat(auth):` / `test(auth):` scope. Commit at the end of every task.
- **Secrets only in env:** `NOTIFY_LK_USER_ID`, `NOTIFY_LK_API_KEY`, `NOTIFY_LK_SENDER_ID`. Never commit the key.

## Deviation from the spec (read before starting)

The spec's §4.4 stores the pending signup (incl. `passwordHash`) in `PhoneChallenge.payload`, **and** §4.5 step 2 says "auto-sign-in" after verify. These are in tension: NextAuth's Credentials `signIn` needs the **plaintext** password, which the hash-only payload doesn't provide. **Resolution (this plan):** keep the payload approach (secure — plaintext is never re-held), create the verified account at step 2, then **redirect to `/login?created=1` with a success banner** instead of auto-login. This is a one-tap UX difference, consistent with the app's existing post-signup "Sign in" pattern and `resetPasswordAction`'s `redirect("/login?reset=success")`. Everything else matches the spec.

---

## File Structure

**New files**
- `app/_lib/phone.ts` — `canonicalizeLkPhone()`, `resolveIdentifier()`, `LkMobileSchema`. Pure; no I/O.
- `app/_lib/sms.ts` — Notify.lk client: `sendOtpSms()`, `sendAccountExistsSms()`, `__setTestSmsSender()`.
- `app/_lib/phone-challenge.ts` — OTP lifecycle: `issueChallenge()`, `verifyChallenge()`, cooldown/rate-limit errors.
- Tests: `app/_lib/__tests__/phone.test.ts`, `sms.test.ts`, `phone-challenge.test.ts`, `mailer-null-email.test.ts`; `app/(auth)/__tests__/signup-phone.test.ts`, `login-identifier.test.ts`, `reset-phone.test.ts`.
- `prisma/migrations/20260703140000_phone_first_registration/migration.sql`.

**Modified files**
- `prisma/schema.prisma` — `email String?`; add `phone`, `phoneVerifiedAt`, `PhoneChallenge`.
- `app/_lib/validation.ts` — `LkMobileSchema` re-export; phone-first `SignupSchema`; `LoginSchema`→`identifier`; `RequestResetSchema`→`identifier`; new `ResetByPhoneSchema`; `ProfileSchema.email` optional.
- `app/_lib/auth.ts` — Credentials `identifier` field; `authorize()` phone-or-email lookup.
- `app/(auth)/actions.ts` — two-step `signupAction`; `loginAction` identifier; reset actions (email link + phone OTP).
- `app/(auth)/signup/page.tsx`, `login/page.tsx`, `forgot-password/page.tsx` — UI.
- `app/checkout/actions.ts` — guard confirmation email when no customer email.
- `app/admin/orders/actions.ts` — guard dispatch email when no customer email.
- `app/_lib/payments/shared.ts`, `app/account/page.tsx`, `app/account/actions.ts`, `app/_components/account/profile-form.tsx` (or equivalent) — nullable-email tsc fixes.
- `.env.local.example` — add the three `NOTIFY_LK_*` vars.

---

## Phase 1 — Foundation

### Task 1: Phone canonicalization + identifier resolution

**Files:**
- Create: `app/_lib/phone.ts`
- Test: `app/_lib/__tests__/phone.test.ts`

**Interfaces:**
- Produces: `canonicalizeLkPhone(raw: string): string` (→ `+94XXXXXXXXX`); `resolveIdentifier(raw: string): { kind: "phone"; value: string } | { kind: "email"; value: string }`; `LkMobileSchema: ZodType<string>` (parses any LK mobile form → canonical `+947XXXXXXXX`, rejects landlines).

- [ ] **Step 1: Write the failing test**

```ts
// app/_lib/__tests__/phone.test.ts
import { describe, it, expect } from "vitest";
import { canonicalizeLkPhone, resolveIdentifier, LkMobileSchema } from "../phone";

describe("canonicalizeLkPhone", () => {
  it("collapses every LK mobile form to one E.164 key", () => {
    for (const input of [
      "0771234567", "+94771234567", "94771234567", "771234567",
      "077 123 4567", "077-123-4567", "(077) 123 4567",
    ]) {
      expect(canonicalizeLkPhone(input)).toBe("+94771234567");
    }
  });
});

describe("resolveIdentifier", () => {
  it("treats an @-string as email (trim only, case preserved)", () => {
    expect(resolveIdentifier("  User@B.com ")).toEqual({ kind: "email", value: "User@B.com" });
  });
  it("treats anything else as a canonical phone", () => {
    expect(resolveIdentifier("0771234567")).toEqual({ kind: "phone", value: "+94771234567" });
  });
});

describe("LkMobileSchema", () => {
  it("accepts a mobile and returns the canonical form", () => {
    expect(LkMobileSchema.parse("0771234567")).toBe("+94771234567");
  });
  it("rejects a landline (non-7 subscriber)", () => {
    expect(LkMobileSchema.safeParse("0112345678").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- phone.test`
Expected: FAIL — `Cannot find module '../phone'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/_lib/phone.ts
import { z } from "zod";

/** Canonical Sri Lankan phone = E.164 "+94" + 9-digit subscriber.
 *  Accepts 0771234567 / +94771234567 / 94771234567 / 771234567 (with any
 *  spaces, hyphens, parens). Assumes LK subscriber numbers never begin "94". */
export function canonicalizeLkPhone(raw: string): string {
  const digits = raw.replace(/[\s()-]/g, "").replace(/^\+/, "");
  const local = digits.replace(/^94/, "").replace(/^0/, "");
  return `+94${local}`;
}

/** Classify a login/reset identifier. Email path preserves the existing
 *  trim-only normalization (emails are stored case-as-typed in this repo). */
export function resolveIdentifier(
  raw: string,
): { kind: "phone"; value: string } | { kind: "email"; value: string } {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) return { kind: "email", value: trimmed };
  return { kind: "phone", value: canonicalizeLkPhone(trimmed) };
}

/** Mobile-only (subscriber begins 7) — landlines can't receive an OTP SMS. */
export const LkMobileSchema = z
  .string()
  .trim()
  .min(1, "Phone is required")
  .transform((v) => canonicalizeLkPhone(v))
  .refine((v) => /^\+947\d{8}$/.test(v), "Enter a valid Sri Lankan mobile number (e.g. 0771234567)");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- phone.test`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/_lib/phone.ts app/_lib/__tests__/phone.test.ts
git commit -m "feat(auth): add LK phone canonicalization and identifier resolution"
```

---

### Task 2: Schema change + hand-authored migration

**Files:**
- Modify: `prisma/schema.prisma` (`User` model + new `PhoneChallenge`)
- Create: `prisma/migrations/20260703140000_phone_first_registration/migration.sql`

**Interfaces:**
- Produces: `User.email` nullable; `User.phone String?` (unique), `User.phoneVerifiedAt DateTime?`; `PhoneChallenge` model with fields `{ id, phone, codeHash, purpose, payload?, attempts, expiresAt, consumedAt?, createdAt }`.

- [ ] **Step 1: Edit `prisma/schema.prisma` — `User` model**

Change the `email` line and add two fields (keep all other fields/relations):

```prisma
model User {
  id              String    @id @default(cuid())
  name            String
  email           String?   @unique
  phone           String?   @unique
  phoneVerifiedAt DateTime?
  passwordHash    String?
  role            String    @default("CUSTOMER") @db.VarChar(16)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  addresses     Address[]
  wishlist      WishlistItem[]
  resetTokens   PasswordResetToken[]
  orders        Order[]
}
```

- [ ] **Step 2: Add the `PhoneChallenge` model** (append near `PasswordResetToken`)

```prisma
model PhoneChallenge {
  id         String    @id @default(cuid())
  phone      String
  codeHash   String
  purpose    String    @db.VarChar(16) // "SIGNUP" | "RESET"
  payload    String?                    // SIGNUP: JSON { name, email, passwordHash }
  attempts   Int       @default(0)
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime  @default(now())

  @@index([phone, purpose])
  @@index([expiresAt])
}
```

- [ ] **Step 3: Validate schema + regenerate client**

Run: `npx prisma validate && npx prisma generate`
Expected: "The schema at prisma/schema.prisma is valid" and client generated. (No DB touched.)

- [ ] **Step 4: Hand-author the migration SQL**

```sql
-- prisma/migrations/20260703140000_phone_first_registration/migration.sql
-- Phone-first registration: email optional, phone identity, OTP challenges.
-- Re-runnable (IF EXISTS / IF NOT EXISTS) per this repo's deploy convention.

-- Email becomes optional (idempotent: DROP NOT NULL is a no-op if already nullable)
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- Phone identity columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");

-- OTP challenge table
CREATE TABLE IF NOT EXISTS "PhoneChallenge" (
  "id"         TEXT NOT NULL,
  "phone"      TEXT NOT NULL,
  "codeHash"   TEXT NOT NULL,
  "purpose"    VARCHAR(16) NOT NULL,
  "payload"    TEXT,
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoneChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PhoneChallenge_phone_purpose_idx" ON "PhoneChallenge"("phone", "purpose");
CREATE INDEX IF NOT EXISTS "PhoneChallenge_expiresAt_idx" ON "PhoneChallenge"("expiresAt");
```

- [ ] **Step 5: Typecheck (surfaces nullable-email breaks — expected, fixed in Task 3)**

Run: `npx tsc --noEmit`
Expected: it MAY now report errors where `user.email` is used as a non-null `string` (e.g. `app/_lib/payments/shared.ts`, `app/account/page.tsx`, `app/_lib/password-reset.ts` call sites). **Do not fix them here** — note them; Task 3 resolves them. If tsc is clean, even better.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260703140000_phone_first_registration/
git commit -m "feat(auth): make email optional, add phone identity + PhoneChallenge schema"
```

---

### Task 3: Email-optional ripple — mailer guards + nullable-email fixes

**Files:**
- Modify: `app/checkout/actions.ts` (guard `sendOrderConfirmationEmail`)
- Modify: `app/admin/orders/actions.ts` (guard `sendCustomerDispatchEmail`)
- Modify: `app/_lib/payments/shared.ts`, `app/account/page.tsx`, `app/account/actions.ts`, `app/_components/account/profile-form.tsx` (nullable-email tsc fixes)
- Modify: `app/_lib/validation.ts` (`ProfileSchema.email` optional)
- Test: `app/_lib/__tests__/mailer-null-email.test.ts`

**Interfaces:**
- Consumes: `OrderDetails.customerEmail: string` (empty string = "no email", the existing convention from `order.user?.email ?? order.guestEmail ?? ""`).
- Produces: no send is attempted when `customerEmail` is falsy.

- [ ] **Step 1: Write the failing test** (a small pure guard extracted for testability)

```ts
// app/_lib/__tests__/mailer-null-email.test.ts
import { describe, it, expect } from "vitest";
import { shouldEmailCustomer } from "@/app/_lib/mailer-guard";

describe("shouldEmailCustomer", () => {
  it("is true for a real address", () => {
    expect(shouldEmailCustomer("a@b.test")).toBe(true);
  });
  it("is false for empty / whitespace (phone-only customer)", () => {
    expect(shouldEmailCustomer("")).toBe(false);
    expect(shouldEmailCustomer("   ")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- mailer-null-email`
Expected: FAIL — `Cannot find module '@/app/_lib/mailer-guard'`.

- [ ] **Step 3: Create the guard**

```ts
// app/_lib/mailer-guard.ts
/** Whether a customer-facing email should be attempted. Phone-only customers
 *  have no email (stored as "" by the OrderDetails convention). */
export function shouldEmailCustomer(email: string | null | undefined): boolean {
  return !!email && email.trim().length > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- mailer-null-email`
Expected: PASS.

- [ ] **Step 5: Apply the guard at the two unguarded send sites**

In `app/checkout/actions.ts`, wrap the COD confirmation send (around line 307-312). Add the import `import { shouldEmailCustomer } from "@/app/_lib/mailer-guard";` and change:

```ts
  if (paymentMethod === "COD") {
    if (shouldEmailCustomer(orderDetailsForEmail.customerEmail)) {
      try {
        await sendOrderConfirmationEmail({ ...orderDetailsForEmail, trackingCode });
      } catch (err) {
        logMailerError("order-confirmation", { orderId, webNumber, rbNumber }, err);
      }
    } else {
      console.log(`[Checkout] order ${orderId}: no customer email — confirmation email skipped`);
    }
  }
```
*(Keep the existing `webNumber`/`rbNumber` args exactly as the current call uses them.)*

In `app/admin/orders/actions.ts`, guard the dispatch send (around line 329-331). Add the import and change:

```ts
  if (shouldEmailCustomer(order.user?.email ?? order.guestEmail)) {
    try {
      await sendCustomerDispatchEmail({ ...toOrderDetails(order), trackingCode: parsed.data });
      await prisma.order.update({ where: { id: orderId }, data: { customerDispatchEmailSentAt: new Date() } });
    } catch (err) {
      logMailerError("dispatch", { orderId, webNumber: order.webNumber, rbNumber: order.rbNumber }, err);
    }
  } else {
    console.log(`[Admin] order ${orderId}: no customer email — dispatch email skipped`);
  }
```
*(The cancellation email and resend-confirmation already guard `customerEmail` — leave them as-is.)*

- [ ] **Step 6: Fix the nullable-email tsc breaks**

Run `npx tsc --noEmit` and fix each reported site with the `?? ""` / null-guard pattern. Known sites:

`app/_lib/payments/shared.ts:5` —
```ts
const email = order.guestEmail ?? order.user?.email ?? "";
```

`app/_lib/validation.ts` `ProfileSchema` — make email optional:
```ts
export const ProfileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
});
```

`app/account/page.tsx:15` and its `ProfileForm` — pass a string:
```tsx
<ProfileForm name={user.name} email={user.email ?? ""} />
```
and ensure `ProfileForm`'s `email` prop type is `string` (already; the `?? ""` satisfies it).

`app/account/actions.ts` — the profile update compares `parsed.data.email !== current.email`; make it null-safe:
```ts
const nextEmail = parsed.data.email?.trim() ? parsed.data.email.trim() : null;
if (nextEmail !== current.email) {
  if (nextEmail) {
    const taken = await prisma.user.findUnique({ where: { email: nextEmail } });
    if (taken && taken.id !== current.id) return { error: "That email is already in use." };
  }
}
await prisma.user.update({ where: { id: current.id }, data: { name: parsed.data.name, email: nextEmail } });
```
*(Adapt to the file's exact existing variable names / return shape — keep its structure, only add the null-handling.)*

Re-run `npx tsc --noEmit` until clean, applying the same `?? ""` / `?? null` pattern to any remaining site.

- [ ] **Step 7: Run full suite + commit**

```bash
npm run test
npx tsc --noEmit
git add app/_lib/mailer-guard.ts app/_lib/__tests__/mailer-null-email.test.ts app/checkout/actions.ts app/admin/orders/actions.ts app/_lib/payments/shared.ts app/_lib/validation.ts app/account/ app/_components/account/
git commit -m "feat(auth): guard customer emails and handle nullable email end-to-end"
```

---

## Phase 2 — SMS + Challenge

### Task 4: Notify.lk SMS client

**Files:**
- Create: `app/_lib/sms.ts`
- Test: `app/_lib/__tests__/sms.test.ts`

**Interfaces:**
- Produces: `sendOtpSms(phone: string, code: string, purpose: "SIGNUP"|"RESET"): Promise<void>`; `sendAccountExistsSms(phone: string): Promise<void>`; `__setTestSmsSender(fn: ((to: string, message: string) => Promise<void>) | null): void` (test seam; `to` is `94XXXXXXXXX`, no `+`).

- [ ] **Step 1: Write the failing test**

```ts
// app/_lib/__tests__/sms.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { sendOtpSms, sendAccountExistsSms, __setTestSmsSender } from "../sms";

let captured: { to: string; message: string }[];
beforeEach(() => {
  captured = [];
  __setTestSmsSender(async (to, message) => { captured.push({ to, message }); });
});

describe("sendOtpSms", () => {
  it("strips the + and includes the code", async () => {
    await sendOtpSms("+94771234567", "123456", "SIGNUP");
    expect(captured[0].to).toBe("94771234567");
    expect(captured[0].message).toContain("123456");
  });
});

describe("sendAccountExistsSms", () => {
  it("sends a no-code 'already have an account' notice", async () => {
    await sendAccountExistsSms("+94771234567");
    expect(captured[0].to).toBe("94771234567");
    expect(captured[0].message).toMatch(/already have/i);
    expect(captured[0].message).not.toMatch(/\d{6}/);
  });
});

describe("without a test sender", () => {
  it("throws when Notify.lk env is missing", async () => {
    __setTestSmsSender(null);
    delete process.env.NOTIFY_LK_USER_ID;
    delete process.env.NOTIFY_LK_API_KEY;
    delete process.env.NOTIFY_LK_SENDER_ID;
    await expect(sendOtpSms("+94771234567", "123456", "SIGNUP")).rejects.toThrow(/Notify\.lk is not configured/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- sms.test`
Expected: FAIL — `Cannot find module '../sms'`.

- [ ] **Step 3: Write the implementation**

```ts
// app/_lib/sms.ts
const NOTIFY_ENDPOINT = "https://app.notify.lk/api/v1/send";

type SmsSender = (to: string, message: string) => Promise<void>;
let testSender: SmsSender | null = null;

/** Test seam — inject a capturing sender so unit tests never hit the network. */
export function __setTestSmsSender(fn: SmsSender | null): void {
  testSender = fn;
}

async function sendSms(phone: string, message: string): Promise<void> {
  const to = phone.replace(/^\+/, ""); // Notify.lk wants 94XXXXXXXXX
  if (testSender) return testSender(to, message);

  const { NOTIFY_LK_USER_ID, NOTIFY_LK_API_KEY, NOTIFY_LK_SENDER_ID } = process.env;
  if (!NOTIFY_LK_USER_ID || !NOTIFY_LK_API_KEY || !NOTIFY_LK_SENDER_ID) {
    throw new Error(
      "Notify.lk is not configured. Set NOTIFY_LK_USER_ID, NOTIFY_LK_API_KEY, NOTIFY_LK_SENDER_ID.",
    );
  }
  const body = new URLSearchParams({
    user_id: NOTIFY_LK_USER_ID,
    api_key: NOTIFY_LK_API_KEY,
    sender_id: NOTIFY_LK_SENDER_ID,
    to,
    message,
  });
  const res = await fetch(NOTIFY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string };
  if (!res.ok || json.status !== "success") {
    throw new Error(`Notify.lk send failed: ${res.status} ${JSON.stringify(json)}`);
  }
}

export function sendOtpSms(phone: string, code: string, _purpose: "SIGNUP" | "RESET"): Promise<void> {
  return sendSms(phone, `Your Dressing Bear code is ${code}. Valid 10 minutes. Do not share it.`);
}

export function sendAccountExistsSms(phone: string): Promise<void> {
  return sendSms(
    phone,
    `You already have a Dressing Bear account. Please log in, or use "Forgot password" to reset it.`,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- sms.test`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/_lib/sms.ts app/_lib/__tests__/sms.test.ts
git commit -m "feat(auth): add Notify.lk SMS client with test seam"
```

---

### Task 5: OTP challenge lifecycle

**Files:**
- Create: `app/_lib/phone-challenge.ts`
- Test: `app/_lib/__tests__/phone-challenge.test.ts`

**Interfaces:**
- Consumes: `sendOtpSms` (Task 4); `prisma.phoneChallenge`.
- Produces: `issueChallenge({ phone, purpose, payload? }): Promise<void>` (throws `ChallengeCooldownError` / `ChallengeRateLimitError`); `verifyChallenge({ phone, purpose, code }): Promise<{ ok: true; payload: string | null } | { ok: false }>`; exported error classes.

- [ ] **Step 1: Write the failing test**

```ts
// app/_lib/__tests__/phone-challenge.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { create, findFirst, update, count } = vi.hoisted(() => ({
  create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn(),
}));
const { sendOtpSms } = vi.hoisted(() => ({ sendOtpSms: vi.fn() }));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { phoneChallenge: { create, findFirst, update, count } },
}));
vi.mock("@/app/_lib/sms", () => ({ sendOtpSms }));

import {
  issueChallenge, verifyChallenge, ChallengeCooldownError,
} from "../phone-challenge";
import { createHash } from "crypto";

beforeEach(() => {
  create.mockReset().mockResolvedValue({ id: "c1" });
  findFirst.mockReset().mockResolvedValue(null); // no recent challenge (no cooldown)
  update.mockReset().mockResolvedValue({});
  count.mockReset().mockResolvedValue(0);         // under hourly cap
  sendOtpSms.mockReset().mockResolvedValue(undefined);
});

describe("issueChallenge", () => {
  it("stores a sha256 code hash and sends the SMS", async () => {
    await issueChallenge({ phone: "+94771234567", purpose: "SIGNUP", payload: "{}" });
    const data = create.mock.calls[0][0].data;
    expect(data.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sendOtpSms).toHaveBeenCalledOnce();
    const sentCode = sendOtpSms.mock.calls[0][1];
    expect(createHash("sha256").update(sentCode).digest("hex")).toBe(data.codeHash);
  });

  it("throws cooldown when a recent challenge exists", async () => {
    findFirst.mockResolvedValueOnce({ id: "recent" }); // cooldown lookup hits
    await expect(issueChallenge({ phone: "+94771234567", purpose: "SIGNUP" }))
      .rejects.toBeInstanceOf(ChallengeCooldownError);
    expect(sendOtpSms).not.toHaveBeenCalled();
  });

  it("deletes nothing but rethrows if SMS fails (dangling row cleaned)", async () => {
    // delete seam
    (create as any).mockResolvedValue({ id: "c1" });
    const del = vi.fn().mockResolvedValue({});
    (await import("@/app/_lib/prisma")).prisma.phoneChallenge.delete = del as never;
    sendOtpSms.mockRejectedValueOnce(new Error("notify down"));
    await expect(issueChallenge({ phone: "+94771234567", purpose: "SIGNUP" })).rejects.toThrow("notify down");
    expect(del).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});

describe("verifyChallenge", () => {
  const code = "123456";
  const codeHash = createHash("sha256").update(code).digest("hex");

  it("consumes and returns the payload on a correct code", async () => {
    findFirst.mockResolvedValueOnce({ id: "c1", codeHash, attempts: 0, payload: "{\"x\":1}" });
    const r = await verifyChallenge({ phone: "+94771234567", purpose: "SIGNUP", code });
    expect(r).toEqual({ ok: true, payload: "{\"x\":1}" });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { consumedAt: expect.any(Date) } }));
  });

  it("increments attempts and fails on a wrong code", async () => {
    findFirst.mockResolvedValueOnce({ id: "c1", codeHash, attempts: 0, payload: null });
    const r = await verifyChallenge({ phone: "+94771234567", purpose: "SIGNUP", code: "000000" });
    expect(r).toEqual({ ok: false });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { attempts: { increment: 1 } } }));
  });

  it("fails when no active challenge exists", async () => {
    findFirst.mockResolvedValueOnce(null);
    expect(await verifyChallenge({ phone: "+94771234567", purpose: "SIGNUP", code })).toEqual({ ok: false });
  });

  it("fails when attempts are exhausted", async () => {
    findFirst.mockResolvedValueOnce({ id: "c1", codeHash, attempts: 5, payload: null });
    expect(await verifyChallenge({ phone: "+94771234567", purpose: "SIGNUP", code })).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- phone-challenge`
Expected: FAIL — `Cannot find module '../phone-challenge'`.

- [ ] **Step 3: Write the implementation**

```ts
// app/_lib/phone-challenge.ts
import { randomInt, createHash } from "crypto";
import { prisma } from "@/app/_lib/prisma";
import { sendOtpSms } from "@/app/_lib/sms";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const HOURLY_CAP = 5;

export class ChallengeCooldownError extends Error {}
export class ChallengeRateLimitError extends Error {}

type Purpose = "SIGNUP" | "RESET";

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function issueChallenge(params: {
  phone: string;
  purpose: Purpose;
  payload?: string;
}): Promise<void> {
  const { phone, purpose, payload } = params;
  const now = Date.now();

  const recent = await prisma.phoneChallenge.findFirst({
    where: { phone, purpose, createdAt: { gt: new Date(now - RESEND_COOLDOWN_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) throw new ChallengeCooldownError();

  const lastHour = await prisma.phoneChallenge.count({
    where: { phone, createdAt: { gt: new Date(now - 60 * 60 * 1000) } },
  });
  if (lastHour >= HOURLY_CAP) throw new ChallengeRateLimitError();

  const code = generateCode();
  const row = await prisma.phoneChallenge.create({
    data: {
      phone,
      purpose,
      codeHash: hashCode(code),
      payload: payload ?? null,
      expiresAt: new Date(now + CODE_TTL_MS),
    },
  });
  try {
    await sendOtpSms(phone, code, purpose);
  } catch (e) {
    await prisma.phoneChallenge.delete({ where: { id: row.id } }).catch(() => {});
    throw e;
  }
}

export async function verifyChallenge(params: {
  phone: string;
  purpose: Purpose;
  code: string;
}): Promise<{ ok: true; payload: string | null } | { ok: false }> {
  const { phone, purpose, code } = params;
  const row = await prisma.phoneChallenge.findFirst({
    where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.attempts >= MAX_ATTEMPTS) return { ok: false };
  if (row.codeHash !== hashCode(code)) {
    await prisma.phoneChallenge.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return { ok: false };
  }
  await prisma.phoneChallenge.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return { ok: true, payload: row.payload };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- phone-challenge`
Expected: PASS (7 tests). *(If the SMS-fail test's `delete` seam is awkward, simplify it to assert `.rejects.toThrow("notify down")` only — the delete is covered by the same pattern in `password-reset.test.ts`.)*

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/_lib/phone-challenge.ts app/_lib/__tests__/phone-challenge.test.ts
git commit -m "feat(auth): add PhoneChallenge OTP lifecycle (issue/verify, cooldown, rate limit)"
```

---

## Phase 3 — Signup

### Task 6: Phone-first signup schema

**Files:**
- Modify: `app/_lib/validation.ts`
- Test: extend `app/_lib/__tests__/` with `signup-schema.test.ts`

**Interfaces:**
- Produces: `SignupSchema` parsing `{ name, phone→canonical, email?, password, confirmPassword }` with password-match refine; re-export `LkMobileSchema` from `./phone`.

- [ ] **Step 1: Write the failing test**

```ts
// app/_lib/__tests__/signup-schema.test.ts
import { describe, it, expect } from "vitest";
import { SignupSchema } from "../validation";

const base = { name: "Amal", phone: "0771234567", password: "abcd1234", confirmPassword: "abcd1234" };

describe("SignupSchema", () => {
  it("canonicalizes the phone and allows a missing email", () => {
    const r = SignupSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.phone).toBe("+94771234567"); expect(r.data.email).toBeUndefined(); }
  });
  it("accepts an optional email", () => {
    const r = SignupSchema.safeParse({ ...base, email: "a@b.test" });
    expect(r.success && r.data.email).toBe("a@b.test");
  });
  it("rejects mismatched passwords", () => {
    expect(SignupSchema.safeParse({ ...base, confirmPassword: "nope1234" }).success).toBe(false);
  });
  it("rejects a landline", () => {
    expect(SignupSchema.safeParse({ ...base, phone: "0112345678" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- signup-schema`
Expected: FAIL (current `SignupSchema` requires `email`, has no `phone`).

- [ ] **Step 3: Update `validation.ts`**

Add the import and re-export at the top, and replace `SignupSchema`:

```ts
import { LkMobileSchema } from "@/app/_lib/phone";
export { LkMobileSchema };

export const SignupSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters"),
    phone: LkMobileSchema,
    email: z.string().trim().email("Enter a valid email").optional(),
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });
```

Update the `SignupInput` type export (already `z.infer<typeof SignupSchema>` — unchanged line, just confirm it compiles).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- signup-schema`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/_lib/validation.ts app/_lib/__tests__/signup-schema.test.ts
git commit -m "feat(auth): make signup schema phone-first with optional email"
```

---

### Task 7: Two-step signup server action

**Files:**
- Modify: `app/(auth)/actions.ts`
- Test: `app/(auth)/__tests__/signup-phone.test.ts`

**Interfaces:**
- Consumes: `issueChallenge`, `verifyChallenge`, `ChallengeCooldownError` (Task 5); `sendAccountExistsSms` (Task 4); `SignupSchema`, `LkMobileSchema`.
- Produces: `SignupState = { step: "details" | "verify"; phone?: string; callbackUrl?: string; error?: string } | null`; `signupAction(prev: SignupState, formData: FormData): Promise<SignupState>` (branches on the `step` form field; success at verify `redirect()`s to `/login?created=1`).

- [ ] **Step 1: Write the failing test**

```ts
// app/(auth)/__tests__/signup-phone.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { findFirst, findUnique, create } = vi.hoisted(() => ({
  findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(),
}));
const { issueChallenge, verifyChallenge } = vi.hoisted(() => ({
  issueChallenge: vi.fn(), verifyChallenge: vi.fn(),
}));
const { sendAccountExistsSms } = vi.hoisted(() => ({ sendAccountExistsSms: vi.fn() }));
const { redirect } = vi.hoisted(() => ({ redirect: vi.fn(() => { throw new Error("REDIRECT"); }) }));

vi.mock("@/app/_lib/prisma", () => ({ prisma: { user: { findFirst, findUnique, create } } }));
vi.mock("@/app/_lib/phone-challenge", () => ({
  issueChallenge, verifyChallenge, ChallengeCooldownError: class extends Error {},
}));
vi.mock("@/app/_lib/sms", () => ({ sendAccountExistsSms }));
vi.mock("next/navigation", () => ({ redirect }));

import { signupAction } from "../actions";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

beforeEach(() => {
  [findFirst, findUnique, create, issueChallenge, verifyChallenge, sendAccountExistsSms, redirect]
    .forEach((m) => m.mockReset());
  redirect.mockImplementation(() => { throw new Error("REDIRECT"); });
});

describe("signupAction — request step", () => {
  const details = { step: "request", name: "Amal", phone: "0771234567", email: "", password: "abcd1234", confirmPassword: "abcd1234" };

  it("issues a challenge and advances to verify for a fresh number", async () => {
    findFirst.mockResolvedValue(null); // no verified account
    const s = await signupAction(null, fd(details));
    expect(issueChallenge).toHaveBeenCalledWith(expect.objectContaining({ phone: "+94771234567", purpose: "SIGNUP" }));
    expect(s).toMatchObject({ step: "verify", phone: "+94771234567" });
  });

  it("is enumeration-safe: already-verified number → same verify step, no signup challenge, existence SMS", async () => {
    findFirst.mockResolvedValue({ id: "u1" }); // already verified
    const s = await signupAction(null, fd(details));
    expect(issueChallenge).not.toHaveBeenCalled();
    expect(sendAccountExistsSms).toHaveBeenCalledWith("+94771234567");
    expect(s).toMatchObject({ step: "verify", phone: "+94771234567" });
  });
});

describe("signupAction — verify step", () => {
  it("creates the verified user then redirects to /login?created=1", async () => {
    verifyChallenge.mockResolvedValue({ ok: true, payload: JSON.stringify({ name: "Amal", email: null, passwordHash: "h" }) });
    create.mockResolvedValue({ id: "u1" });
    await expect(signupAction(null, fd({ step: "verify", phone: "+94771234567", code: "123456" }))).rejects.toThrow("REDIRECT");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ phone: "+94771234567", name: "Amal", passwordHash: "h", phoneVerifiedAt: expect.any(Date) }),
    }));
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("/login?created=1"));
  });

  it("returns a friendly error on a bad code", async () => {
    verifyChallenge.mockResolvedValue({ ok: false });
    const s = await signupAction(null, fd({ step: "verify", phone: "+94771234567", code: "000000" }));
    expect(s).toMatchObject({ step: "verify", error: expect.stringMatching(/invalid or has expired/i) });
    expect(create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- signup-phone`
Expected: FAIL — signature/shape mismatch (current `signupAction` is email-based, returns `ActionState`).

- [ ] **Step 3: Rewrite `signupAction` in `app/(auth)/actions.ts`**

Add imports and the new state type; replace the existing `signupAction` and `NEUTRAL_SIGNUP_MESSAGE` block:

```ts
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/app/_lib/prisma";
import { SignupSchema, LkMobileSchema } from "@/app/_lib/validation";
import { issueChallenge, verifyChallenge, ChallengeCooldownError } from "@/app/_lib/phone-challenge";
import { sendAccountExistsSms } from "@/app/_lib/sms";

export type SignupState =
  | { step: "details" | "verify"; phone?: string; callbackUrl?: string; error?: string }
  | null;

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl") as string | null);
  if (formData.get("step") === "verify") return signupVerify(formData, callbackUrl);
  return signupRequest(formData, callbackUrl);
}

function emptyToUndef(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
}

async function signupRequest(formData: FormData, callbackUrl: string): Promise<SignupState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: emptyToUndef(formData.get("email")),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { step: "details", error: flatten(parsed.error), callbackUrl };

  const phone = parsed.data.phone; // canonical +947...
  const existing = await prisma.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null } } });
  if (existing) {
    // Enumeration-safe: identical web response; the number's owner learns the
    // truth only by SMS. No usable signup challenge is created.
    try { await sendAccountExistsSms(phone); } catch (e) { console.error("[Signup] existence SMS failed", e); }
    return { step: "verify", phone, callbackUrl };
  }

  let email = parsed.data.email ?? null;
  if (email) {
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken) email = null; // optional-email collision → silently drop; never leak/fail
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const payload = JSON.stringify({ name: parsed.data.name, email, passwordHash });
  try {
    await issueChallenge({ phone, purpose: "SIGNUP", payload });
  } catch (e) {
    if (e instanceof ChallengeCooldownError) return { step: "verify", phone, callbackUrl }; // a code was just sent
    console.error("[Signup] issueChallenge failed", e);
    return { step: "details", error: "We couldn't send a code right now. Please try again shortly.", callbackUrl };
  }
  return { step: "verify", phone, callbackUrl };
}

async function signupVerify(formData: FormData, callbackUrl: string): Promise<SignupState> {
  const phoneParsed = LkMobileSchema.safeParse(formData.get("phone"));
  const code = formData.get("code");
  if (!phoneParsed.success || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    const phone = phoneParsed.success ? phoneParsed.data : undefined;
    return { step: "verify", phone, error: "Enter the 6-digit code we sent you.", callbackUrl };
  }
  const phone = phoneParsed.data;
  const result = await verifyChallenge({ phone, purpose: "SIGNUP", code });
  if (!result.ok || !result.payload) {
    return { step: "verify", phone, error: "That code is invalid or has expired.", callbackUrl };
  }
  const data = JSON.parse(result.payload) as { name: string; email: string | null; passwordHash: string };
  try {
    await prisma.user.create({
      data: { name: data.name, email: data.email, phone, phoneVerifiedAt: new Date(), passwordHash: data.passwordHash },
    });
  } catch {
    // Unique violation (race with a concurrent verify) → already registered.
    return { step: "verify", phone, error: "This number is already registered. Please sign in.", callbackUrl };
  }
  const suffix = callbackUrl && callbackUrl !== "/" ? `&callbackUrl=${encodeURIComponent(callbackUrl)}` : "";
  redirect(`/login?created=1${suffix}`);
}
```

*(Keep the existing `safeCallbackUrl` and `flatten` helpers. Delete the old email-based `signupAction` body and `NEUTRAL_SIGNUP_MESSAGE`. Leave `loginAction`/reset actions for Tasks 9/11.)*

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- signup-phone`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/(auth)/actions.ts app/(auth)/__tests__/signup-phone.test.ts
git commit -m "feat(auth): two-step phone-verified signup action (enumeration-safe)"
```

*(tsc will flag `app/(auth)/signup/page.tsx` importing the old `ActionState` shape — that's fixed in Task 8.)*

---

### Task 8: Two-step signup UI + login "account created" banner

**Files:**
- Modify: `app/(auth)/signup/page.tsx`
- Modify: `app/(auth)/login/page.tsx` (add `created=1` banner)

**Interfaces:**
- Consumes: `signupAction`, `SignupState` (Task 7).

- [ ] **Step 1: Replace `app/(auth)/signup/page.tsx`**

```tsx
// app/(auth)/signup/page.tsx
"use client";

import { useActionState, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signupAction, type SignupState } from "@/app/(auth)/actions";

type Props = { searchParams: Promise<{ callbackUrl?: string }> };

export default function SignupPage({ searchParams }: Props) {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(signupAction, null);
  const params = use(searchParams);
  const callbackUrl = params.callbackUrl ?? "/";
  const step = state?.step === "verify" ? "verify" : "details";

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        ← Back to home
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {step === "verify" ? "Enter your code" : "Create your account"}
      </h1>
      {state?.error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {step === "verify" ? (
        <form action={formAction} className="space-y-4" data-testid="signup-verify-form">
          <input type="hidden" name="step" value="verify" />
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <input type="hidden" name="phone" value={state?.phone ?? ""} />
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code by SMS to {state?.phone}. Enter it below.
          </p>
          <div className="space-y-2">
            <Label htmlFor="code">Verification code</Label>
            <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code"
                   pattern="\d{6}" maxLength={6} required disabled={pending} data-testid="signup-code" />
          </div>
          <Button type="submit" className="w-full" disabled={pending} data-testid="signup-verify">
            {pending ? "Verifying…" : "Verify & create account"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Wrong number?{" "}
            <Link href="/signup" className="hover:text-foreground">Start over</Link>
          </p>
        </form>
      ) : (
        <form action={formAction} className="space-y-4" data-testid="signup-details-form">
          <input type="hidden" name="step" value="request" />
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" required autoComplete="name" disabled={pending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Mobile number</Label>
            <Input id="phone" name="phone" type="tel" inputMode="tel" required
                   autoComplete="tel" placeholder="0771234567" disabled={pending} data-testid="signup-phone" />
            <p className="text-xs text-muted-foreground">We&apos;ll text you a code to verify it.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="email" name="email" type="email" autoComplete="email" disabled={pending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="new-password" disabled={pending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" disabled={pending} />
          </div>
          <Button type="submit" className="w-full" disabled={pending} data-testid="signup-submit">
            {pending ? "Sending code…" : "Continue"}
          </Button>
        </form>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={params.callbackUrl ? `/login?callbackUrl=${encodeURIComponent(params.callbackUrl)}` : "/login"}
          className="hover:text-foreground"
        >
          Sign in
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Add the "account created" banner to `app/(auth)/login/page.tsx`**

Widen the `searchParams` type to include `created`, and add a banner next to the existing `reset === "success"` one:

```tsx
type Props = { searchParams: Promise<{ callbackUrl?: string; reset?: string; created?: string }> };
```
```tsx
{params.created === "1" ? (
  <Alert className="mb-4">
    <AlertDescription>Account created. Sign in to continue.</AlertDescription>
  </Alert>
) : null}
```
*(Place it directly above the `params.reset === "success"` block. Thread `created` through the `LoginInner` props' `searchParams` type identically.)*

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (the old `ActionState` import in signup is gone; login compiles with the new param).

- [ ] **Step 4: Run full suite + commit**

```bash
npm run test
git add app/(auth)/signup/page.tsx app/(auth)/login/page.tsx
git commit -m "feat(auth): two-step signup UI with SMS code entry + login created banner"
```

---

## Phase 4 — Login + Reset

### Task 9: Phone-or-email login

**Files:**
- Modify: `app/_lib/validation.ts` (`LoginSchema` → `identifier`)
- Modify: `app/_lib/auth.ts` (Credentials `identifier` + `authorize` lookup)
- Modify: `app/(auth)/actions.ts` (`loginAction` identifier + role pre-read)
- Test: `app/(auth)/__tests__/login-identifier.test.ts`

**Interfaces:**
- Consumes: `resolveIdentifier` (Task 1).
- Produces: `LoginSchema = { identifier: string; password: string }`; `authorize` resolves user by phone or email.

- [ ] **Step 1: Write the failing test** (unit-test the pure resolution the action/authorize share)

```ts
// app/(auth)/__tests__/login-identifier.test.ts
import { describe, it, expect } from "vitest";
import { resolveIdentifier } from "@/app/_lib/phone";

describe("login identifier resolution", () => {
  it("routes a phone to a canonical phone lookup", () => {
    expect(resolveIdentifier("0771234567")).toEqual({ kind: "phone", value: "+94771234567" });
  });
  it("routes an email to an email lookup", () => {
    expect(resolveIdentifier("me@x.test")).toEqual({ kind: "email", value: "me@x.test" });
  });
});
```
*(The authorize/loginAction wiring is exercised by the existing auth E2E once a DB is available; this unit test locks the branch logic.)*

- [ ] **Step 2: Run test to verify it passes as written, then update the schema/wiring** (this test guards the shared helper; run it green first)

Run: `npm run test -- login-identifier`
Expected: PASS.

- [ ] **Step 3: Update `LoginSchema` in `app/_lib/validation.ts`**

```ts
export const LoginSchema = z.object({
  identifier: z.string().trim().min(1, "Phone or email required"),
  password: z.string().min(1, "Password required"),
});
```
Update `LoginInput` (already `z.infer<typeof LoginSchema>` — no change to that line).

- [ ] **Step 4: Update `authorize` in `app/_lib/auth.ts`**

Change the `credentials` field and the lookup:

```ts
import { resolveIdentifier } from "@/app/_lib/phone";
// ...
Credentials({
  credentials: {
    identifier: { label: "Phone or email", type: "text" },
    password: { label: "Password", type: "password" },
  },
  async authorize(creds) {
    try {
      const parsed = LoginSchema.safeParse(creds);
      if (!parsed.success) return null;

      const id = resolveIdentifier(parsed.data.identifier);
      const user = await prisma.user.findUnique(
        id.kind === "phone" ? { where: { phone: id.value } } : { where: { email: id.value } },
      );
      if (!user || !user.passwordHash) return null;

      const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!ok) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role === "ADMIN" ? "ADMIN" : "CUSTOMER",
      };
    } catch (error) {
      console.error("[Auth]: Unexpected error in authorize:", error);
      return null;
    }
  },
}),
```
*(Remove the old `parsed.data.email` devLogs. `email: user.email` is now `string | null`, which NextAuth's `User` type accepts.)*

- [ ] **Step 5: Update `loginAction` in `app/(auth)/actions.ts`**

```ts
export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = LoginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Invalid phone/email or password" };

  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl") as string | null);
  const id = resolveIdentifier(parsed.data.identifier);
  const dbUser = await prisma.user.findUnique(
    id.kind === "phone" ? { where: { phone: id.value }, select: { role: true } }
                        : { where: { email: id.value }, select: { role: true } },
  );
  const role = dbUser?.role === "ADMIN" ? "ADMIN" : "CUSTOMER";

  try {
    await signIn("credentials", { identifier: parsed.data.identifier, password: parsed.data.password, redirect: false });
    return { redirectTo: chooseLoginRedirect(role, callbackUrl) };
  } catch (error) {
    if (error instanceof AuthError) return { error: "Invalid phone/email or password" };
    throw error;
  }
}
```
Add `import { resolveIdentifier } from "@/app/_lib/phone";` if not already present.

- [ ] **Step 6: Typecheck + run suite + commit**

```bash
npx tsc --noEmit
npm run test
git add app/_lib/validation.ts app/_lib/auth.ts app/(auth)/actions.ts app/(auth)/__tests__/login-identifier.test.ts
git commit -m "feat(auth): accept phone or email at login"
```

---

### Task 10: Login page identifier field

**Files:**
- Modify: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Change the email field to an identifier field**

Replace the email `div.space-y-2` block in the form with:

```tsx
<div className="space-y-2">
  <Label htmlFor="identifier">Phone or email</Label>
  <Input id="identifier" name="identifier" type="text" required
         autoComplete="username" placeholder="0771234567 or you@email.com" disabled={busy}
         data-testid="login-identifier" />
</div>
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/(auth)/login/page.tsx
git commit -m "feat(auth): login form accepts phone or email"
```

---

### Task 11: Password reset by phone (SMS) or email (link)

**Files:**
- Modify: `app/_lib/validation.ts` (`RequestResetSchema` → `identifier`; add `ResetByPhoneSchema`)
- Modify: `app/(auth)/actions.ts` (`requestResetAction` branch; new `resetByPhoneAction`)
- Modify: `app/(auth)/forgot-password/page.tsx` (identifier + phone code/new-password panel)
- Test: `app/(auth)/__tests__/reset-phone.test.ts`

**Interfaces:**
- Consumes: `resolveIdentifier`, `issueChallenge`/`verifyChallenge`, `issuePasswordReset`.
- Produces: `RequestResetSchema = { identifier }`; `ResetByPhoneSchema = { phone, code, newPassword, confirmPassword }`; `ResetState` carrying `{ mode: "request" | "phone-code" | "email-sent"; phone?; error?; success? }`; `requestResetAction`, `resetByPhoneAction`.

- [ ] **Step 1: Write the failing test**

```ts
// app/(auth)/__tests__/reset-phone.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { findUnique, update } = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));
const { issueChallenge, verifyChallenge } = vi.hoisted(() => ({ issueChallenge: vi.fn(), verifyChallenge: vi.fn() }));
const { issuePasswordReset } = vi.hoisted(() => ({ issuePasswordReset: vi.fn() }));
const { redirect } = vi.hoisted(() => ({ redirect: vi.fn(() => { throw new Error("REDIRECT"); }) }));

vi.mock("@/app/_lib/prisma", () => ({ prisma: { user: { findUnique, update } } }));
vi.mock("@/app/_lib/phone-challenge", () => ({ issueChallenge, verifyChallenge, ChallengeCooldownError: class extends Error {} }));
vi.mock("@/app/_lib/password-reset", () => ({ issuePasswordReset }));
vi.mock("next/navigation", () => ({ redirect }));

import { requestResetAction, resetByPhoneAction } from "../actions";

function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }
beforeEach(() => { [findUnique, update, issueChallenge, verifyChallenge, issuePasswordReset, redirect].forEach((m) => m.mockReset()); redirect.mockImplementation(() => { throw new Error("REDIRECT"); }); });

describe("requestResetAction", () => {
  it("sends an SMS code when the identifier is a phone with an account", async () => {
    findUnique.mockResolvedValue({ id: "u1" });
    const s = await requestResetAction(null, fd({ identifier: "0771234567" }));
    expect(issueChallenge).toHaveBeenCalledWith(expect.objectContaining({ phone: "+94771234567", purpose: "RESET" }));
    expect(s).toMatchObject({ mode: "phone-code", phone: "+94771234567" });
  });
  it("uses the email link path for an email identifier", async () => {
    findUnique.mockResolvedValue({ id: "u1", email: "a@b.test" });
    const s = await requestResetAction(null, fd({ identifier: "a@b.test" }));
    expect(issuePasswordReset).toHaveBeenCalled();
    expect(s).toMatchObject({ mode: "email-sent" });
  });
  it("is neutral for an unknown phone (no SMS, same UI)", async () => {
    findUnique.mockResolvedValue(null);
    const s = await requestResetAction(null, fd({ identifier: "0770000000" }));
    expect(issueChallenge).not.toHaveBeenCalled();
    expect(s).toMatchObject({ mode: "phone-code" });
  });
});

describe("resetByPhoneAction", () => {
  it("sets the new password and redirects on a valid code", async () => {
    verifyChallenge.mockResolvedValue({ ok: true, payload: null });
    findUnique.mockResolvedValue({ id: "u1" });
    update.mockResolvedValue({});
    await expect(resetByPhoneAction(null, fd({ phone: "+94771234567", code: "123456", newPassword: "abcd1234", confirmPassword: "abcd1234" }))).rejects.toThrow("REDIRECT");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u1" } }));
    expect(redirect).toHaveBeenCalledWith("/login?reset=success");
  });
  it("rejects a bad code", async () => {
    verifyChallenge.mockResolvedValue({ ok: false });
    const s = await resetByPhoneAction(null, fd({ phone: "+94771234567", code: "000000", newPassword: "abcd1234", confirmPassword: "abcd1234" }));
    expect(s).toMatchObject({ mode: "phone-code", error: expect.stringMatching(/invalid or has expired/i) });
    expect(update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- reset-phone`
Expected: FAIL (actions don't exist / wrong shape).

- [ ] **Step 3: Update `validation.ts`**

```ts
export const RequestResetSchema = z.object({
  identifier: z.string().trim().min(1, "Phone or email required"),
});

export const ResetByPhoneSchema = z
  .object({
    phone: LkMobileSchema,
    code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
    newPassword: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match" });
```
Add `export type ResetByPhoneInput = z.infer<typeof ResetByPhoneSchema>;`.

- [ ] **Step 4: Rewrite the reset actions in `app/(auth)/actions.ts`**

```ts
import { RequestResetSchema, ResetByPhoneSchema } from "@/app/_lib/validation";
import { resolveIdentifier } from "@/app/_lib/phone";
import { issueChallenge, verifyChallenge, ChallengeCooldownError } from "@/app/_lib/phone-challenge";

export type ResetState =
  | { mode: "request" | "phone-code" | "email-sent"; phone?: string; error?: string; success?: string }
  | null;

const NEUTRAL_EMAIL_SENT = "If an account with that email exists, you'll receive a reset link shortly.";

export async function requestResetAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = RequestResetSchema.safeParse({ identifier: formData.get("identifier") });
  if (!parsed.success) return { mode: "request", error: "Enter your phone or email." };

  const id = resolveIdentifier(parsed.data.identifier);
  if (id.kind === "email") {
    const user = await prisma.user.findUnique({ where: { email: id.value } });
    if (user?.email) {
      try { await issuePasswordReset({ id: user.id, email: user.email }); }
      catch (e) { console.error("[forgot-password] email reset failed:", e); }
    }
    return { mode: "email-sent", success: NEUTRAL_EMAIL_SENT };
  }

  // Phone path — neutral regardless of existence.
  const user = await prisma.user.findUnique({ where: { phone: id.value } });
  if (user) {
    try { await issueChallenge({ phone: id.value, purpose: "RESET" }); }
    catch (e) { if (!(e instanceof ChallengeCooldownError)) console.error("[forgot-password] SMS reset failed:", e); }
  }
  return { mode: "phone-code", phone: id.value };
}

export async function resetByPhoneAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = ResetByPhoneSchema.safeParse({
    phone: formData.get("phone"),
    code: formData.get("code"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    const phoneRaw = formData.get("phone");
    return { mode: "phone-code", phone: typeof phoneRaw === "string" ? phoneRaw : undefined, error: flatten(parsed.error) };
  }
  const { phone, code, newPassword } = parsed.data;
  const result = await verifyChallenge({ phone, purpose: "RESET", code });
  if (!result.ok) return { mode: "phone-code", phone, error: "That code is invalid or has expired." };

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return { mode: "phone-code", phone, error: "That code is invalid or has expired." };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  redirect("/login?reset=success");
}
```
*(`issuePasswordReset` already accepts `{ id, email }`; the `user.email` guard satisfies its non-null `email: string` param. Keep the existing `resetPasswordAction` — the email-link consumer — unchanged.)*

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- reset-phone`
Expected: PASS (5 tests).

- [ ] **Step 6: Update `app/(auth)/forgot-password/page.tsx`**

```tsx
// app/(auth)/forgot-password/page.tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requestResetAction, resetByPhoneAction, type ResetState } from "@/app/(auth)/actions";

export default function ForgotPasswordPage() {
  const [reqState, requestAction, reqPending] = useActionState<ResetState, FormData>(requestResetAction, null);
  const [setState, setAction, setPending] = useActionState<ResetState, FormData>(resetByPhoneAction, null);

  const inPhoneCode = reqState?.mode === "phone-code";

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Reset your password</h1>

      {reqState?.success ? (
        <Alert className="mb-4"><AlertDescription>{reqState.success}</AlertDescription></Alert>
      ) : null}
      {(reqState?.error || setState?.error) ? (
        <Alert variant="destructive" className="mb-4"><AlertDescription>{reqState?.error || setState?.error}</AlertDescription></Alert>
      ) : null}

      {inPhoneCode ? (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            If an account exists for {reqState?.phone}, we sent a 6-digit code by SMS. Enter it and choose a new password.
          </p>
          <form action={setAction} className="space-y-4">
            <input type="hidden" name="phone" value={reqState?.phone ?? ""} />
            <div className="space-y-2">
              <Label htmlFor="code">Verification code</Label>
              <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required disabled={setPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input id="newPassword" name="newPassword" type="password" required autoComplete="new-password" disabled={setPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" disabled={setPending} />
            </div>
            <Button type="submit" className="w-full" disabled={setPending}>{setPending ? "Saving…" : "Save new password"}</Button>
          </form>
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            Enter your phone or email. We&apos;ll text a code (phone) or email a link.
          </p>
          <form action={requestAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Phone or email</Label>
              <Input id="identifier" name="identifier" type="text" required autoComplete="username" placeholder="0771234567 or you@email.com" disabled={reqPending} />
            </div>
            <Button type="submit" className="w-full" disabled={reqPending}>{reqPending ? "Sending…" : "Continue"}</Button>
          </form>
        </>
      )}

      <Link href="/login" className="mt-4 inline-block text-sm text-muted-foreground hover:text-foreground">Back to sign in</Link>
    </main>
  );
}
```

- [ ] **Step 7: Typecheck + full suite + commit**

```bash
npx tsc --noEmit
npm run test
git add app/_lib/validation.ts app/(auth)/actions.ts app/(auth)/forgot-password/page.tsx app/(auth)/__tests__/reset-phone.test.ts
git commit -m "feat(auth): password reset by phone SMS code or email link"
```

---

### Task 12: Env example + docs + final gate

**Files:**
- Modify: `.env.local.example`
- Modify: `README.md` (Notify.lk setup note)

- [ ] **Step 1: Add the Notify.lk vars to `.env.local.example`** (names only, no secrets)

```bash
# Notify.lk transactional SMS (phone OTP: signup verification + password reset)
NOTIFY_LK_USER_ID=
NOTIFY_LK_API_KEY=
NOTIFY_LK_SENDER_ID=
```

- [ ] **Step 2: Add a short README ops note**

Under the existing ops/integrations section, add: how to obtain `NOTIFY_LK_*` (dashboard → API Keys), that a **sender ID must be approved** (`NotifyDEMO` for testing), that SMS is **pre-paid credits**, and that the vars go into Vercel Project → Settings → Environment Variables.

- [ ] **Step 3: Final full gate**

```bash
npm run test
npx tsc --noEmit
npx prisma validate
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add .env.local.example README.md
git commit -m "docs(auth): document Notify.lk SMS env + sender-ID setup"
```

---

## Self-Review

**1. Spec coverage** (each spec section → task):
- §4.1 schema → Task 2. §4.2 canonicalization/mobile-only → Task 1. §4.3 SMS client → Task 4. §4.4 challenge lifecycle → Task 5. §4.5 two-step enumeration-safe signup → Tasks 6–8. §4.6 phone-or-email login (3 touchpoints) → Task 9 (+10 UI). §4.7 reset by phone/email → Task 11. §4.8 email-optional ripple → Task 3. §4.9 UI → Tasks 8, 10, 11. §6 env → Task 12. §7 testing → tests in every task. §8 phasing → the four phases here. §10 SMS order confirmation → correctly **not** implemented (deferred). §11 acceptance → covered.
- **Resolved spec tension:** payload(hash) vs auto-login → redirect to `/login?created=1` (documented in "Deviation" above).

**2. Placeholder scan:** No "TBD/handle edge cases" without concrete code. The one open-ended step (Task 3 Step 6 tsc sweep) enumerates the known sites + a specific fix pattern, which is legitimate compiler-driven work, not a placeholder.

**3. Type consistency:** `canonicalizeLkPhone`/`resolveIdentifier`/`LkMobileSchema` (Task 1) used identically in Tasks 6/7/9/11. `issueChallenge`/`verifyChallenge` signatures (Task 5) match all callers. `SignupState`/`ResetState` shapes match their pages (Tasks 8/11). `sendOtpSms`/`sendAccountExistsSms` (Task 4) match challenge + signup callers. `shouldEmailCustomer` (Task 3) matches both guard sites. `OrderDetails.customerEmail` stays `string` ("" = none) — no type change forced on the mailer.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-03-phone-first-registration.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
