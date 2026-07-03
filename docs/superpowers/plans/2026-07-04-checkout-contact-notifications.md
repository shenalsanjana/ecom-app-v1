# Checkout Contact Details & SMS Order Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SMS order notifications (confirmation/dispatch/cancellation) alongside existing email via one dispatcher, pre-fill registered-customer checkout contact + address with an optional alternate delivery number, make guest email optional, and relabel the login identifier to "Email or Mobile Number".

**Architecture:** A single `order-notifications.ts` dispatcher owns recipient rules and per-channel, idempotent (atomic-claim) fan-out to the existing mailer and new Notify.lk SMS templates; the five existing customer send-points call it instead of the mailer directly. Checkout loads the customer's saved contact/address server-side and accepts an order-scoped alternate phone that flows only to the courier.

**Tech Stack:** Next.js 16 (App Router), NextAuth v5, Prisma + PostgreSQL, Zod v4, Vitest, nodemailer (SMTP), Notify.lk (SMS).

Design spec: `docs/superpowers/specs/2026-07-04-checkout-contact-and-sms-notifications-design.md`.

## Global Constraints

- **No local database.** `DATABASE_URL` is unset. Do NOT run `prisma migrate dev`, `next build`, or Playwright locally. Migrations are **hand-authored SQL**. Local gate for every task = **`npm run test`** (which runs `vitest run`) **+ `npx tsc --noEmit`**. E2E specs are edited for CI, not run here.
- **Test runner:** `npm run test` runs the whole suite (`vitest run`). Vitest has `globals: false` — always `import { describe, it, expect, vi, beforeEach } from "vitest"`. The `@` path alias resolves to the repo root. Mock Prisma/mailer/sms with `vi.hoisted(() => ({...}))` + `vi.mock("@/app/_lib/…", () => ({...}))` (see existing tests).
- **No new environment variables.** Order SMS reuses `NOTIFY_LK_USER_ID` / `NOTIFY_LK_API_KEY` / `NOTIFY_LK_SENDER_ID` and `CONTACT_NUMBER` (all already present).
- **Primary contact phone = mobile.** Validate with `LkMobileSchema` (`^\+947\d{8}$`, canonicalises to `+94…`). The **alternate** phone uses the permissive `LkPhoneSchema` (allows landline).
- **Alternate phone is Order-scoped and courier-only.** It is stored on `Order.alternatePhone`, forwarded to Curfox as `customer_secondary_phone`, and must **never** update `User`/`Address` or receive a notification.
- **SMS events are exactly three:** confirmation, dispatch, cancellation. No delivered/marketing/opt-out SMS. Admin "resend confirmation" stays **email-only**.
- **The dispatcher never throws.** Each channel is guarded; a send failure is logged and its idempotency flag released for retry; order/payment/dispatch flow never depends on a notification succeeding.
- **Registered-with-email gets both email and SMS.** Guest gets SMS always, plus email only when supplied.
- **Commits:** Conventional Commits (`feat(...)`, `test(...)`, `refactor(...)`, `docs(...)`). End every commit message with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|------|----------------|
| `prisma/schema.prisma` | Add 4 nullable `Order` columns |
| `prisma/migrations/<ts>_order_contact_sms/migration.sql` | Hand-authored additive DDL |
| `app/_lib/mailer.ts` | Add `alternatePhone?: string \| null` to `OrderDetails` (type only) |
| `app/_lib/sms.ts` | Add 3 order-SMS templates (reuse private `sendSms`) |
| `app/_lib/order-notifications.ts` (new) | Dispatcher: recipient rules + per-channel idempotency + fan-out |
| `app/_lib/payments/order-finalization.ts` | Prepaid confirmation → dispatcher |
| `app/checkout/actions.ts` | Guest email optional, mobile validation, alternate phone, COD confirmation → dispatcher |
| `app/checkout/book-courier.ts` | Customer dispatch → dispatcher; alternate → `customer_secondary_phone` |
| `app/admin/orders/actions.ts` | Dispatch/cancel → dispatcher; build `alternatePhone` into details |
| `app/checkout/page.tsx` | Load `User.phone` + default `Address`; pass to client |
| `app/checkout/checkout-client.tsx` | Seed phone/address; alternate field; guest email optional; helper; mobile pattern |
| `app/(auth)/login/page.tsx`, `forgot-password/page.tsx`, `_lib/auth.ts`, `_lib/validation.ts`, `(auth)/actions.ts` | "Email or Mobile Number" copy |
| `app/_lib/__tests__/order-sms.test.ts` (new) | SMS templates |
| `app/_lib/__tests__/order-notifications.test.ts` (new) | Routing + idempotency matrix |
| Existing tests | Updated to mock the dispatcher / new schema |

---

## Task 1: Data model — Order columns, migration, `OrderDetails` type

**Files:**
- Modify: `prisma/schema.prisma:132-178` (`Order` model)
- Create: `prisma/migrations/<ts>_order_contact_sms/migration.sql`
- Modify: `app/_lib/mailer.ts:95-117` (`OrderDetails` type)

**Interfaces:**
- Produces: `Order.alternatePhone`, `Order.confirmationSmsSentAt`, `Order.dispatchSmsSentAt`, `Order.cancellationSmsSentAt` (all nullable); `OrderDetails.alternatePhone?: string | null`.

- [ ] **Step 1: Add the four columns to the `Order` model**

In `prisma/schema.prisma`, inside `model Order`, add immediately after the `customerPhone String` line (currently line 137):

```prisma
  customerPhone         String
  alternatePhone        String?   // optional secondary delivery phone; courier-only, order-scoped
  confirmationSmsSentAt DateTime? // idempotency stamp — customer order-confirmation SMS
  dispatchSmsSentAt     DateTime? // idempotency stamp — customer dispatch SMS
  cancellationSmsSentAt DateTime? // idempotency stamp — customer cancellation SMS
```

- [ ] **Step 2: Hand-author the migration**

Look in `prisma/migrations/` for the most recent folder; create a new folder whose numeric timestamp prefix is later than it, e.g. `prisma/migrations/20260704120000_order_contact_sms/`. Create `migration.sql` inside it:

```sql
-- Add order-scoped alternate delivery phone + per-channel SMS idempotency stamps.
ALTER TABLE "Order"
  ADD COLUMN "alternatePhone" TEXT,
  ADD COLUMN "confirmationSmsSentAt" TIMESTAMP(3),
  ADD COLUMN "dispatchSmsSentAt" TIMESTAMP(3),
  ADD COLUMN "cancellationSmsSentAt" TIMESTAMP(3);
```

