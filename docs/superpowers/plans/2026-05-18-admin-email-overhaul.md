# Admin Email Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update all four admin (brand-facing) email templates — dispatch, pending-prepaid, order-confirmation BCC, and admin failure alert — to surface the new fields landed in slices A and B: `rbNumber` (the customer-friendly order reference), `paymentStatus` (PENDING / PAID / COD_PENDING / COD_COLLECTED, with human-readable label), the corrected COD amount (0 for online orders, total for COD), and delivery notes.

**Architecture:** `OrderDetails` in `app/_lib/mailer.ts` gains two optional nullable fields. A small private helper `codAmountFor(order)` replaces every site that currently renders `formatPrice(order.total)` as a "COD amount". Each of the four `send*Email` functions is updated independently — both text and HTML bodies, plus subject lines where they add signal. The two callers (`app/checkout/actions.ts`, `app/checkout/book-courier.ts`) pass the new fields through from the persisted Order row. Recipient stays env-driven (`BRAND_EMAIL`); only `.env.local.example` documentation changes.

**Tech Stack:** Next.js 16 App Router (React 19), Prisma 6 + PostgreSQL, nodemailer 7, Vitest 4, TypeScript 5.

---

## File Structure

### Modify
- `app/_lib/mailer.ts` — `OrderDetails` type, `codAmountFor` helper, four template bodies + three subject lines.
- `app/checkout/actions.ts` — pass `rbNumber` + `paymentStatus` into mailer calls.
- `app/checkout/book-courier.ts` — same (if it constructs an `OrderDetails`; the implementer reads first).
- `app/_lib/__tests__/mailer-dispatch.test.ts` — fixture + assertions for the new fields in the dispatch email.
- `app/checkout/__tests__/book-courier.test.ts` — fixture update if it constructs `OrderDetails`.
- `.env.local.example` — comment documenting the production `BRAND_EMAIL` value.

### Create
- None. Slice E is purely an evolution of existing files.

---

## Task 1: Type extension + `codAmountFor` helper + caller pass-through

**Files:**
- Modify: `app/_lib/mailer.ts` (add two optional fields to `OrderDetails`, add `codAmountFor` private function)
- Modify: `app/checkout/actions.ts` (pass new fields to the two mailer calls it makes)
- Modify: `app/checkout/book-courier.ts` (pass new fields to the mailer call it makes, if it constructs an `OrderDetails`)

- [ ] **Step 1: Read the relevant files**

Use Read on:
- `app/_lib/mailer.ts` — find the `OrderDetails` type (around L80–115). Note the existing optional fields' style.
- `app/checkout/actions.ts` — find every `sendOrderConfirmationEmail(...)` and `sendPendingPrepaidNotificationEmail(...)` call. Note the `OrderDetails` literal each constructs.
- `app/checkout/book-courier.ts` — find calls to `sendDispatchNotificationEmail(...)` and `sendAdminFailureAlertEmail(...)`. Note whether it constructs the `OrderDetails` itself or receives one from the caller.

- [ ] **Step 2: Extend `OrderDetails` type in `mailer.ts`**

Find the type definition. Add two optional + nullable fields next to the existing `paymentMethodDisplay`, `trackingCode`, `notes`:

```ts
export type OrderDetails = {
  // ... existing ...
  paymentMethodDisplay?: string;
  trackingCode?: string;
  notes?: string;
  rbNumber?: string | null;       // ← new
  paymentStatus?: string | null;  // ← new
};
```

Both nullable to gracefully handle the 21 legacy orders (NULL in DB).

- [ ] **Step 3: Add the `codAmountFor` helper**

Just above the first email function in `mailer.ts` (or adjacent to `formatAddress` if that exists), add:

```ts
/** Amount the courier should collect at delivery. Zero for any prepaid method;
 *  the order total for COD. */
function codAmountFor(
  order: Pick<OrderDetails, "paymentMethod" | "total">,
): number {
  return order.paymentMethod === "COD" ? order.total : 0;
}
```

Module-private. Not exported.

- [ ] **Step 4: Pass through from `actions.ts`**

For each mailer-call site in `app/checkout/actions.ts` that constructs an `OrderDetails` literal, add to the object:

```ts
rbNumber: created.rbNumber,
paymentStatus: created.paymentStatus,
```

where `created` is the variable holding the just-created Order row (from `tx.order.create({ ... })`). The exact variable name depends on the code — read first.

Both fields are optional on `OrderDetails`, so adding them anywhere in the literal is allowed; placement next to existing identifier-like fields (`orderId`) is preferred for readability.

- [ ] **Step 5: Pass through from `book-courier.ts`** (only if it constructs `OrderDetails`)

If `book-courier.ts` builds its own `OrderDetails` from an `order` parameter, propagate `order.rbNumber` and `order.paymentStatus` into it.

