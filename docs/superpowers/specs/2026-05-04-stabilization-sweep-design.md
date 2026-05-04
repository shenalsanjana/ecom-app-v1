# Stabilization Sweep — Design

**Date:** 2026-05-04
**Sub-project:** 0 of N (production-readiness roadmap)
**Status:** Approved

## Goal

Eliminate real defects, risky behavior, and rough edges in the existing codebase so that subsequent sub-projects (variants/inventory, checkout lifecycle, payments, admin, etc.) build on a stable base. No new features. No architectural changes.

## Non-goals (deferred to later sub-projects)

- D1. Float → Int (cents) for monetary fields — sub-project 1 (Inventory & variants) already migrates the schema.
- D2. CSV `sizes` column → `ProductVariant` model — sub-project 1.
- D3. Rate limiting on auth endpoints — sub-project 6 (Auth & security hardening).
- D4. Order confirmation page, order history detail, status transitions — sub-project 3 (Checkout & order lifecycle).
- D5. Real payment gateway integration (PayHere, Koko, MinitPay webhooks) — sub-project 4.

These items are acknowledged P1/P2 risks and tracked here only to document why this sweep does not address them.

## Baseline (verified 2026-05-04)

- `npm run build` — green.
- `npx tsc --noEmit` — clean.
- `npm run lint` — 2 trivial unused-var warnings in `prisma/seed.ts`.
- No P0 (broken) defects found in discovery.

## Scope — fixes in this sweep

Items numbered for traceability. Each item lists the defect, the fix, and the files to be modified.

### Section 1 — Auth

**1. Signup email enumeration**
- Defect: `app/(auth)/actions.ts:36-37` returns `"Email already in use"` when the email is registered. This leaks account existence to anyone with the signup form.
- Fix: when an email is already registered, do **not** create a user, do **not** sign in, and return the same `ActionState` shape as the success path (`{ success: "<neutral message>" }`) so the form renders identically in both branches. The neutral message: `"If this email isn't already registered, your account is ready. Sign in to continue."` On the success path (genuinely new user), keep the existing auto-sign-in + redirect to `/`. On the neutral-no-op path, render the success message and a link to `/login`. No courtesy email is sent in this sweep.
- Files: `app/(auth)/actions.ts`, `app/(auth)/signup/page.tsx` (handle the new neutral success-message branch in the form UI).

**2. Reset-password page handles undefined token**
- Defect: `app/(auth)/reset-password/page.tsx:21` only branches on `token === ""`, not `undefined`. On initial render with no `?token=` query param, the form may flash before the invalid-link state appears.
- Fix: render the "invalid link" view whenever `!token` (covers `undefined`, `null`, and `""`).
- Files: `app/(auth)/reset-password/page.tsx`.

### Section 2 — Cart & Checkout

**3. Cart minus-button silently removes at qty 1**
- Defect: `app/_lib/cart-context.tsx:150-156` — `updateQuantity(key, 0)` falls through to `REMOVE_ITEM`. The cart row's minus button at quantity 1 deletes the item with no confirmation.
- Fix: disable the minus button when `item.quantity <= 1` in `app/_components/cart/cart-item.tsx`. The Trash2 icon is the only path to deletion. Leave `updateQuantity`'s `quantity <= 0 → remove` fallback in place as a defensive guardrail (callers should not rely on it).
- Files: `app/_components/cart/cart-item.tsx`.

**4. Phone validation**
- Defect: `app/checkout/actions.ts:46,53` accepts any string of length ≥ 7. `app/contact/contact-form.tsx` has no phone format check at all.
- Fix: introduce a shared zod helper `LkPhoneSchema` matching `^(?:\+94|0)?[1-9]\d{8}$` (accepts `0771234567`, `+94771234567`, `771234567`). Apply it to:
  - `ProcessOrderSchema.contactPhone`
  - `GuestInfoSchema.phone`
  - Contact form server action (if validated server-side; if client-only, mirror in client zod).
- Add matching `pattern=` and `inputMode="tel"` on the corresponding inputs for native UX.
- Files: `app/_lib/validation.ts` (add helper), `app/checkout/actions.ts`, `app/checkout/checkout-client.tsx`, `app/contact/contact-form.tsx` and its action.

