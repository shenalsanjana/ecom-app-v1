# Stabilization Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the defects, risky behavior, and rough edges identified in `docs/superpowers/specs/2026-05-04-stabilization-sweep-design.md` so subsequent sub-projects build on a stable base.

**Architecture:** This is a fix sweep, not a feature build. Changes are localized: a new shared zod helper, in-place edits to existing pages and components, several new `loading.tsx` / `error.tsx` files, and the deletion of two stale files. No new modules, no schema changes.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, NextAuth v5 beta, Prisma + SQLite, zod, Tailwind v4, shadcn/ui, nodemailer.

**Testing approach (deviation from TDD default):** This codebase has no test runner. Adding Vitest/Playwright is sub-project 9 (Testing) and explicitly out of scope here. For each task, verification = `npm run lint` + `npm run build` clean, plus a one-off `tsx` smoke script for pure-logic changes (the LK phone regex and the signup-enumeration branch). UI changes are verified by manual smoke per the spec's Verification section, run once at the very end (Task 13). This is documented as a deliberate scope decision; do NOT add Vitest as part of this plan.

**Pre-flight check (run before Task 1):**

```bash
cd C:/Devops/Projects/ecom-app-v1
git status            # confirm clean tree (untracked .bak / _new.txt are expected — they get deleted in Task 1)
npm run lint          # baseline: 2 unused-var warnings in prisma/seed.ts
npm run build         # baseline: must succeed
```

If lint reports anything other than the two known seed warnings, or build fails, stop and reconcile before starting.

---

## Task 1: Cleanup — stale files + seed lint warnings

Smallest, lowest-risk change. Establishes the commit cadence.

**Files:**
- Delete: `app/categories/[slug]/page.tsx.bak`
- Delete: `app/categories/[slug]_new.txt`
- Modify: `prisma/seed.ts` (around lines 159-174)

- [ ] **Step 1: Delete the stale files**

```bash
rm "app/categories/[slug]/page.tsx.bak"
rm "app/categories/[slug]_new.txt"
```

- [ ] **Step 2: Fix the two unused-var warnings in `prisma/seed.ts`**

Find the block (currently around lines 163–174):

```ts
    const reviews = Array.from({ length: count }).map((_, i) => {
      const daysAgo = Math.floor(rng() * 90);
      const createdAt = new Date(Date.now() - daysAgo * 86400_000);
      return {
        productId: p.id,
        authorName: pick(REVIEW_AUTHORS, rng),
        rating: pick(RATING_POOL, rng),
        title: pick(REVIEW_TITLES, rng),
        body: pick(REVIEW_BODIES, rng),
        createdAt,
      };
    });
```

Replace with the single-callback form of `Array.from` (no intermediate empty array, no unused params):

```ts
    const reviews = Array.from({ length: count }, () => {
      const daysAgo = Math.floor(rng() * 90);
      const createdAt = new Date(Date.now() - daysAgo * 86400_000);
      return {
        productId: p.id,
        authorName: pick(REVIEW_AUTHORS, rng),
        rating: pick(RATING_POOL, rng),
        title: pick(REVIEW_TITLES, rng),
        body: pick(REVIEW_BODIES, rng),
        createdAt,
      };
    });
```

- [ ] **Step 3: Verify lint is now clean**

Run: `npm run lint`
Expected: `✖ 0 problems (0 errors, 0 warnings)`

- [ ] **Step 4: Verify build still succeeds**

Run: `npm run build`
Expected: `✓ Compiled successfully` and `✓ Generating static pages`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(cleanup): remove stale category files and fix seed lint warnings"
```

---

## Task 2: Add shared `LkPhoneSchema` validation helper

Foundation for Tasks 3, 4, 5. One zod definition reused everywhere phones are accepted.

**Files:**
- Modify: `app/_lib/validation.ts` (append after line 67)

- [ ] **Step 1: Add the `LkPhoneSchema` export**

At the end of `app/_lib/validation.ts`, before the `export type` lines (currently starting at line 69), insert:

```ts
// Sri Lankan mobile/landline normalized to digits-only after stripping spaces,
// hyphens, and parens. Accepts:
//   - 0771234567       (national, leading 0)
//   - +94771234567     (international with +)
//   - 94771234567      (international without +)
//   - 771234567        (9 digits, no prefix)
// Rejects empty, all-zeroes, leading-zero-zero, and obviously short/long inputs.
export const LkPhoneSchema = z
  .string()
  .trim()
  .min(1, "Phone is required")
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^(?:\+?94|0)?[1-9]\d{8}$/,
        "Enter a valid Sri Lankan phone number (e.g. 0771234567)",
      ),
  );