If `book-courier.ts` receives a complete `OrderDetails` from its caller, this file needs no change — `actions.ts`'s Step 4 covers it.

- [ ] **Step 6: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

- [ ] **Step 7: Run unit tests**

Run: `npm test`
Expected: 56 tests pass (existing). Templates haven't been changed yet, so they still render without the new fields — tests stay green.

- [ ] **Step 8: Commit**

```bash
git add app/_lib/mailer.ts app/checkout/actions.ts app/checkout/book-courier.ts
# only include book-courier.ts in the add if it was actually modified
git commit -m "feat(mailer): extend OrderDetails with rbNumber + paymentStatus; add codAmountFor"
```

---

## Task 2: Update `sendDispatchNotificationEmail` + dispatch test

**Files:**
- Modify: `app/_lib/mailer.ts` — `sendDispatchNotificationEmail` body (text + HTML) + subject
- Modify: `app/_lib/__tests__/mailer-dispatch.test.ts` — fixture + new assertions

- [ ] **Step 1: Read the current dispatch function**

Use Read on `app/_lib/mailer.ts` from the start of `sendDispatchNotificationEmail` to its end (the function spans roughly lines 327–430 today; verify). Identify:
- The exact text-body template (with the `ORDER:`, `WAYBILL:`, `COD AMOUNT:`, etc. lines).
- The HTML template's `.section` block listing those same fields.
- The current subject line: `[Dispatch] Order ${order.orderId} — Waybill ${waybillNumber}`.

- [ ] **Step 2: Update the subject**

```ts
// Before:
subject: `[Dispatch] Order ${order.orderId} — Waybill ${waybillNumber}`,

// After:
subject: `[Dispatch] ${order.rbNumber ?? `Order ${order.orderId}`} — Waybill ${waybillNumber}`,
```

When `rbNumber` is present, the subject reads `[Dispatch] RB1042 — Waybill 12345`. When NULL (legacy), it falls back to the existing `[Dispatch] Order abcd1234 — Waybill 12345`.

- [ ] **Step 3: Update the text body**

Change the `ORDER:` line to prefer RB number, the `COD AMOUNT:` line to use `codAmountFor`, and add a `PAYMENT:` line. Also add a `NOTES:` block when `order.notes` is truthy.

```ts
import { paymentStatusLabel } from "@/app/_lib/order-status";
```

(at the top of mailer.ts with the other imports)

Then in the text template:

```ts
const paymentLabel = paymentStatusLabel(order.paymentStatus);
const text = `A new COD order has been booked with Royal Express via Curfox.
${pdfNote}

ORDER:        ${order.rbNumber ?? order.orderId}
WAYBILL:      ${waybillNumber}
CUSTOMER:     ${order.customerName}
PHONE:        ${order.customerPhone ?? "n/a"}${paymentLabel ? `\nPAYMENT:      ${paymentLabel}` : ""}
COD AMOUNT:   ${formatPrice(codAmountFor(order))}
DESTINATION:  ${order.shippingAddress.city}

ITEMS:
${formatItemsList(order.items)}

ADDRESS:
  ${formatAddress(order.shippingAddress)}
${order.notes && order.notes.trim() ? `\nNOTES:\n  ${order.notes}\n` : ""}
Print ${pdfBuffer ? "the attached delivery-note.pdf" : "the waybill from the Curfox portal"} and hand the parcel + label to the Royal Express pickup rider.

─────────────
Dressing Bear · automated dispatch
`.trim();
```

The `${paymentLabel ? ... : ""}` conditional ensures the line is dropped when `paymentStatus` is NULL (legacy orders). Same for notes.

- [ ] **Step 4: Update the HTML body**

In the `.section` block, change the order/waybill/cod amount/payment lines:

```ts
<div class="section">
  <p><span class="label">Order:</span> ${escapeHtml(order.rbNumber ?? order.orderId)}</p>
  <p><span class="label">Waybill:</span> <strong>${escapeHtml(waybillNumber)}</strong></p>
  <p><span class="label">Customer:</span> ${escapeHtml(order.customerName)}</p>
  <p><span class="label">Phone:</span> ${escapeHtml(order.customerPhone ?? "n/a")}</p>
  ${paymentLabel ? `<p><span class="label">Payment:</span> ${escapeHtml(paymentLabel)}</p>` : ""}
  <p><span class="label">COD Amount:</span> <strong>${formatPrice(codAmountFor(order))}</strong></p>
  <p><span class="label">Destination:</span> ${escapeHtml(order.shippingAddress.city)}</p>
</div>
```

Also add a Notes section, conditionally, after the existing Shipping Address section:

```ts
${order.notes && order.notes.trim() ? `
<div class="section">
  <h3>Delivery Notes</h3>
  <p>${escapeHtml(order.notes).replace(/\n/g, "<br>")}</p>