- [ ] **Step 3: Add `alternatePhone` to the `OrderDetails` type**

In `app/_lib/mailer.ts`, in the `OrderDetails` type (line ~99), add after `customerPhone?: string;`:

```ts
  customerPhone?: string;
  alternatePhone?: string | null; // secondary delivery phone → courier only
```

- [ ] **Step 4: Regenerate the Prisma client and typecheck**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no schema errors. (If it complains about a missing `DATABASE_URL`, set a dummy for the command only: `$env:DATABASE_URL="postgresql://x:x@localhost:5432/x"; npx prisma generate`.)

Run: `npx tsc --noEmit`
Expected: no errors (the new fields exist on the generated `Order` type and `OrderDetails`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations app/_lib/mailer.ts
git commit -m "feat(order): add alternate phone + SMS idempotency columns"
```

---

## Task 2: Order SMS templates

**Files:**
- Modify: `app/_lib/sms.ts`
- Test: `app/_lib/__tests__/order-sms.test.ts` (new)

**Interfaces:**
- Consumes: private `sendSms(phone, message)` (already in `sms.ts`).
- Produces:
  - `sendOrderConfirmationSms(p: { phone: string; ref: string; total: number }): Promise<void>`
  - `sendOrderDispatchedSms(p: { phone: string; ref: string; trackingCode: string; carrier: string }): Promise<void>`
  - `sendOrderCancelledSms(p: { phone: string; ref: string }): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/order-sms.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  sendOrderConfirmationSms,
  sendOrderDispatchedSms,
  sendOrderCancelledSms,
  __setTestSmsSender,
} from "../sms";

let captured: { to: string; message: string }[];
beforeEach(() => {
  captured = [];
  __setTestSmsSender(async (to, message) => {
    captured.push({ to, message });
  });
});