```

Then add the inferred-type export beneath the existing `export type` lines (line 75):

```ts
export type LkPhoneInput = z.infer<typeof LkPhoneSchema>;
```

- [ ] **Step 2: Smoke-verify the schema with a one-off `tsx` script**

Create a temporary file `scripts/_smoke-phone.ts` (this file is deleted in step 4 — do NOT commit it):

```ts
import { LkPhoneSchema } from "../app/_lib/validation";

const cases: { input: string; ok: boolean }[] = [
  { input: "0771234567", ok: true },
  { input: "+94771234567", ok: true },
  { input: "94771234567", ok: true },
  { input: "771234567", ok: true },
  { input: "077-123-4567", ok: true },
  { input: "+94 77 123 4567", ok: true },
  { input: "(077) 123 4567", ok: true },
  { input: "", ok: false },
  { input: "12345", ok: false },
  { input: "071234567890", ok: false },  // too long
  { input: "0071234567", ok: false },     // double-leading-zero
  { input: "abcdefghij", ok: false },
];

let failed = 0;
for (const { input, ok } of cases) {
  const result = LkPhoneSchema.safeParse(input);
  const got = result.success;
  const verdict = got === ok ? "PASS" : "FAIL";
  if (got !== ok) failed++;
  console.log(`${verdict} ${JSON.stringify(input)} → expected ok=${ok}, got ok=${got}`);
}
console.log(failed === 0 ? "\nAll cases passed." : `\n${failed} case(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 3: Run the smoke script and verify all cases pass**

Run: `npx tsx scripts/_smoke-phone.ts`
Expected: `All cases passed.` and exit 0. If any case fails, fix the regex and rerun.

- [ ] **Step 4: Delete the smoke script and verify lint+build**

```bash
rm scripts/_smoke-phone.ts
npm run lint
npm run build
```

Expected: lint clean, build green.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/validation.ts
git commit -m "feat(validation): add shared LkPhoneSchema helper"
```

---

## Task 3: Apply `LkPhoneSchema` in checkout server action

**Files:**
- Modify: `app/checkout/actions.ts` (lines 4 import block, lines 43-47 GuestInfoSchema, line 53 ProcessOrderSchema.contactPhone)

- [ ] **Step 1: Import the helper**

In `app/checkout/actions.ts`, change the import on line 4 from:

```ts
import { z } from "zod";
```

to:

```ts
import { z } from "zod";
import { LkPhoneSchema } from "@/app/_lib/validation";
```

- [ ] **Step 2: Replace the loose phone validations**

Find the `GuestInfoSchema` block (lines 43-47):

```ts
const GuestInfoSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email is required"),
  phone: z.string().trim().min(7, "Phone is required"),
});
```

Replace with:

```ts
const GuestInfoSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email is required"),
  phone: LkPhoneSchema,
});
```

Find the `ProcessOrderSchema` block (lines 49-56), specifically the `contactPhone` line:

```ts
  contactPhone: z.string().trim().min(7, "Phone is required"),
```

Replace with:

```ts
  contactPhone: LkPhoneSchema,
```

- [ ] **Step 3: Verify build (the schema rejects invalid phones at runtime; tsc must still pass)**

Run: `npm run build`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add app/checkout/actions.ts
git commit -m "fix(checkout): enforce LK phone format in server validation"
```

---

## Task 4: Apply phone validation in contact form server action

The contact form has its own server action (`app/contact/actions.ts` based on the import in contact-form.tsx:8). Apply the same helper.

**Files:**
- Modify: `app/contact/actions.ts`

- [ ] **Step 1: Read the current contact action**

Run: `cat app/contact/actions.ts`
You need to see how the action validates `phone`. The form input (`contact-form.tsx:68-75`) sends `phone` as an optional field with no client validation.

- [ ] **Step 2: Make phone optional-but-valid-when-provided**

In `app/contact/actions.ts`, locate the zod schema (likely uses `z.object({ ... })`). Add the import if not present:

```ts
import { LkPhoneSchema } from "@/app/_lib/validation";
```

Change the `phone` field definition from whatever it currently is (likely `z.string().optional()` or absent) to:

```ts
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(LkPhoneSchema.optional()),
```

This pattern: trim → empty-string becomes undefined → either the string passes `LkPhoneSchema` or is `undefined`. Optional truly means optional.

If the existing schema uses `phone: z.string().optional()`, **also keep** any existing email/message validations untouched.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add app/contact/actions.ts
git commit -m "fix(contact): validate phone format when provided"
```

---

## Task 5: Surface phone validation in checkout client UI + guest field UX

Spec items 5 and 6 — combined because they touch the same file.

**Files:**
- Modify: `app/checkout/checkout-client.tsx`

- [ ] **Step 1: Tighten the guest fields (lines 211-217 name input, 223-230 email input)**

Find the guest **name** input (around line 211):

```tsx
<Input
  id="guestName"
  value={guest.name}
  onChange={(e) => setGuest({ ...guest, name: e.target.value })}
  required
  placeholder="Your name"
/>
```

Replace with:

```tsx
<Input
  id="guestName"
  value={guest.name}
  onChange={(e) => setGuest({ ...guest, name: e.target.value })}
  required
  autoComplete="name"
  placeholder="Your name"
/>
```

Find the guest **email** input (around line 223):

```tsx
<Input
  id="guestEmail"
  type="email"
  value={guest.email}
  onChange={(e) => setGuest({ ...guest, email: e.target.value })}
  required
  placeholder="you@example.com"
/>
```

Replace with:

```tsx
<Input
  id="guestEmail"
  type="email"
  inputMode="email"
  autoComplete="email"
  value={guest.email}
  onChange={(e) => setGuest({ ...guest, email: e.target.value })}
  required
  placeholder="you@example.com"
/>
```

- [ ] **Step 2: Tighten the phone input (lines 247-254)**

Find the phone input:

```tsx
<Input
  id="phone"
  type="tel"
  value={phone}
  onChange={(e) => setPhone(e.target.value)}
  required
  placeholder="+94 7X XXX XXXX"
/>
```

Replace with:

```tsx
<Input
  id="phone"
  type="tel"
  inputMode="tel"
  autoComplete="tel"
  pattern="^(?:\+?94|0)?[1-9]\d{8}$"
  value={phone}
  onChange={(e) => setPhone(e.target.value)}
  required
  placeholder="+94 7X XXX XXXX"
/>
```

The `pattern` attribute is for browser native UX only — server zod validation is the source of truth.

- [ ] **Step 3: Normalize empty `line2` to undefined before submit (spec item 6)**

Find `handleSubmit` (around line 132). Inside the `try` block (around line 138), the call to `processOrder` currently passes `shippingAddress: address`. Replace the address argument with a normalized version. Find:

```tsx
      const result = await processOrder({
        items: items.map((it) => ({
          productId: it.productId,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          size: it.size,
        })),
        shippingAddress: address,
        paymentMethod,
        contactPhone: phone,
        guestInfo: isGuest ? { name: guest.name, email: guest.email, phone } : undefined,
        idempotencyKey,
      });
```

Replace with:

```tsx
      const normalizedAddress = {
        ...address,
        line2: address.line2.trim() || undefined,
      };
      const result = await processOrder({
        items: items.map((it) => ({
          productId: it.productId,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          size: it.size,
        })),
        shippingAddress: normalizedAddress,
        paymentMethod,
        contactPhone: phone,
        guestInfo: isGuest ? { name: guest.name, email: guest.email, phone } : undefined,
        idempotencyKey,
      });
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add app/checkout/checkout-client.tsx
git commit -m "fix(checkout): tighten guest field UX and normalize line2 before submit"
```

---

## Task 6: Cart minus-button disabled at qty 1

**Files:**
- Modify: `app/_components/cart/cart-item.tsx` (lines 61-69 minus button)

- [ ] **Step 1: Disable the minus button at qty ≤ 1**

Find the minus Button (lines 61-69):

```tsx
<Button
  variant="outline"
  size="icon"
  className="h-7 w-7"
  onClick={() => updateQuantity(item.key, item.quantity - 1)}
  aria-label="Decrease quantity"
>
  <Minus className="h-3 w-3" />
</Button>
```

Replace with:

```tsx
<Button
  variant="outline"
  size="icon"
  className="h-7 w-7"
  onClick={() => updateQuantity(item.key, item.quantity - 1)}
  disabled={item.quantity <= 1}
  aria-label="Decrease quantity"
>
  <Minus className="h-3 w-3" />
</Button>
```

The `updateQuantity(_, 0) → REMOVE_ITEM` fallback in `cart-context.tsx:150-156` is left untouched as a defensive guardrail. Removal is now only reachable through the Trash2 button.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add app/_components/cart/cart-item.tsx
git commit -m "fix(cart): disable minus button at qty 1 to prevent silent removal"
```

---

## Task 7: Auth — fix signup email enumeration

**Files:**
- Modify: `app/(auth)/actions.ts` (lines 27-51 signupAction)
- Modify: `app/(auth)/signup/page.tsx` (lines 12-52 form rendering)

- [ ] **Step 1: Change `signupAction` to never reveal whether the email is registered**

Find the current `signupAction` (lines 27-51):

```ts
export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: flatten(parsed.error) };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: "Email already in use" };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: { name: parsed.data.name, email: parsed.data.email, passwordHash },
  });

  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  });

  redirect("/");
}
```

Replace with:

```ts
const NEUTRAL_SIGNUP_MESSAGE =
  "If this email isn't already registered, your account is ready. Sign in to continue.";

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: flatten(parsed.error) };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    // Do not create, do not sign in, do not reveal that this email is already
    // registered. Same response shape as the genuinely-new-user success path.
    return { success: NEUTRAL_SIGNUP_MESSAGE };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: { name: parsed.data.name, email: parsed.data.email, passwordHash },
  });

  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  });

  redirect("/");
}
```

`redirect("/")` throws a Next.js redirect error and never returns, so the `success` branch is only ever returned in the duplicate-email case. The signup page (next step) will render the success message.

- [ ] **Step 2: Render the neutral success message in the signup page**

In `app/(auth)/signup/page.tsx`, find the existing error-only `Alert` block (lines 20-24):

```tsx
      {state?.error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
```

Replace with a block that handles both branches and, on success, renders only the neutral message + a sign-in link (the form is hidden because there's nothing more to do):

```tsx
      {state?.error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.success ? (
        <>
          <Alert className="mb-4">
            <AlertDescription>{state.success}</AlertDescription>
          </Alert>
          <Link
            href="/login"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            Need a different email?{" "}
            <Link href="/signup" className="hover:text-foreground">Try again</Link>
          </p>
        </>
      ) : (
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" required autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
      )}
```

The original "Already have an account?" link at the bottom (lines 46-49 of the file) stays as it is.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add app/(auth)/actions.ts app/(auth)/signup/page.tsx
git commit -m "fix(auth): close signup email-enumeration leak"
```

---

## Task 8: Auth — reset-password handles undefined token

**Files:**
- Modify: `app/(auth)/reset-password/page.tsx` (line 21 condition)

- [ ] **Step 1: Broaden the invalid-token branch**

Find line 21:

```tsx
  if (token === "") {
```

Replace with:

```tsx
  if (token !== undefined && !token) {
```

This change: while `token === undefined` (the initial render before the `useEffect` resolves `searchParams`), we DON'T render the invalid-link view — we wait for the effect to set token. Once token is set to either a real string (form renders) or empty string (invalid view), the right branch shows. This avoids a flash of the form before the invalid view if `?token=` is missing.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add app/(auth)/reset-password/page.tsx
git commit -m "fix(auth): treat empty token in URL as invalid reset link"
```

---

## Task 9: Mailer — fail loud on missing env

**Files:**
- Modify: `app/_lib/mailer.ts` (lines 35, 79, 80, 205, 206)

- [ ] **Step 1: Replace the silent fallbacks with explicit getters that throw**

At the top of `app/_lib/mailer.ts`, beneath the existing `BRAND_NAME` / `CONTACT_NUMBER` constants (lines 24-25), add two helpers:

```ts
function requireFrom(): string {
  const from = process.env.SMTP_FROM;
  if (!from) {
    throw new Error(
      "SMTP_FROM is not configured. Set SMTP_FROM in .env.local (e.g. \"Dressing Bear <no-reply@dressingbear.com>\").",
    );
  }
  return from;
}

function requireBrandEmail(): string {
  const email = process.env.BRAND_EMAIL;
  if (!email) {
    throw new Error(
      "BRAND_EMAIL is not configured. Set BRAND_EMAIL in .env.local.",
    );
  }
  return email;
}
```

- [ ] **Step 2: Replace the three call sites of `process.env.SMTP_FROM ?? ...` and the two `process.env.BRAND_EMAIL ?? ...` fallbacks**

In `sendPasswordResetEmail` (line 35):

```ts
  const from = process.env.SMTP_FROM ?? `${BRAND_NAME} <no-reply@example.com>`;
```

Replace with:

```ts
  const from = requireFrom();
```

In `sendOrderConfirmationEmail` (lines 79-80):

```ts
  const brandEmail = process.env.BRAND_EMAIL ?? "dressingbear@gmail.com";
  const from = process.env.SMTP_FROM ?? `${BRAND_NAME} <no-reply@example.com>`;
```

Replace with:

```ts
  const brandEmail = requireBrandEmail();
  const from = requireFrom();
```

In `sendContactEmail` (lines 205-206):

```ts
  const brandEmail = process.env.BRAND_EMAIL ?? "dressingbear@gmail.com";
  const from = process.env.SMTP_FROM ?? `${BRAND_NAME} <no-reply@example.com>`;
```

Replace with:

```ts
  const brandEmail = requireBrandEmail();
  const from = requireFrom();
```

Also update `brandReplyTo()` (lines 29-31) so it stays consistent — currently it returns `undefined` if `BRAND_EMAIL` is unset, which is acceptable for `replyTo`. **Leave `brandReplyTo()` untouched** — `replyTo` is genuinely optional.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: green. (Module load does NOT throw; only the actual send paths do, which is the desired behavior.)

- [ ] **Step 4: Commit**

```bash
git add app/_lib/mailer.ts
git commit -m "fix(mailer): throw when SMTP_FROM or BRAND_EMAIL are not configured"
```

---

## Task 10: Product not-found UX + metadata polish

**Files:**
- Create: `app/products/[id]/not-found.tsx`
- Modify: `app/products/[id]/page.tsx` (line 36)

- [ ] **Step 1: Create the route-scoped not-found page**

Create `app/products/[id]/not-found.tsx`:

```tsx
import Link from "next/link";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";

export default function ProductNotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Product not found</h1>
        <p className="mt-4 text-muted-foreground">
          The product you&apos;re looking for is no longer available, or the link is broken.
        </p>
        <Link
          href="/categories"
          className="mt-8 inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Browse all products
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Improve the not-found metadata title**

In `app/products/[id]/page.tsx`, find line 36:

```ts
  if (!detail) return { title: "Not found" };
```

Replace with:

```ts
  if (!detail) return { title: "Product not found — Dressing Bear" };
```

- [ ] **Step 3: Verify build (route should now show in routes list)**

Run: `npm run build`
Expected: green; build output should still list `/products/[id]`.

- [ ] **Step 4: Commit**

```bash
git add app/products/[id]/not-found.tsx app/products/[id]/page.tsx
git commit -m "feat(products): add not-found boundary and clearer missing-product title"
```

---

## Task 11: Per-page metadata — categories, deals, search + root layout

**Files:**
- Modify: `app/layout.tsx` (lines 17-20 metadata export)
- Modify: `app/categories/page.tsx` (add metadata export at top)
- Modify: `app/categories/[slug]/page.tsx` (add `generateMetadata` at top)
- Modify: `app/deals/page.tsx` (add metadata export at top)
- Modify: `app/search/page.tsx` (add `generateMetadata` at top)

- [ ] **Step 1: Update root layout metadata**

In `app/layout.tsx`, find lines 17-20:

```ts
export const metadata: Metadata = {
  title: "Dressing Bear - Oversize T-Shirts",
  description: "Shop premium oversize t-shirts with size variants. Cash on Delivery available.",
};
```

Replace with:

```ts
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Dressing Bear — Oversize T-Shirts",
    template: "%s | Dressing Bear",
  },
  description:
    "Shop premium oversize t-shirts with size variants. Cash on Delivery available.",
  openGraph: {
    type: "website",
    siteName: "Dressing Bear",
    locale: "en_LK",
    url: APP_URL,
    title: "Dressing Bear — Oversize T-Shirts",
    description:
      "Shop premium oversize t-shirts with size variants. Cash on Delivery available.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dressing Bear — Oversize T-Shirts",
    description: "Shop premium oversize t-shirts with size variants.",
  },
};
```

- [ ] **Step 2: Add static metadata to `app/categories/page.tsx`**

At the top of `app/categories/page.tsx`, after the existing imports (currently lines 1-6) and before the `type CategoriesPageProps` declaration, add:

```ts
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shop all categories",
  description: "Browse every category: oversize t-shirts, graphic tees, solid basics.",
};
```

- [ ] **Step 3: Add `generateMetadata` to `app/categories/[slug]/page.tsx`**

At the top of `app/categories/[slug]/page.tsx`, after the existing imports (lines 1-7), and before the `type CategoryPageProps` declaration, add:

```ts
import type { Metadata } from "next";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const categories = await getCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) {
    return { title: "Category not found" };
  }
  return {
    title: category.name,
    description: `Shop ${category.name.toLowerCase()} at Dressing Bear.`,
    alternates: { canonical: `/categories/${slug}` },
  };
}
```

`getCategories` is already imported at line 3.

- [ ] **Step 4: Add static metadata to `app/deals/page.tsx`**

At the top of `app/deals/page.tsx`, after the existing imports (lines 1-6), add:

```ts
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deals",
  description: "Limited-time deals on premium oversize t-shirts.",
  alternates: { canonical: "/deals" },
};
```

- [ ] **Step 5: Add `generateMetadata` to `app/search/page.tsx`**

At the top of `app/search/page.tsx`, after the existing imports (lines 1-7), add:

```ts
import type { Metadata } from "next";

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ q?: string }> },
): Promise<Metadata> {
  const sp = await searchParams;
  const q = sp.q?.trim();
  return {
    title: q ? `“${q}” — search` : "Search",
    description: q
      ? `Search results for “${q}” at Dressing Bear.`
      : "Search products at Dressing Bear.",
    robots: { index: false, follow: true },
  };
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: green. The build output static-page count is unchanged; metadata is rendered per request.

- [ ] **Step 7: Commit**

```bash
git add app/layout.tsx app/categories/page.tsx "app/categories/[slug]/page.tsx" app/deals/page.tsx app/search/page.tsx
git commit -m "feat(seo): add per-page metadata, OG defaults, and search noindex"
```

---

## Task 12: Footer dynamic categories

**Files:**
- Modify: `app/_components/home/site-footer.tsx`

- [ ] **Step 1: Convert the categories column to load from DB**

`SiteFooter` is currently a sync server component (no `"use client"`, no async). It is used by both server pages (e.g. `app/products/[id]/page.tsx:124`) and a client checkout page (`app/checkout/checkout-client.tsx:101, 127, 436`). Because it has no client interactivity itself, marking the function `async` works in both contexts — `client → server` boundaries handle async server components automatically.

Replace the entire contents of `app/_components/home/site-footer.tsx` with:

```tsx
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { getCategories } from "@/app/_lib/products";

type LinkItem = { label: string; href: string };

const STATIC_COLUMNS: { heading: string; links: LinkItem[] }[] = [
  {
    heading: "Shop",
    links: [
      { label: "All Products", href: "/categories" },
      { label: "New Arrivals", href: "/categories?sort=newest" },
      { label: "Best Sellers", href: "/categories?sort=rating" },
      { label: "Deals", href: "/deals" },
    ],
  },
  {
    heading: "Help",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact Us", href: "/contact" },
      { label: "Returns", href: "/refund-policy" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Refund Policy", href: "/refund-policy" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms & Conditions", href: "/terms-and-conditions" },
    ],
  },
];