</div>` : ""}
```

- [ ] **Step 5: Update the dispatch test**

Read `app/_lib/__tests__/mailer-dispatch.test.ts`. Identify:
- The fixture `OrderDetails` literal (with `line1`, `city`, `country`, `paymentMethod`, etc.).
- The existing assertions on the captured `sendMail` payload.

Extend the fixture:

```ts
const baseOrder: OrderDetails = {
  // ... existing fixture fields ...
  rbNumber: "RB1001",
  paymentStatus: "COD_PENDING",
  notes: "Please leave at the gate.",
};
```

(Adjust to the actual fixture variable name in the file.)

Add assertions on the captured payload after the existing ones (use the same access pattern the existing test uses — likely `vi.mocked(sendMail).mock.calls[0][0]`):

```ts
const mailArgs = vi.mocked(sendMailSpy).mock.calls[0][0]; // or whatever the existing pattern is
expect(mailArgs.subject).toContain("RB1001");
expect(mailArgs.text).toContain("RB1001");
expect(mailArgs.text).toContain("Cash on delivery");
expect(mailArgs.text).toContain("Please leave at the gate.");
// COD amount for a COD order equals the total.
// If the fixture's order has total 2440:
expect(mailArgs.text).toContain("LKR 2,440");  // adjust to the exact formatPrice output
```

If the fixture's total is something other than 2440, adjust the expected string. Match what `formatPrice(total)` actually renders (run a quick `formatPrice(2440)` in your head if needed — the format is `en-LK` locale, typically `"LKR 2,440"` or similar).

- [ ] **Step 6: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

- [ ] **Step 7: Run the dispatch test**

Run: `npx vitest run app/_lib/__tests__/mailer-dispatch.test.ts`
Expected: all tests pass.

If assertions fail because the formatted price doesn't match the exact string, adjust the literal. If `paymentStatusLabel` isn't imported, fix the import.

- [ ] **Step 8: Run full unit suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add app/_lib/mailer.ts app/_lib/__tests__/mailer-dispatch.test.ts
git commit -m "feat(mailer): dispatch email surfaces RB number, paymentStatus, COD amount, notes"
```

---

## Task 3: Update `sendPendingPrepaidNotificationEmail`

**Files:**
- Modify: `app/_lib/mailer.ts` — `sendPendingPrepaidNotificationEmail` body + subject

- [ ] **Step 1: Read the current function**

Use Read on `app/_lib/mailer.ts` around `sendPendingPrepaidNotificationEmail` (≈ L432–550, verify). Identify the subject, text body, HTML body.

- [ ] **Step 2: Update the subject**

```ts
// Before (whatever the current subject is — read first; example shape):
subject: `[New Order] ${order.orderId} — ${order.paymentMethodDisplay ?? order.paymentMethod}`,

// After:
subject: `[Awaiting Payment] ${order.rbNumber ?? `Order ${order.orderId}`} — ${order.paymentMethodDisplay ?? order.paymentMethod}`,
```

If the current subject differs significantly from the example, adapt — the rule is: include `rbNumber` (with CUID fallback) prominently, signal "awaiting payment".

- [ ] **Step 3: Update the text + HTML bodies**

Wherever the current text body shows the order ID, prefer `order.rbNumber ?? order.orderId`. Add a payment-status line via `paymentStatusLabel(order.paymentStatus)` (skip when null). Add a notes section when `order.notes` is truthy.

Pattern reused from Task 2:

Text:
```
ORDER:        ${order.rbNumber ?? order.orderId}
…existing fields…
${paymentLabel ? `\nPAYMENT:      ${paymentLabel}` : ""}
${order.notes && order.notes.trim() ? `\nNOTES:\n  ${order.notes}\n` : ""}
```

HTML — same conditional pattern, inside the existing `<div class="section">` block.

Where the function currently states the order is "not yet paid" (or similar), keep that text — the payment-status line is supplementary.

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

- [ ] **Step 5: Run unit tests**

Run: `npm test`
Expected: all tests pass. (No dedicated test for this function; the type system catches missing references.)

- [ ] **Step 6: Commit**

```bash
git add app/_lib/mailer.ts
git commit -m "feat(mailer): pending-prepaid email surfaces RB number, paymentStatus, notes"
```

---

## Task 4: Update `sendOrderConfirmationEmail` (customer + brand BCC)

The order-confirmation email goes to both the customer and (BCC) the brand. Same template body. Only the body changes — subject stays.

**Files:**
- Modify: `app/_lib/mailer.ts` — `sendOrderConfirmationEmail` body

- [ ] **Step 1: Read the current function**

Use Read on `app/_lib/mailer.ts` around `sendOrderConfirmationEmail` (≈ L115–230, verify). Note the text and HTML body structures.

- [ ] **Step 2: Update the text body**

Show RB number in the header / identifier section, e.g.:

```ts
// Before:
Order ID: ${order.orderId}