**5. Guest checkout email/UX hardening**
- Defect: guest fields in `app/checkout/checkout-client.tsx:206-217` lack `type="email"`, `autoComplete`, and `inputMode`, and surface only HTML required errors.
- Fix: add `type="email"`, `autoComplete="email"`, `inputMode="email"` to email; `autoComplete="name"` to name; `autoComplete="tel"`, `inputMode="tel"` to phone. Surface server validation errors inline near the failing field.
- Files: `app/checkout/checkout-client.tsx`.

**6. `line2` empty-string vs null**
- Defect: form submits `address.line2 = ""` rather than omitting the field. Server normalizes, but the source of truth should not emit empty strings.
- Fix: in the checkout client, before invoking `processOrder`, replace empty-string optional fields with `undefined`.
- Files: `app/checkout/checkout-client.tsx`.

### Section 3 — Products / SEO

**7. Product not-found UX**
- Defect: `app/products/[id]/page.tsx:57` calls `notFound()` but no `not-found.tsx` exists for the route, so it bubbles up. `generateMetadata` returns `{ title: "Not found" }` — bare and ugly.
- Fix:
  - Add `app/products/[id]/not-found.tsx` with a clear "Product not found" message and a link back to `/categories`.
  - Update `generateMetadata` to return `{ title: "Product not found — Dressing Bear" }` for the missing case.
- Files: `app/products/[id]/not-found.tsx` (new), `app/products/[id]/page.tsx`.

**8. Per-page metadata**
- Defect: many pages omit `generateMetadata`, harming SEO and social previews.
- Fix: add or extend `generateMetadata` for:
  - `app/products/[id]/page.tsx` — title = product name, description = product description (truncated 150 chars), `openGraph.images` = first product image.
  - `app/categories/page.tsx` — static title "Shop all categories — Dressing Bear".
  - `app/categories/[slug]/page.tsx` — title = category name; description = category-specific copy; canonical URL.
  - `app/deals/page.tsx` — static "Deals — Dressing Bear".
  - `app/search/page.tsx` — title interpolates `q` (`"\"<q>\" — Dressing Bear search"`), `robots: { index: false }` (search results pages should not index).
- Update root `app/layout.tsx`:
  - Add `metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000")`.
  - Add `openGraph` defaults (siteName, type, locale).
  - Add `twitter` card defaults.
- Files: each of the above page files; `app/layout.tsx`.

**9. Footer dynamic categories**
- Defect: `app/_components/home/site-footer.tsx` hardcodes category slugs (`oversize-tshirts`, `graphic-tees`, `solid-basics`). A slug rename silently 404s the footer link.
- Fix: extract the category links into a small async server component (e.g. `FooterCategoryList`) that calls `getCategories()` and renders up to 6 entries. Inline it inside the existing `SiteFooter`. If `SiteFooter` is currently a sync component imported into a client component, only the inner async server component changes — the outer footer stays sync. The "Categories" section header stays a static string.
- Files: `app/_components/home/site-footer.tsx`.

### Section 4 — Mailer

**10. Hardcoded fallbacks**
- Defect: `app/_lib/mailer.ts` falls back to `Dressing Bear <no-reply@example.com>` and `dressingbear@gmail.com` if env vars are unset. Misconfigurations silently send mail from `example.com`.
- Fix: read `SMTP_FROM` and `BRAND_EMAIL` from env at call sites; throw a clear `Error("SMTP_FROM is not configured")` (and equivalent for BRAND_EMAIL) when the value is missing. Module load remains side-effect-free; only actual send paths fail.
- Files: `app/_lib/mailer.ts`.

### Section 5 — Loading & Error boundaries

**11. `loading.tsx` skeletons**
- Add `loading.tsx` to:
  - `app/cart/loading.tsx`
  - `app/wishlist/loading.tsx`
  - `app/account/orders/loading.tsx`
  - `app/search/loading.tsx`
  - `app/categories/[slug]/loading.tsx`
  - `app/deals/loading.tsx`
- A new shared `<ProductGridSkeleton />` is added at `app/_components/shared/product-grid-skeleton.tsx` (listed in "Added" below). Each `loading.tsx` is 5–15 lines and renders the section skeleton for its page (cart and account/orders use a list-row skeleton instead of the grid; can be inline JSX, no shared component required).