export async function SiteFooter() {
  const categories = await getCategories();
  const categoryLinks: LinkItem[] = categories
    .slice(0, 6)
    .map((c) => ({ label: c.name, href: `/categories/${c.slug}` }));

  // Insert the dynamic Categories column second (between Shop and Help) so the
  // visual order matches the previous static layout.
  const columns: { heading: string; links: LinkItem[] }[] = [
    STATIC_COLUMNS[0],
    { heading: "Categories", links: categoryLinks },
    STATIC_COLUMNS[1],
    STATIC_COLUMNS[2],
  ];

  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {columns.map((col) => (
            <div key={col.heading}>
              <h3 className="text-sm font-semibold tracking-wide uppercase">{col.heading}</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {col.links.map((link) => (
                  <li key={link.label + link.href}>
                    <Link href={link.href} className="hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Separator className="my-8" />
        <div className="flex flex-col items-start justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Dressing Bear. All rights reserved.</p>
          <p>Built with Next.js. Prices and stock for demonstration only.</p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: green. If you see an error like "async Server Component used in client component", the Next.js 16 boundary is more restrictive than expected — in that case, fall back to extracting only the categories `<ul>` into a separate `FooterCategoryList` async component imported from `SiteFooter`. Document this in the commit if it happens.

- [ ] **Step 3: Commit**

```bash
git add app/_components/home/site-footer.tsx
git commit -m "feat(footer): load category links from DB so slug renames don't 404"
```

---

## Task 13: Loading skeletons (shared component + 6 `loading.tsx`)

**Files:**
- Create: `app/_components/shared/product-grid-skeleton.tsx`
- Create: `app/cart/loading.tsx`
- Create: `app/wishlist/loading.tsx`
- Create: `app/account/orders/loading.tsx`
- Create: `app/search/loading.tsx`
- Create: `app/categories/[slug]/loading.tsx`
- Create: `app/deals/loading.tsx`

- [ ] **Step 1: Create the shared grid skeleton**

`app/_components/shared/product-grid-skeleton.tsx`:

```tsx
type Props = {
  count?: number;
};

export function ProductGridSkeleton({ count = 8 }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-square w-full rounded-lg bg-muted" />
          <div className="mt-3 h-4 w-3/4 rounded bg-muted" />
          <div className="mt-2 h-4 w-1/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create grid-style `loading.tsx` files (search, categories/[slug], deals, wishlist)**

`app/search/loading.tsx`:

```tsx
import { ProductGridSkeleton } from "@/app/_components/shared/product-grid-skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
      </div>
      <ProductGridSkeleton count={9} />
    </main>
  );
}
```

`app/categories/[slug]/loading.tsx`:

```tsx
import { ProductGridSkeleton } from "@/app/_components/shared/product-grid-skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="h-9 w-72 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-5 w-96 animate-pulse rounded bg-muted" />
      </div>
      <ProductGridSkeleton count={12} />
    </main>
  );
}
```

`app/deals/loading.tsx`:

```tsx
import { ProductGridSkeleton } from "@/app/_components/shared/product-grid-skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 h-32 animate-pulse rounded-lg bg-muted" />
      <ProductGridSkeleton count={12} />
    </main>
  );
}
```

`app/wishlist/loading.tsx`:

```tsx
import { ProductGridSkeleton } from "@/app/_components/shared/product-grid-skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 h-8 w-48 animate-pulse rounded bg-muted" />
      <ProductGridSkeleton count={8} />
    </main>
  );
}
```

- [ ] **Step 3: Create list-style `loading.tsx` files (cart, account/orders)**

`app/cart/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex gap-4 rounded-lg border p-4">
            <div className="h-24 w-24 animate-pulse rounded bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/4 animate-pulse rounded bg-muted" />
              <div className="h-8 w-32 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