// After:
Order: ${order.rbNumber ?? order.orderId}
```

Add a payment-status line near the existing `Payment Method:` line:

```ts
${paymentLabel ? `Payment Status: ${paymentLabel}\n` : ""}
```

Where `paymentLabel = paymentStatusLabel(order.paymentStatus)` is computed once near the top of the function (consistent with Task 2).

- [ ] **Step 3: Update the HTML body**

Same change: the `<p><strong>Order ID:</strong> ${escapeHtml(order.orderId)}</p>` line becomes `<p><strong>Order:</strong> ${escapeHtml(order.rbNumber ?? order.orderId)}</p>`. Add a `<p><strong>Payment Status:</strong> ${escapeHtml(paymentLabel)}</p>` line when `paymentLabel` is non-null.

The customer-facing copy ("Delivery" not "Shipping") was already updated in slice A's review fixup — don't re-rename anything.

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

- [ ] **Step 5: Run unit tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/mailer.ts
git commit -m "feat(mailer): order-confirmation email shows RB number and payment status"
```

---

## Task 5: Update `sendAdminFailureAlertEmail`

**Files:**
- Modify: `app/_lib/mailer.ts` — `sendAdminFailureAlertEmail` body + subject

- [ ] **Step 1: Read the current function**

Use Read on `app/_lib/mailer.ts` around `sendAdminFailureAlertEmail` (likely below the others; verify exact line range). Note the subject, body, and what failure context it currently includes.

- [ ] **Step 2: Update the subject**

```ts
// Before (whatever the current subject is — example):
subject: `[Failure] Order ${order.orderId} — ${failureSummary}`,

// After:
subject: `[Failure] ${order.rbNumber ?? `Order ${order.orderId}`} — ${failureSummary}`,
```

The `failureSummary` (or whatever the current short description variable is) stays.

- [ ] **Step 3: Update the body**

Show RB number in the body header. Add a payment-status line via `paymentStatusLabel` (skip when null). Notes — only if the existing body already shows them; otherwise it's a failure alert, notes may be irrelevant. Use judgement.

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

- [ ] **Step 5: Run unit tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/mailer.ts
git commit -m "feat(mailer): failure alert email shows RB number and payment status"
```

---

## Task 6: Document `BRAND_EMAIL` in `.env.local.example`

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: Read the current file**

Use Read on `.env.local.example`. Find the `BRAND_EMAIL=` line (or add it near the other email-related vars like `SMTP_FROM`).

- [ ] **Step 2: Update or add the comment**

```env
# Brand-side email address. Receives dispatch notifications, pending-prepaid
# alerts, order-confirmation BCCs, and failure alerts.
# Production value: dressingbear@gmail.com
BRAND_EMAIL=
```

If the line already exists with a different comment, replace the comment with the above. Keep the empty value (no real address checked into the example file).

- [ ] **Step 3: Commit**

```bash
git add .env.local.example
git commit -m "docs(env): note production BRAND_EMAIL value (dressingbear@gmail.com)"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

- [ ] **Step 2: Run the full unit test suite**

Run: `npm test`
Expected: all tests pass. (Existing 56 unit tests + the dispatch-test assertions added in Task 2.)

- [ ] **Step 3: Run e2e tests**

Run: `npm run test:e2e`
Expected: all e2e tests pass (auth-state, delivery-zone-pricing, order-confirmation).

These are sanity checks — slice E doesn't touch the e2e-covered paths, but should not regress them.

- [ ] **Step 4: Run the production build**

Run: `npm run build`
Expected: build succeeds, 26 routes generated, no TS errors.

- [ ] **Step 5: Optional manual smoke**

If a dev SMTP capture tool (e.g., MailHog or Mailtrap) is set up, run `npm run dev`, place a COD order, and inspect the captured dispatch email. Verify:
- Subject contains `RB####`.
- Body contains the RB number, "Cash on delivery" payment status line, correct COD amount line (full order total, not zero), and any notes the customer left.

If no dev SMTP is set up, skip — the unit assertion in Task 2 is the regression net.

- [ ] **Step 6: Final commit (only if smoke surfaced anything)**

```bash
git add <touched files>
git commit -m "chore(mailer): smoke-test tweaks"
```

---

## Wrap-up

After Task 7 passes:

1. Push the feature branch (`feat/admin-email-overhaul` or similar).
2. Merge fast-forward into `develop`, push `develop`.
3. Merge `develop` into `main` with `--no-ff`, push `main`.
4. Delete the feature branch local + remote.

The merchant should update their production `BRAND_EMAIL` env var to `dressingbear@gmail.com` (or whatever address the merchant prefers) before the next real order is placed.