describe("order SMS templates", () => {
  it("confirmation: strips +, names the ref and total, promises a shipping text", async () => {
    await sendOrderConfirmationSms({ phone: "+94771234567", ref: "WEB1001", total: 2440 });
    expect(captured[0].to).toBe("94771234567");
    expect(captured[0].message).toContain("WEB1001");
    expect(captured[0].message).toMatch(/2440/);
    expect(captured[0].message).toMatch(/ship/i);
  });

  it("dispatched: names the ref, carrier, and tracking code", async () => {
    await sendOrderDispatchedSms({
      phone: "+94771234567",
      ref: "WEB1001",
      trackingCode: "RA123",
      carrier: "Royal Express",
    });
    expect(captured[0].message).toContain("WEB1001");
    expect(captured[0].message).toContain("Royal Express");
    expect(captured[0].message).toContain("RA123");
  });

  it("cancelled: names the ref and a contact number", async () => {
    await sendOrderCancelledSms({ phone: "+94771234567", ref: "WEB1001" });
    expect(captured[0].message).toContain("WEB1001");
    expect(captured[0].message).toMatch(/cancel/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test`
Expected: FAIL — `order-sms.test.ts` errors with "does not provide an export named 'sendOrderConfirmationSms'".

- [ ] **Step 3: Implement the templates**

In `app/_lib/sms.ts`, add a contact constant near the top (after line 1) and the three exports at the end of the file:

```ts
const CONTACT_NUMBER = process.env.CONTACT_NUMBER ?? "+94 740545536";
```

```ts
export function sendOrderConfirmationSms(p: { phone: string; ref: string; total: number }): Promise<void> {
  return sendSms(
    p.phone,
    `Dressing Bear: order ${p.ref} confirmed. Total Rs ${Math.round(p.total)}. We'll text you when it ships.`,
  );
}

export function sendOrderDispatchedSms(p: {
  phone: string;
  ref: string;
  trackingCode: string;
  carrier: string;
}): Promise<void> {
  return sendSms(
    p.phone,
    `Dressing Bear: order ${p.ref} shipped via ${p.carrier}. Track: ${p.trackingCode}.`,
  );
}

export function sendOrderCancelledSms(p: { phone: string; ref: string }): Promise<void> {
  return sendSms(
    p.phone,
    `Dressing Bear: order ${p.ref} has been cancelled. Questions? Call ${CONTACT_NUMBER}.`,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS — `order-sms.test.ts` green; whole suite green.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/sms.ts app/_lib/__tests__/order-sms.test.ts
git commit -m "feat(sms): add order confirmation/dispatch/cancellation templates"
```

---

## Task 3: Notification dispatcher

**Files:**
- Create: `app/_lib/order-notifications.ts`
- Test: `app/_lib/__tests__/order-notifications.test.ts` (new)

**Interfaces:**
- Consumes: `prisma.order.updateMany`; `sendOrderConfirmationEmail`/`sendCustomerDispatchEmail`/`sendCustomerCancellationEmail`/`logMailerError`/`OrderDetails` (mailer); `shouldEmailCustomer` (mailer-guard); the Task 2 SMS templates; `orderReference` (order-reference); `DELIVERY_COMPANY_NAME` (carrier).
- Produces:
  - `notifyOrderConfirmed(details: OrderDetails): Promise<void>`
  - `notifyOrderDispatched(details: OrderDetails, trackingCode: string): Promise<void>`
  - `notifyOrderCancelled(details: OrderDetails): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/order-notifications.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { orderUpdateMany } = vi.hoisted(() => ({ orderUpdateMany: vi.fn() }));
const { sendOrderConfirmationEmail, sendCustomerDispatchEmail, sendCustomerCancellationEmail } =
  vi.hoisted(() => ({
    sendOrderConfirmationEmail: vi.fn(),
    sendCustomerDispatchEmail: vi.fn(),
    sendCustomerCancellationEmail: vi.fn(),
  }));
const { sendOrderConfirmationSms, sendOrderDispatchedSms, sendOrderCancelledSms } = vi.hoisted(() => ({
  sendOrderConfirmationSms: vi.fn(),
  sendOrderDispatchedSms: vi.fn(),
  sendOrderCancelledSms: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({ prisma: { order: { updateMany: orderUpdateMany } } }));
vi.mock("@/app/_lib/mailer", () => ({
  sendOrderConfirmationEmail,
  sendCustomerDispatchEmail,
  sendCustomerCancellationEmail,
  logMailerError: vi.fn(),
}));
vi.mock("@/app/_lib/sms", () => ({
  sendOrderConfirmationSms,
  sendOrderDispatchedSms,
  sendOrderCancelledSms,
}));

import type { OrderDetails } from "@/app/_lib/mailer";
import {
  notifyOrderConfirmed,
  notifyOrderDispatched,
  notifyOrderCancelled,
} from "../order-notifications";

const withEmail: OrderDetails = {
  orderId: "ORD-1",
  customerName: "Jane",
  customerEmail: "jane@example.com",
  customerPhone: "+94771234567",
  items: [{ name: "Tee", size: "M", price: 1000, quantity: 1 }],
  subtotal: 1000,
  shipping: 0,
  total: 1000,
  shippingAddress: { line1: "1 Main", city: "Colombo", country: "Sri Lanka" },
  paymentMethod: "COD",
  webNumber: "WEB1001",
};
const phoneOnly: OrderDetails = { ...withEmail, customerEmail: "" };

beforeEach(() => {
  vi.clearAllMocks();
  orderUpdateMany.mockResolvedValue({ count: 1 });
});

describe("notifyOrderConfirmed", () => {
  it("with email → sends both the confirmation email and SMS", async () => {
    await notifyOrderConfirmed(withEmail);
    expect(sendOrderConfirmationEmail).toHaveBeenCalledOnce();
    expect(sendOrderConfirmationSms).toHaveBeenCalledOnce();
    expect(sendOrderConfirmationSms.mock.calls[0][0]).toMatchObject({
      phone: "+94771234567",
      ref: "WEB1001",
      total: 1000,
    });
  });

  it("phone-only (no email) → SMS only, email skipped, resolves without throwing", async () => {
    await expect(notifyOrderConfirmed(phoneOnly)).resolves.toBeUndefined();
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
    expect(sendOrderConfirmationSms).toHaveBeenCalledOnce();
  });

  it("is idempotent — a repeated trigger sends the SMS at most once", async () => {
    orderUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await notifyOrderConfirmed(phoneOnly); // claim wins → sends
    await notifyOrderConfirmed(phoneOnly); // claim loses → skips
    expect(sendOrderConfirmationSms).toHaveBeenCalledOnce();
  });

  it("releases the SMS flag when the send fails, and never throws", async () => {
    sendOrderConfirmationSms.mockRejectedValueOnce(new Error("notify down"));
    await expect(notifyOrderConfirmed(phoneOnly)).resolves.toBeUndefined();
    const release = orderUpdateMany.mock.calls.find(
      (c) => c[0]?.data?.confirmationSmsSentAt === null,
    );
    expect(release).toBeTruthy();
  });
});

describe("notifyOrderDispatched", () => {
  it("with email → dispatch email (with tracking) and SMS both sent", async () => {
    await notifyOrderDispatched(withEmail, "RA999");
    expect(sendCustomerDispatchEmail).toHaveBeenCalledOnce();
    expect(sendCustomerDispatchEmail.mock.calls[0][0].trackingCode).toBe("RA999");
    expect(sendOrderDispatchedSms).toHaveBeenCalledOnce();
    expect(sendOrderDispatchedSms.mock.calls[0][0]).toMatchObject({ trackingCode: "RA999" });
  });
});

describe("notifyOrderCancelled", () => {
  it("with email → cancellation email and SMS both sent", async () => {
    await notifyOrderCancelled(withEmail);
    expect(sendCustomerCancellationEmail).toHaveBeenCalledOnce();
    expect(sendOrderCancelledSms).toHaveBeenCalledOnce();
  });

  it("phone-only → SMS only, no throw", async () => {
    await expect(notifyOrderCancelled(phoneOnly)).resolves.toBeUndefined();
    expect(sendCustomerCancellationEmail).not.toHaveBeenCalled();
    expect(sendOrderCancelledSms).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test`
Expected: FAIL — cannot resolve `../order-notifications`.

- [ ] **Step 3: Implement the dispatcher**

Create `app/_lib/order-notifications.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import {
  sendOrderConfirmationEmail,
  sendCustomerDispatchEmail,
  sendCustomerCancellationEmail,
  logMailerError,
  type OrderDetails,
} from "@/app/_lib/mailer";
import { shouldEmailCustomer } from "@/app/_lib/mailer-guard";
import {
  sendOrderConfirmationSms,
  sendOrderDispatchedSms,
  sendOrderCancelledSms,
} from "@/app/_lib/sms";
import { orderReference } from "@/app/_lib/order-reference";
import { DELIVERY_COMPANY_NAME } from "@/app/_lib/carrier";

function logSmsError(context: string, meta: Record<string, unknown>, err: unknown): void {
  console.error(`[sms] ${context} failed`, {
    ...meta,
    error: err instanceof Error ? err.message : String(err),
  });
}

// Atomically flip an "unsent" flag to "sent". Returns true only for the caller
// whose conditional updateMany changed the row — so a repeated trigger (e.g.
// Koko's double payment callback) sends at most one message per channel.
async function claimOnce(
  orderId: string,
  guard: Prisma.OrderWhereInput,
  mark: Prisma.OrderUpdateManyMutationInput,
  label: string,
): Promise<boolean> {
  try {
    const r = await prisma.order.updateMany({ where: { id: orderId, ...guard }, data: mark });
    return r.count === 1;
  } catch (err) {
    logSmsError(`${label}-claim`, { orderId }, err);
    return false;
  }
}

// Undo a claim so a later legitimate retry can re-send.
async function releaseOnce(orderId: string, mark: Prisma.OrderUpdateManyMutationInput): Promise<void> {
  await prisma.order.updateMany({ where: { id: orderId }, data: mark }).catch(() => {});
}

/**
 * Order confirmation → email (when present, guarded by the one-time emailSent
 * flag) and SMS (always, to the order's mobile). Never throws.
 */
export async function notifyOrderConfirmed(details: OrderDetails): Promise<void> {
  const orderId = details.orderId;

  if (
    shouldEmailCustomer(details.customerEmail) &&
    (await claimOnce(orderId, { emailSent: false }, { emailSent: true }, "confirmation-email"))
  ) {
    try {
      await sendOrderConfirmationEmail(details);
    } catch (err) {
      await releaseOnce(orderId, { emailSent: false });
      logMailerError("order-confirmation", { orderId, webNumber: details.webNumber }, err);
    }
  }

  if (
    details.customerPhone &&
    (await claimOnce(
      orderId,
      { confirmationSmsSentAt: null },
      { confirmationSmsSentAt: new Date() },
      "confirmation-sms",
    ))
  ) {
    try {
      await sendOrderConfirmationSms({
        phone: details.customerPhone,
        ref: orderReference(details),
        total: details.total,
      });
    } catch (err) {
      await releaseOnce(orderId, { confirmationSmsSentAt: null });
      logSmsError("order-confirmation", { orderId, webNumber: details.webNumber }, err);
    }
  }
}

/**
 * Dispatch → customer dispatch email (guarded by customerDispatchEmailSentAt)
 * and SMS with the tracking code. Never throws.
 */
export async function notifyOrderDispatched(details: OrderDetails, trackingCode: string): Promise<void> {
  const orderId = details.orderId;

  if (
    shouldEmailCustomer(details.customerEmail) &&
    (await claimOnce(
      orderId,
      { customerDispatchEmailSentAt: null },
      { customerDispatchEmailSentAt: new Date() },
      "dispatch-email",
    ))
  ) {
    try {
      await sendCustomerDispatchEmail({ ...details, trackingCode });
    } catch (err) {
      await releaseOnce(orderId, { customerDispatchEmailSentAt: null });
      logMailerError("dispatch", { orderId, webNumber: details.webNumber }, err);
    }
  }

  if (
    details.customerPhone &&
    (await claimOnce(
      orderId,
      { dispatchSmsSentAt: null },
      { dispatchSmsSentAt: new Date() },
      "dispatch-sms",
    ))
  ) {
    try {
      await sendOrderDispatchedSms({
        phone: details.customerPhone,
        ref: orderReference(details),
        trackingCode,
        carrier: DELIVERY_COMPANY_NAME,
      });
    } catch (err) {
      await releaseOnce(orderId, { dispatchSmsSentAt: null });
      logSmsError("dispatch", { orderId, webNumber: details.webNumber }, err);
    }
  }
}

/**
 * Cancellation → cancellation email (guarded by shouldEmailCustomer; no email
 * flag column exists, and the cancel action's status transition already
 * prevents re-entry) and SMS (guarded by cancellationSmsSentAt). Never throws.
 */
export async function notifyOrderCancelled(details: OrderDetails): Promise<void> {
  const orderId = details.orderId;

  if (shouldEmailCustomer(details.customerEmail)) {
    try {
      await sendCustomerCancellationEmail(details);
    } catch (err) {
      logMailerError("cancellation", { orderId, webNumber: details.webNumber }, err);
    }
  }

  if (
    details.customerPhone &&
    (await claimOnce(
      orderId,
      { cancellationSmsSentAt: null },
      { cancellationSmsSentAt: new Date() },
      "cancellation-sms",
    ))
  ) {
    try {
      await sendOrderCancelledSms({ phone: details.customerPhone, ref: orderReference(details) });
    } catch (err) {
      await releaseOnce(orderId, { cancellationSmsSentAt: null });
      logSmsError("cancellation", { orderId, webNumber: details.webNumber }, err);
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS — `order-notifications.test.ts` green.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/order-notifications.ts app/_lib/__tests__/order-notifications.test.ts
git commit -m "feat(notifications): add unified order-notification dispatcher (email + SMS)"
```

---

## Task 4: Route prepaid confirmation through the dispatcher

**Files:**
- Modify: `app/_lib/payments/order-finalization.ts:3-8, 77-84`
- Test: `app/_lib/payments/__tests__/order-finalization.test.ts:37-41, 88, 108, 134`

**Interfaces:**
- Consumes: `notifyOrderConfirmed` (Task 3).

- [ ] **Step 1: Update the test first (mock the dispatcher, assert on it)**

In `app/_lib/payments/__tests__/order-finalization.test.ts`:

1. Add a hoisted spy + mock (after the existing `vi.mock("@/app/_lib/mailer", …)` block near line 41):

```ts
const { notifyOrderConfirmed } = vi.hoisted(() => ({ notifyOrderConfirmed: vi.fn() }));
vi.mock("@/app/_lib/order-notifications", () => ({ notifyOrderConfirmed }));
```

2. Import it alongside the finalization import (line 45):

```ts
import { notifyOrderConfirmed } from "@/app/_lib/order-notifications";
import { finalizeFailedPayment, finalizePaidPayment } from "../order-finalization";
```

3. Swap the two confirmation assertions:
   - Line 88 `expect(sendOrderConfirmationEmail).toHaveBeenCalledOnce();` → `expect(notifyOrderConfirmed).toHaveBeenCalledOnce();`
   - Line 108 `expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();` → `expect(notifyOrderConfirmed).not.toHaveBeenCalled();`
   - Line 134 `expect(sendOrderConfirmationEmail).toHaveBeenCalledOnce();` → `expect(notifyOrderConfirmed).toHaveBeenCalledOnce();`

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test`
Expected: FAIL — `order-finalization.test.ts` expects `notifyOrderConfirmed` calls, but the source still calls `sendOrderConfirmationEmail`.

- [ ] **Step 3: Wire the dispatcher into finalization**

In `app/_lib/payments/order-finalization.ts`:

1. Update imports (lines 3-8) — drop `sendOrderConfirmationEmail`, keep the rest, add the dispatcher:

```ts
import {
  logMailerError,
  sendAdminFailureAlertEmail,
  type OrderDetails,
} from "@/app/_lib/mailer";
import { notifyOrderConfirmed } from "@/app/_lib/order-notifications";
```

2. Replace the `if (!updated.emailSent) { … }` block (lines 77-84) with:

```ts
    try {
      await notifyOrderConfirmed(details);
    } catch (err) {
      logMailerError("order-confirmation", { orderId, webNumber: updated.webNumber }, err);
    }
```

(The outer atomic `paymentStatus` claim above is unchanged — it remains the single-entry gate; the dispatcher adds SMS and sets `emailSent` via its own claim.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors (confirm `sendOrderConfirmationEmail` is no longer referenced in this file).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/payments/order-finalization.ts app/_lib/payments/__tests__/order-finalization.test.ts
git commit -m "refactor(payments): send prepaid confirmation via notification dispatcher"
```

---

## Task 5: Checkout action — guest email optional, mobile validation, alternate phone, COD confirmation via dispatcher

**Files:**
- Modify: `app/checkout/actions.ts:5, 7-15, 51-65, 128-160, 239-270, 285-329`
- Test: `app/checkout/__tests__/actions.test.ts` (add dispatcher mock + new cases; swap COD/prepaid confirmation assertions)

**Interfaces:**
- Consumes: `LkMobileSchema` (validation), `notifyOrderConfirmed` (Task 3), `OrderDetails.alternatePhone` (Task 1).

- [ ] **Step 1: Update the test first**

In `app/checkout/__tests__/actions.test.ts`:

1. Add the dispatcher mock (after the mailer mock, ~line 47) and import:

```ts
const { notifyOrderConfirmed } = vi.hoisted(() => ({ notifyOrderConfirmed: vi.fn(async () => undefined) }));
vi.mock("@/app/_lib/order-notifications", () => ({ notifyOrderConfirmed }));
```

```ts
import { notifyOrderConfirmed } from "@/app/_lib/order-notifications";
```

2. In `beforeEach` (line 69-74) add: `vi.mocked(notifyOrderConfirmed).mockClear();`

3. Swap COD confirmation assertions:
   - Line 82 `expect(sendOrderConfirmationEmail).toHaveBeenCalledOnce();` → `expect(notifyOrderConfirmed).toHaveBeenCalledOnce();`
   - Line 109 `expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();` → `expect(notifyOrderConfirmed).not.toHaveBeenCalled();`
   - Line 152 (`returns success even if customer-confirmation email fails`): change `vi.mocked(sendOrderConfirmationEmail).mockRejectedValueOnce(...)` → `vi.mocked(notifyOrderConfirmed).mockRejectedValueOnce(new Error("dispatcher down"));`

4. Replace the `describe("processOrder — phone-only customer (no email)")` block (lines 184-206) — the email-skip decision now lives in the dispatcher, so assert the dispatcher is invoked either way:

```ts
describe("processOrder — phone-only customer (no email)", () => {
  it("COD checkout with no customer email: order succeeds and confirmation is dispatched", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "U1", name: "Phone Customer", email: null },
    } as never);
    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(result.success).toBe(true);
    expect(notifyOrderConfirmed).toHaveBeenCalledOnce();
  });
});
```

5. Add a new describe block for the contact-detail rules:

```ts
describe("processOrder — contact details", () => {
  it("guest checkout without an email succeeds (email now optional)", async () => {
    const result = await processOrder({
      ...baseInput,
      guestInfo: { name: "Jane Doe", phone: "+94770000000" },
      paymentMethod: "COD",
    });
    expect(result.success).toBe(true);
  });

  it("stores the primary contact number in canonical +94 form", async () => {
    await processOrder({ ...baseInput, contactPhone: "0770000000", paymentMethod: "COD" });
    expect(txOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerPhone: "+94770000000" }),
      }),
    );
  });

  it("rejects a landline primary number (the SMS target must be mobile)", async () => {
    const result = await processOrder({ ...baseInput, contactPhone: "0112345678", paymentMethod: "COD" });
    expect(result.success).toBe(false);
  });

  it("persists the alternate phone on the order (courier-only; profile untouched)", async () => {
    await processOrder({ ...baseInput, alternatePhone: "0712223333", paymentMethod: "COD" });
    expect(txOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ alternatePhone: "0712223333" }),
      }),
    );
  });
});
```

(The prisma mock exposes no `user.update`, so any accidental profile write would throw — the alternate-phone test's profile safety is guaranteed by construction.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test`
Expected: FAIL — `actions.test.ts` (new cases reference `alternatePhone`; assertions expect `notifyOrderConfirmed`; guest-without-email currently rejected by the required-email schema).

- [ ] **Step 3: Implement the action changes**

In `app/checkout/actions.ts`:

1. Imports (line 5) — add `LkMobileSchema`:

```ts
import { LkPhoneSchema, LkMobileSchema } from "@/app/_lib/validation";
```

2. Imports (lines 7-15) — drop `sendOrderConfirmationEmail` and `shouldEmailCustomer` (line 15), add the dispatcher. The block becomes:

```ts
import {
  sendPendingPrepaidNotificationEmail,
  sendAdminFailureAlertEmail,
  logMailerError,
  type OrderItem,
  type OrderDetails,
} from "@/app/_lib/mailer";
import { notifyOrderConfirmed } from "@/app/_lib/order-notifications";
import { prisma } from "@/app/_lib/prisma";
```

(Delete the `import { shouldEmailCustomer } from "@/app/_lib/mailer-guard";` line.)

3. `GuestInfoSchema` (lines 51-55) — email optional, phone mobile:

```ts
const GuestInfoSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  phone: LkMobileSchema,
});
```

4. `ProcessOrderSchema` (lines 57-65) — mobile primary + optional alternate:

```ts
const ProcessOrderSchema = z.object({
  items: z.array(ItemInputSchema).min(1, "Cart is empty"),
  shippingAddress: AddressSchema,
  paymentMethod: z.enum(["COD", "PAYHERE", "KOKO", "MINTPAY"]),
  contactPhone: LkMobileSchema,
  alternatePhone: LkPhoneSchema.optional(),
  guestInfo: GuestInfoSchema.optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  notes: z.string().trim().max(500).optional(),
});
```

5. Destructure `alternatePhone` (line 128-129):

```ts
  const { items, shippingAddress, paymentMethod, contactPhone, alternatePhone, guestInfo, idempotencyKey, notes } =
    parsed.data;
```

6. Guest branch (lines 150-154) — tolerate an empty email:

```ts
  } else if (guestInfo) {
    const email = guestInfo.email && guestInfo.email.length > 0 ? guestInfo.email : null;
    customerName = guestInfo.name;
    customerEmail = email ?? "";
    guestName = guestInfo.name;
    guestEmail = email;
  } else {
```

7. Persist `alternatePhone` in `tx.order.create` data (after `customerPhone: contactPhone,`, line 245):

```ts
          customerPhone: contactPhone,
          alternatePhone: alternatePhone ?? null,
```

8. Add `alternatePhone` to `orderDetailsForEmail` (after `customerPhone: contactPhone,`, line 289):

```ts
    customerPhone: contactPhone,
    alternatePhone: alternatePhone ?? null,
```

9. Replace the COD confirmation block (lines 308-329) with:

```ts
  if (paymentMethod === "COD") {
    try {
      await notifyOrderConfirmed({ ...orderDetailsForEmail, trackingCode });
    } catch (error) {
      logMailerError("order-confirmation", { orderId, webNumber: created.webNumber }, error);
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS — `actions.test.ts` green.

Run: `npx tsc --noEmit`
Expected: no errors (confirm `sendOrderConfirmationEmail`/`shouldEmailCustomer` are no longer referenced in `actions.ts`).

- [ ] **Step 5: Commit**

```bash
git add app/checkout/actions.ts app/checkout/__tests__/actions.test.ts
git commit -m "feat(checkout): optional guest email, mobile-only primary, alternate phone, dispatcher confirmation"
```

---

## Task 6: Route dispatch & cancellation through the dispatcher

**Files:**
- Modify: `app/checkout/book-courier.ts:12-19, 97-122, 250`
- Modify: `app/admin/orders/actions.ts` (cancellation helper ~272-285; `dispatchManually` ~330-339; imports)
- Test: `app/checkout/__tests__/book-courier.test.ts:19-24, 41-45, 105-139`
- Test: `app/admin/orders/__tests__/actions.test.ts:25-31, 201-213, 368-424`

**Interfaces:**
- Consumes: `notifyOrderDispatched`, `notifyOrderCancelled` (Task 3).

- [ ] **Step 1: Update `book-courier.test.ts`**

1. Add the dispatcher mock (after the mailer mock, line 24) + import:

```ts
vi.mock("@/app/_lib/order-notifications", () => ({ notifyOrderDispatched: vi.fn() }));
```

```ts
import { notifyOrderDispatched } from "@/app/_lib/order-notifications";
```

2. In `beforeEach` add: `vi.mocked(notifyOrderDispatched).mockReset();`

3. Happy-path "emails the customer once" (lines 105-123) — replace the customer-email assertions (120-122) with:

```ts
    expect(notifyOrderDispatched).toHaveBeenCalledOnce();
    expect(vi.mocked(notifyOrderDispatched).mock.calls[0][1]).toBe("RA03870247");
    expect(vi.mocked(notifyOrderDispatched).mock.calls[0][0].customerEmail).toBe("jane@example.com");
```

4. Phone-only block (lines 126-140) — the dispatcher is now always invoked (it decides the email skip internally). Replace line 135 assertion with:

```ts
    expect(notifyOrderDispatched).toHaveBeenCalledOnce();
```

(Keep the `sendDispatchNotificationEmail` brand-email assertion on line 138 — that path is unchanged.)

- [ ] **Step 2: Update `admin/orders/__tests__/actions.test.ts`**

1. Add hoisted spies + mock (near the mailer mock, lines 25-31):

```ts
const { notifyOrderDispatched, notifyOrderCancelled } = vi.hoisted(() => ({
  notifyOrderDispatched: vi.fn(),
  notifyOrderCancelled: vi.fn(),
}));
vi.mock("@/app/_lib/order-notifications", () => ({ notifyOrderDispatched, notifyOrderCancelled }));
```

2. In `beforeEach` (around lines 66-67) add resets:

```ts
  notifyOrderDispatched.mockReset();
  notifyOrderCancelled.mockReset();
```

3. Cancellation assertions:
   - Line 201 `expect(sendCustomerCancellationEmail).toHaveBeenCalledTimes(1);` → `expect(notifyOrderCancelled).toHaveBeenCalledTimes(1);`
   - Line 202 `expect(sendCustomerCancellationEmail.mock.calls[0][0].customerEmail).toBe("n@x.test");` → `expect(notifyOrderCancelled.mock.calls[0][0].customerEmail).toBe("n@x.test");`
   - Line 213 `expect(sendCustomerCancellationEmail).not.toHaveBeenCalled();` → `expect(notifyOrderCancelled).not.toHaveBeenCalled();`

4. Dispatch assertions:
   - Line 368 `sendCustomerDispatchEmail.mockResolvedValueOnce(undefined);` → `notifyOrderDispatched.mockResolvedValueOnce(undefined);`
   - Line 376 `expect(sendCustomerDispatchEmail).toHaveBeenCalledTimes(1);` → `expect(notifyOrderDispatched).toHaveBeenCalledTimes(1);`
   - Line 377 `expect(sendCustomerDispatchEmail.mock.calls[0][0].trackingCode).toBe("RX-123");` → `expect(notifyOrderDispatched.mock.calls[0][1]).toBe("RX-123");`
   - Line 388 `sendCustomerDispatchEmail.mockRejectedValueOnce(new Error("SMTP down"));` → `notifyOrderDispatched.mockRejectedValueOnce(new Error("dispatcher down"));`
   - Lines 406, 424 `expect(sendCustomerDispatchEmail).not.toHaveBeenCalled();` → `expect(notifyOrderDispatched).not.toHaveBeenCalled();`

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test`
Expected: FAIL — both tests reference `notifyOrderDispatched`/`notifyOrderCancelled` while the sources still call the mailer directly.

- [ ] **Step 4: Implement `book-courier.ts`**

1. Imports (lines 12-19) — drop `sendCustomerDispatchEmail`, drop the `shouldEmailCustomer` import (line 19), add the dispatcher:

```ts
import {
  sendDispatchNotificationEmail,
  sendAdminFailureAlertEmail,
  logMailerError,
} from "@/app/_lib/mailer";
import type { OrderDetails } from "@/app/_lib/mailer";
import { notifyOrderDispatched } from "@/app/_lib/order-notifications";
```

2. Delete the entire `trySendCustomerDispatchEmail` helper (lines 92-122).

3. Replace its call site (line 250) with:

```ts
  await notifyOrderDispatched(order, waybillNumber);
```

- [ ] **Step 5: Implement `admin/orders/actions.ts`**

1. Add the dispatcher import near the other `@/app/_lib/mailer` import:

```ts
import { notifyOrderDispatched, notifyOrderCancelled } from "@/app/_lib/order-notifications";
```

2. Replace the body of `trySendCancellationEmail` (lines 272-285) so it delegates (the dispatcher handles the email guard + SMS and never throws):

```ts
/** Customer cancellation notifications (email when present + SMS). Never throws. */
async function trySendCancellationEmail(details: OrderDetails): Promise<void> {
  await notifyOrderCancelled(details);
}
```

3. In `dispatchManually`, replace the customer-email block (lines 330-339) with:

```ts
  try {
    await notifyOrderDispatched(toOrderDetails(order), parsed.data);
  } catch (err) {
    logMailerError("dispatch", { orderId, webNumber: order.webNumber, rbNumber: order.rbNumber }, err);
  }
```

4. If, after these edits, `sendCustomerDispatchEmail`, `sendCustomerCancellationEmail`, or `shouldEmailCustomer` are no longer referenced anywhere in `admin/orders/actions.ts`, remove them from that file's imports (run `npx tsc --noEmit` — an unused import surfaces as a lint error in CI; grep the file to confirm before deleting).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test`
Expected: PASS — both updated tests green.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/checkout/book-courier.ts app/admin/orders/actions.ts app/checkout/__tests__/book-courier.test.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "refactor(orders): send dispatch & cancellation via notification dispatcher"
```

---

## Task 7: Alternate phone → order details builders + Curfox secondary phone

**Files:**
- Modify: `app/_lib/payments/order-finalization.ts:12-39` (`paidDetails`)
- Modify: `app/admin/orders/actions.ts` (`toOrderDetails`, ~lines 240-261)
- Modify: `app/checkout/book-courier.ts:160-170` (Curfox payload)
- Test: `app/checkout/__tests__/curfox-mapping.test.ts` (add `customer_secondary_phone` cases)

**Interfaces:**
- Consumes: `OrderDetails.alternatePhone` (Task 1), `Order.alternatePhone` (Task 1), `toLocalSriLankaPhone` (already in book-courier).

- [ ] **Step 1: Write the failing test**

In `app/checkout/__tests__/curfox-mapping.test.ts`, add a describe block inside the top-level `describe` (after the `customer_phone` block, ~line 86):

```ts
  describe("customer_secondary_phone (alternate delivery number)", () => {
    it("maps a provided alternate phone to the normalized local form", async () => {
      const item = await callAndGetItem({ ...ORDER, alternatePhone: "+94712223333" });
      expect(item.customer_secondary_phone).toBe("0712223333");
    });

    it("is null when no alternate phone is provided", async () => {
      const item = await callAndGetItem({ ...ORDER, alternatePhone: null });
      expect(item.customer_secondary_phone).toBeNull();
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test`
Expected: FAIL — `curfox-mapping.test.ts`: `customer_secondary_phone` is `undefined`, not `"0712223333"`/`null`.

- [ ] **Step 3: Map the alternate phone in the Curfox payload**

In `app/checkout/book-courier.ts`, in the `orderItem` object (lines 160-170), add after `customer_phone`:

```ts
    customer_phone: toLocalSriLankaPhone(order.customerPhone),
    customer_secondary_phone: order.alternatePhone ? toLocalSriLankaPhone(order.alternatePhone) : null,
```

- [ ] **Step 4: Populate `alternatePhone` in the two remaining `OrderDetails` builders**

In `app/_lib/payments/order-finalization.ts`, in `paidDetails` (after `customerPhone: order.customerPhone,`, line 17):

```ts
    customerPhone: order.customerPhone,
    alternatePhone: order.alternatePhone,
```

In `app/admin/orders/actions.ts`, in `toOrderDetails` (line 245 already sets `customerPhone: order.customerPhone,` — add the alternate right after it):

```ts
    customerPhone: order.customerPhone,
    alternatePhone: order.alternatePhone,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/checkout/book-courier.ts app/_lib/payments/order-finalization.ts app/admin/orders/actions.ts app/checkout/__tests__/curfox-mapping.test.ts
git commit -m "feat(courier): forward alternate delivery phone as Curfox secondary phone"
```

---

## Task 8: Checkout UI — pre-fill, alternate field, optional guest email, helper text

**Files:**
- Modify: `app/checkout/page.tsx`
- Modify: `app/checkout/checkout-client.tsx:32-38, 63-77, 232, 326-357, 366-384`
- Test: `tests/e2e/` (edit for CI — not run locally)

**Interfaces:**
- Consumes: `prisma.user.findUnique`, `prisma.address.findFirst`, the widened `CheckoutUser` prop.

> No local unit test — this is RSC/client wiring. The action-level guarantees are covered by Task 5. Gate locally with `npx tsc --noEmit`; the E2E edits validate in CI.

- [ ] **Step 1: Load contact + default address in the server component**

Replace `app/checkout/page.tsx` body with:

```tsx
// app/checkout/page.tsx
import { auth } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";
import { CheckoutClient } from "./checkout-client";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { checkoutPaymentOptions } from "@/app/_lib/payments/registry";
import { catalogueByDistrict } from "@/app/_lib/courier/catalogue";

export default async function CheckoutPage() {
  const session = await auth();

  let user = null;
  if (session?.user?.id) {
    const [dbUser, defaultAddress] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true, phone: true },
      }),
      prisma.address.findFirst({
        where: { userId: session.user.id },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        select: { line1: true, line2: true, city: true },
      }),
    ]);
    user = {
      name: dbUser?.name ?? session.user.name ?? "",
      email: dbUser?.email ?? "",
      phone: dbUser?.phone ?? "",
      address: defaultAddress
        ? { line1: defaultAddress.line1, line2: defaultAddress.line2 ?? "", city: defaultAddress.city }
        : null,
    };
  }

  return (
    <>
      <CheckoutClient
        user={user}
        paymentOptions={checkoutPaymentOptions()}
        cityGroups={catalogueByDistrict()}
      />
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Widen the client prop type and seed state**

In `app/checkout/checkout-client.tsx`:

1. Replace the `CheckoutUser` type (line 32):

```ts
type CheckoutUser = {
  name: string;
  email: string;
  phone: string;
  address: { line1: string; line2: string; city: string } | null;
} | null;
```

2. Seed phone, alternate, and address from the user (replace lines 65-77):

```ts
  const [guest, setGuest] = useState({
    name: "",
    email: "",
  });

  const [phone, setPhone] = useState(user?.phone ?? "");
  const [alternatePhone, setAlternatePhone] = useState("");

  const [address, setAddress] = useState({
    line1: user?.address?.line1 ?? "",
    line2: user?.address?.line2 ?? "",
    city: user?.address?.city ?? "",
    country: "Sri Lanka",
  });
```

- [ ] **Step 3: Send the alternate phone in the order submission**

In `handleSubmit` (line 221-235), add `alternatePhone` to the `processOrder` call:

```ts
        paymentMethod,
        contactPhone: phone,
        alternatePhone: alternatePhone.trim() || undefined,
        guestInfo: isGuest ? { name: guest.name, email: guest.email, phone } : undefined,
```

- [ ] **Step 4: Make the guest email optional**

In the guest "Your Details" card (lines 340-354), relabel and drop `required`:

```tsx
                      <div>
                        <label htmlFor="guestEmail" className="block text-sm font-medium mb-1">
                          Email (optional)
                        </label>
                        <Input
                          id="guestEmail"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          value={guest.email}
                          onChange={(e) => setGuest({ ...guest, email: e.target.value })}
                          placeholder="you@example.com"
                          data-testid="guest-email"
                        />
                      </div>
```

- [ ] **Step 5: Tighten the primary phone, add helper text, add the alternate field**

Replace the primary phone `<div>` (lines 366-384) with:

```tsx
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium mb-1">
                        Mobile Number *
                      </label>
                      <Input
                        id="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        pattern="^(?:\+?94|0)?7\d{8}$"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                        placeholder="0771234567"
                        data-testid="contact-phone"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Order confirmations and delivery updates will be sent to this mobile number.
                      </p>
                    </div>
                    <div>
                      <label htmlFor="alternatePhone" className="block text-sm font-medium mb-1">
                        Alternate Mobile Number
                      </label>
                      <Input
                        id="alternatePhone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={alternatePhone}
                        onChange={(e) => setAlternatePhone(e.target.value)}
                        placeholder="Optional"
                        data-testid="alternate-phone"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Optional — an extra number the courier can call for delivery.
                      </p>
                    </div>
```

- [ ] **Step 6: Update E2E specs (for CI)**

Any guest-checkout E2E that fills the email as required should treat it as optional. In each spec that fills `#guestEmail` or `getByLabel("Email *")` for a guest, either update the label to "Email (optional)" or drop the fill where the test intends a no-email guest. Add a registered-checkout assertion (in a spec with a logged-in fixture) that `[data-testid="contact-phone"]` is pre-filled and `[data-testid="alternate-phone"]` exists. (These run in CI; do not run Playwright locally.)

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run test`
Expected: PASS (unit suite unaffected).

```bash
git add app/checkout/page.tsx app/checkout/checkout-client.tsx tests/e2e
git commit -m "feat(checkout): pre-fill saved contact/address, optional guest email, alternate mobile"
```

---

## Task 9: Auth copy — "Email or Mobile Number"

**Files:**
- Modify: `app/(auth)/login/page.tsx:86, 93`
- Modify: `app/(auth)/forgot-password/page.tsx:69, 73, 80`
- Modify: `app/_lib/auth.ts:47`
- Modify: `app/_lib/validation.ts:27, 48`
- Modify: `app/(auth)/actions.ts:152, 182, 197`
- Test: `tests/e2e/auth-state.spec.ts:40`, `payhere-purchase.spec.ts:208`, `payhere-order.spec.ts:74,351`, `order-confirmation.spec.ts:45`

- [ ] **Step 1: Update the rendered labels + placeholders**

- `app/(auth)/login/page.tsx:86` — `<Label htmlFor="identifier">Email or Mobile Number</Label>`
- `app/(auth)/login/page.tsx:93` — placeholder `placeholder="you@email.com or 0771234567"`
- `app/(auth)/forgot-password/page.tsx:73` — `<Label htmlFor="identifier">Email or Mobile Number</Label>`
- `app/(auth)/forgot-password/page.tsx:80` — placeholder `placeholder="you@email.com or 0771234567"`
- `app/(auth)/forgot-password/page.tsx:69` — helper copy: reword any "phone or email" to "email or mobile number".

- [ ] **Step 2: Update the credentials label + error strings**

- `app/_lib/auth.ts:47` — `identifier: { label: "Email or Mobile Number" }`
- `app/_lib/validation.ts:27` — `identifier: z.string().trim().min(1, "Email or mobile number required"),`
- `app/_lib/validation.ts:48` — `identifier: z.string().trim().min(1, "Email or mobile number required"),`
- `app/(auth)/actions.ts:152` and `:182` — `"Invalid email/mobile or password"`
- `app/(auth)/actions.ts:197` — `"Enter your email or mobile number."`

- [ ] **Step 3: Update the E2E label selectors (for CI)**

In each spec, change `page.getByLabel("Phone or email")` → `page.getByLabel("Email or Mobile Number")`:
- `tests/e2e/auth-state.spec.ts:40`
- `tests/e2e/payhere-purchase.spec.ts:208`
- `tests/e2e/payhere-order.spec.ts:74` and `:351`
- `tests/e2e/order-confirmation.spec.ts:45`

- [ ] **Step 4: Typecheck and run unit tests**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run test`
Expected: PASS (no unit test asserts the auth label; `resolveIdentifier` logic is unchanged).

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)" app/_lib/auth.ts app/_lib/validation.ts tests/e2e
git commit -m "feat(auth): relabel login identifier to Email or Mobile Number"
```

---

## Final verification

- [ ] Run the full unit suite: `npm run test` — all green.
- [ ] Run the typecheck: `npx tsc --noEmit` — no errors.
- [ ] Confirm no direct customer `sendOrderConfirmationEmail`/`sendCustomerDispatchEmail`/`sendCustomerCancellationEmail` call sites remain outside `order-notifications.ts` and the admin email-only `resendConfirmationEmail`: `git grep -n "sendCustomerDispatchEmail\|sendCustomerCancellationEmail\|sendOrderConfirmationEmail" app`.
- [ ] The migration folder is committed and ordered after the previous migration.

## Self-Review Notes (author check completed)

- **Spec coverage:** §4.1 schema → T1; §4.2 auth copy → T9; §4.3 pre-fill → T8; §4.4 guest email optional/helper → T5+T8; §4.5 alternate phone → T5(persist)+T7(courier); §4.6 mobile validation → T5; §4.7 dispatcher → T3; §4.8 SMS templates → T2; §4.9 wiring → T4(prepaid)+T5(COD)+T6(dispatch/cancel); admin resend stays email-only (untouched). All §11 acceptance criteria map to a task.
- **Type consistency:** dispatcher signatures (`notifyOrderConfirmed(details)`, `notifyOrderDispatched(details, trackingCode)`, `notifyOrderCancelled(details)`) are used identically in T4/T5/T6; SMS template param shapes in T2 match the dispatcher call sites in T3; `OrderDetails.alternatePhone` defined in T1 is consumed in T5/T7.
- **Idempotency:** confirmation SMS + email use atomic `claimOnce`; the prepaid path keeps its outer `paymentStatus` claim (T4) so Koko's double callback cannot double-send.
```