```

`app/account/orders/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 h-8 w-40 animate-pulse rounded bg-muted" />
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-lg border p-4">
            <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify build (each loading.tsx should appear as a route segment)**

Run: `npm run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add app/_components/shared/product-grid-skeleton.tsx \
        app/cart/loading.tsx \
        app/wishlist/loading.tsx \
        app/account/orders/loading.tsx \
        app/search/loading.tsx \
        "app/categories/[slug]/loading.tsx" \
        app/deals/loading.tsx
git commit -m "feat(ux): add loading skeletons for cart, wishlist, orders, search, category, deals"
```

---

## Task 14: Error boundaries (account, checkout, search)

**Files:**
- Create: `app/account/error.tsx`
- Create: `app/checkout/error.tsx`
- Create: `app/search/error.tsx`

- [ ] **Step 1: Create the three `error.tsx` files**

`app/account/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[account]", error.digest, error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We couldn&apos;t load your account just now.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset} variant="default">
          Try again
        </Button>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
        >
          Back home
        </Link>
      </div>
    </main>
  );
}
```

`app/checkout/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function CheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[checkout]", error.digest, error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Checkout couldn&apos;t load</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your cart is safe. You can try again, or head back and review it.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset} variant="default">
          Try again
        </Button>
        <Link
          href="/cart"
          className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
        >
          Back to cart
        </Link>
      </div>
    </main>
  );
}
```