**12. `error.tsx` boundaries**
- Add `error.tsx` to:
  - `app/account/error.tsx`
  - `app/checkout/error.tsx`
  - `app/search/error.tsx`
- Each is a minimal `"use client"` component receiving `{ error, reset }` props, rendering "Something went wrong", a "Try again" button bound to `reset`, and a "Back home" link. Logs `error.digest` to console.

### Section 6 — Cleanup

**13. Stale files**
- Delete `app/categories/[slug]/page.tsx.bak`.
- Delete `app/categories/[slug]_new.txt`.

**14. Seed lint warnings**
- `prisma/seed.ts:163` — replace the unused `(_, i) =>` destructuring with the underscore-prefix convention the project's eslint accepts, or refactor away the unused param. Trivial.

## Verification — done before declaring complete

A run of all of these must pass cleanly with no manual fix-up:

1. `npm run lint` — 0 errors, 0 warnings.
2. `npm run build` — succeeds, no new warnings.
3. `npx tsc --noEmit` — clean.
4. Manual smoke test (or Playwright if added in a later sub-project) covering:
   - Browse: home → category → category detail → PDP.
   - Cart: add to cart from PDP → cart page → minus button at qty 1 is disabled → Trash2 removes → quantity max 10 enforced.
   - Checkout (guest): fill form with invalid phone (rejected) → fix → place COD order → success.
   - Checkout (signed-in): same flow without guest section.
   - Auth: signup with new email (success) → signup with existing email (no enumeration: same neutral message) → login → forgot password → click reset link → reset password.
   - Product not-found: visit `/products/does-not-exist` → renders the new not-found page.
   - Search/categories/PDP/deals — view source, confirm `<title>` and OG tags.
   - Footer category links — slug rename test (rename one category in seed, rebuild, confirm footer reflects).
5. Stale files no longer present in working tree.

## Risk notes

- **Footer dynamic categories** turns a synchronous component async. If the footer is currently imported into a client component anywhere, that import path will break. Audit before changing.
- **Mailer throw-on-missing-env** changes behavior at the moment a misconfigured deployment first tries to send — previously silent, now noisy. Acceptable; the silent path was the bug.
- **Signup neutral response** changes the post-signup UI slightly — the user lands on the same "Check your email" / redirect path whether the email was new or already registered. Confirm UX text avoids implying a new account was created when one already existed.

## Files touched (summary)

Modified:
- `app/(auth)/actions.ts`
- `app/(auth)/reset-password/page.tsx`
- `app/(auth)/signup/page.tsx` (success-state UI)
- `app/_components/cart/cart-item.tsx`
- `app/_components/home/site-footer.tsx`
- `app/_lib/mailer.ts`
- `app/_lib/validation.ts`
- `app/checkout/actions.ts`
- `app/checkout/checkout-client.tsx`
- `app/contact/contact-form.tsx` (and its action if separate)
- `app/categories/page.tsx`
- `app/categories/[slug]/page.tsx`
- `app/deals/page.tsx`
- `app/search/page.tsx`
- `app/products/[id]/page.tsx`
- `app/layout.tsx`
- `prisma/seed.ts`

Added:
- `app/products/[id]/not-found.tsx`
- `app/cart/loading.tsx`
- `app/wishlist/loading.tsx`
- `app/account/orders/loading.tsx`
- `app/search/loading.tsx`
- `app/categories/[slug]/loading.tsx`
- `app/deals/loading.tsx`
- `app/account/error.tsx`
- `app/checkout/error.tsx`
- `app/search/error.tsx`
- `app/_components/shared/product-grid-skeleton.tsx`

Deleted:
- `app/categories/[slug]/page.tsx.bak`
- `app/categories/[slug]_new.txt`

## Sequencing

The fixes are independent of each other except where noted. A reasonable execution order:

1. Section 6 cleanup (deletes + seed lint) — fastest, lowest risk.
2. Section 1 + Section 2 — defects with security/UX impact.
3. Section 3 + Section 4 — UX / SEO surface.
4. Section 5 — loading/error boundaries (touch many small new files).
5. Verification.

Each fix should be a self-contained commit so that if any step regresses, bisection is trivial.