`app/search/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[search]", error.digest, error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Search hit a snag</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Try the search again, or browse the catalog instead.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset} variant="default">
          Try again
        </Button>
        <Link
          href="/categories"
          className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
        >
          Browse categories
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add app/account/error.tsx app/checkout/error.tsx app/search/error.tsx
git commit -m "feat(ux): add error boundaries for account, checkout, and search"
```

---

## Task 15: End-to-end verification

This is the spec's "Verification" section, run as a single task. No code changes — only validation. If anything fails, the failing item gets its own follow-up task and commit.

- [ ] **Step 1: Final lint + build + typecheck**

```bash
npm run lint
npm run build
npx tsc --noEmit
```

Expected: all three are clean.

- [ ] **Step 2: Confirm stale files are gone**

```bash
git status
ls "app/categories/[slug]/" 2>/dev/null
```

Expected: working tree clean, no `*.bak` or `_new.txt` listed.

- [ ] **Step 3: Manual smoke (run the dev server)**

```bash
npm run dev
```

Then in a browser, walk through each scenario and tick:

- [ ] Home loads → click into a category → click a product → PDP renders.
- [ ] PDP add-to-cart with size selected → cart page shows item; minus at qty 1 is **disabled**; Trash2 removes; quantity max 10 enforced.
- [ ] Visit `/products/does-not-exist` → custom not-found page renders (not the generic Next.js 404).
- [ ] Visit `/categories/<slug>` → page title in tab includes the category name.
- [ ] Visit `/search?q=test` → robots `noindex` tag in `<head>` (view source).
- [ ] Footer "Categories" column reflects DB categories (try `/categories/<existing-slug>` and confirm the link is in the footer).
- [ ] Checkout (guest) — submit invalid phone (e.g. "abc123") → server rejects with phone-format message; fix to `0771234567` → COD order succeeds, success page shown.
- [ ] Signup with new email → auto-signed-in, redirect to `/`.
- [ ] Signup with **already-registered email** → no error revealing existence; the same `success` neutral message appears as the courtesy text. View source / console: no "Email already in use" leakage.
- [ ] Login with bad password → "Invalid email or password" (unchanged).
- [ ] Forgot password → submits → success message regardless of whether email exists.
- [ ] Reset password with `/reset-password` (no token) → shows invalid-link message (not the form).
- [ ] Reset password with valid token → form works → password resets → login with new password.
- [ ] If SMTP_FROM is intentionally unset, an order placed via COD logs an SMTP-not-configured error and the order **still saves** (idempotency, royalExpressSubmitted=false, emailSent=false). Order saving is the priority; mailer failure is best-effort. Re-set the env var afterwards.

- [ ] **Step 4: Stop dev server, final tag**

If everything passes, mark the sweep complete:

```bash
git log --oneline -20    # confirm clean commit history for the sweep
```

There is no version bump or release tag in this sub-project; the changes are merged into `develop` for downstream sub-projects to build on.

- [ ] **Step 5: If any smoke item failed**

Open a follow-up task in this plan for the specific failure, fix it, commit separately. Do NOT bundle multiple regression fixes into one commit.

---

## Self-review (already performed before delivery)

**1. Spec coverage:**
- Spec item 1 (signup enumeration) → Task 7. ✓
- Spec item 2 (reset-password undefined) → Task 8. ✓
- Spec item 3 (cart minus-button) → Task 6. ✓
- Spec item 4 (phone validation) → Tasks 2, 3, 4, 5. ✓
- Spec item 5 (guest checkout UX) → Task 5. ✓
- Spec item 6 (line2 normalization) → Task 5. ✓
- Spec item 7 (product not-found) → Task 10. ✓
- Spec item 8 (per-page metadata) → Tasks 10 (PDP missing-case), 11 (categories/deals/search/root). ✓
- Spec item 9 (footer dynamic categories) → Task 12. ✓
- Spec item 10 (mailer hardcoded fallbacks) → Task 9. ✓
- Spec item 11 (loading.tsx) → Task 13. ✓
- Spec item 12 (error.tsx) → Task 14. ✓
- Spec item 13 (stale files) → Task 1. ✓
- Spec item 14 (seed lint warnings) → Task 1. ✓
- Verification → Task 15. ✓

**2. Placeholder scan:** No "TBD", "TODO", "implement later", or unspecified-content steps. Every code step shows the actual code.

**3. Type consistency:** `LkPhoneSchema` used by the same name in Tasks 2, 3, 4. `requireFrom`/`requireBrandEmail` defined and used in Task 9 only. `ProductGridSkeleton` defined in Task 13 and used by the four grid-style loaders within the same task.
