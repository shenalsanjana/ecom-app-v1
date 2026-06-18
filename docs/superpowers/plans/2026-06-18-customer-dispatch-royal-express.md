# Customer-facing Dispatch (Royal Express) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an admin dispatches an order, automatically email the customer that it shipped with **Royal Express** including the tracking number, add a real `DISPATCHED` status, and never show "Curfox" in the customer view.

**Architecture:** Dispatch completion = "the order has a tracking number." It happens via two paths into one outcome (status→`DISPATCHED`, `deliveryCompany`="Royal Express", customer email sent once): the existing **Curfox** booking (auto-fills the waybill as the tracking number), and a **manual** admin action (enter a tracking number) used when Curfox is disabled or its booking failed. Both reuse a single carrier constant and a single customer-email function.

**Tech Stack:** Next.js 16 App Router, Prisma + PostgreSQL, nodemailer, Zod, Vitest. Server Actions for admin operations.

## Global Constraints

- Customer-facing carrier name is exactly **`Royal Express`** (from `DELIVERY_COMPANY_NAME`). Never show, save as the visible carrier, or reference **Curfox** in any customer surface (order history, dispatch email, tracking text).
- The customer dispatch email is sent **only after** the order is updated to `DISPATCHED` **and** a tracking number is present, and is **not** re-sent when the order is later edited.
- `status` is a free-form Prisma `String`; the new value `"DISPATCHED"` needs no enum migration.
- Two new `Order` columns are **nullable** and backward-compatible.
- Migrations are **decoupled from `npm run build`** (applied separately). Do not run `prisma migrate dev` (no dev DB); hand-author the migration SQL and run only `npx prisma generate` to refresh client types.
- TDD: failing test → minimal code → green → commit. Prisma is fully mocked in unit tests.
- Verify with `npm run test` (vitest) per task and `npm run build` at the end.

---

### Task 1: Carrier constant, schema fields, migration

**Files:**
- Create: `app/_lib/carrier.ts`
- Modify: `prisma/schema.prisma:109-153` (the `Order` model — add two fields)
- Create: `prisma/migrations/20260618090000_dispatch_royal_express/migration.sql`

**Interfaces:**
- Produces: `DELIVERY_COMPANY_NAME: "Royal Express"` (string constant) consumed by Tasks 2, 4, 5, 7.
- Produces: `Order.deliveryCompany: string | null`, `Order.customerDispatchEmailSentAt: Date | null` on the generated Prisma client, consumed by Tasks 4, 5, 7.

- [ ] **Step 1: Create the carrier constant**

Create `app/_lib/carrier.ts`:

```ts
// app/_lib/carrier.ts
// Single source of truth for the customer-facing delivery company name.
// The underlying courier platform (Curfox) is an internal/merchant detail and
// must never be shown to customers.
export const DELIVERY_COMPANY_NAME = "Royal Express";
```

- [ ] **Step 2: Add the two columns to the `Order` model**

In `prisma/schema.prisma`, inside `model Order`, add these two lines immediately after the existing `dispatchEmailSentAt   DateTime?` line (around line 137):

```prisma
  customerDispatchEmailSentAt DateTime?
  deliveryCompany             String?
```

- [ ] **Step 3: Hand-author the migration SQL**

Create `prisma/migrations/20260618090000_dispatch_royal_express/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerDispatchEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "deliveryCompany" TEXT;
```

- [ ] **Step 4: Regenerate the Prisma client (no DB needed)**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" success; the client now types `deliveryCompany` and `customerDispatchEmailSentAt` on `Order`.

- [ ] **Step 5: Confirm nothing broke**

Run: `npm run test`
Expected: PASS (existing suite unaffected — no code references the new fields yet).

- [ ] **Step 6: Commit**

```bash
git add app/_lib/carrier.ts prisma/schema.prisma prisma/migrations/20260618090000_dispatch_royal_express/migration.sql
git commit -m "feat(dispatch): add deliveryCompany + customerDispatchEmailSentAt columns and carrier constant"
```

---

### Task 2: Customer dispatch email (`sendCustomerDispatchEmail`)

**Files:**
- Modify: `app/_lib/mailer.ts` (add one exported function near the other dispatch helpers, ~line 502)
- Test: `app/_lib/__tests__/mailer-dispatch.test.ts`

**Interfaces:**
- Consumes: `DELIVERY_COMPANY_NAME` (Task 1); existing `OrderDetails`, `orderReference`, `escapeHtml`, `BRAND_NAME`, `CONTACT_NUMBER`, `getTransport`, `requireFrom`, `requireBrandEmail`, `brandReplyTo`.
- Produces: `sendCustomerDispatchEmail(order: OrderDetails): Promise<void>` — consumed by Tasks 4 and 5. Sends **to** `order.customerEmail`, **bcc** brand, subject `Your order <ref> has been dispatched — <BRAND_NAME>`. Body contains the order reference, `order.trackingCode`, the carrier name, a dispatched/track message, and **no** Curfox text or portal link.

- [ ] **Step 1: Write the failing test**

Append to `app/_lib/__tests__/mailer-dispatch.test.ts`:

```ts
import { sendCustomerDispatchEmail } from "../mailer";

describe("sendCustomerDispatchEmail", () => {
  it("emails the customer with order ref, tracking number and Royal Express; never Curfox", async () => {
    await sendCustomerDispatchEmail({ ...SAMPLE_ORDER, trackingCode: "RA03870247" });

    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    const opts = sendMailSpy.mock.calls[0][0];
    // Goes to the customer (not the brand inbox), bcc the brand for a record.
    expect(opts.to).toBe("jane@example.com");
    expect(opts.bcc).toBe("dressingbear@gmail.com");
    expect(opts.subject).toContain("WEB0042");
    expect(opts.subject.toLowerCase()).toContain("dispatched");
    // Required content
    expect(opts.text).toContain("WEB0042");          // order number
    expect(opts.text).toContain("RA03870247");        // tracking number
    expect(opts.text).toContain("Royal Express");     // delivery company
    expect(opts.text.toLowerCase()).toContain("dispatched");
    expect(opts.html).toContain("Royal Express");
    expect(opts.html).toContain("RA03870247");
    // Must never leak the internal courier platform to the customer
    expect(opts.text).not.toMatch(/curfox/i);
    expect(opts.html).not.toMatch(/curfox/i);
    expect(opts.html).not.toContain("curfox.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/mailer-dispatch.test.ts -t "emails the customer"`
Expected: FAIL with `sendCustomerDispatchEmail is not a function` / import error.

- [ ] **Step 3: Implement the function**

In `app/_lib/mailer.ts`, add the import near the top (after the existing `curfox-portal` import, line ~6):

```ts
import { DELIVERY_COMPANY_NAME } from "@/app/_lib/carrier";
```

Then add this function immediately after `sendDispatchNotificationEmail` ends (after its closing `}` at ~line 502):

```ts
/**
 * Customer-facing dispatch notification. Sent once, after the order is marked
 * DISPATCHED with a tracking number. Tells the customer their order shipped
 * with Royal Express and how to track it. Never references the internal courier
 * platform (Curfox) and carries no merchant portal link.
 */
export async function sendCustomerDispatchEmail(order: OrderDetails): Promise<void> {
  const transport = getTransport();
  const brandEmail = requireBrandEmail();
  const from = requireFrom();
  const ref = orderReference(order);
  const tracking = order.trackingCode ?? "";

  const text = `Hi ${order.customerName},

Good news — your order has been dispatched and is on its way with ${DELIVERY_COMPANY_NAME}.

Order:            ${ref}
Tracking number:  ${tracking}
Delivery company: ${DELIVERY_COMPANY_NAME}

You can track your parcel with ${DELIVERY_COMPANY_NAME} using the tracking number above.

Need help? Contact us at ${CONTACT_NUMBER} or ${brandEmail}.

---
${BRAND_NAME}
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .panel { border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 15px 0; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
    .row:last-child { border-bottom: none; }
    .label { color: #666; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; color: #2c3e50;">${escapeHtml(BRAND_NAME)}</h1>
      <h2 style="margin: 10px 0 0 0; color: #27ae60;">Your order has been dispatched</h2>
    </div>

    <p>Hi ${escapeHtml(order.customerName)}, good news — your order has been dispatched and is on its way with <strong>${escapeHtml(DELIVERY_COMPANY_NAME)}</strong>.</p>

    <div class="panel">
      <div class="row"><span class="label">Order</span><span>${escapeHtml(ref)}</span></div>
      <div class="row"><span class="label">Tracking number</span><span><strong>${escapeHtml(tracking)}</strong></span></div>
      <div class="row"><span class="label">Delivery company</span><span>${escapeHtml(DELIVERY_COMPANY_NAME)}</span></div>
    </div>

    <p>You can track your parcel with ${escapeHtml(DELIVERY_COMPANY_NAME)} using the tracking number above.</p>

    <div class="footer">
      <p>Need help? Contact us at <strong>${escapeHtml(CONTACT_NUMBER)}</strong> or <a href="mailto:${encodeURIComponent(brandEmail)}">${escapeHtml(brandEmail)}</a>.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  await transport.sendMail({
    from,
    to: order.customerEmail,
    bcc: brandEmail,
    replyTo: brandReplyTo(),
    subject: `Your order ${ref} has been dispatched — ${BRAND_NAME}`,
    text,
    html,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/mailer-dispatch.test.ts`
Expected: PASS (the new test plus all existing dispatch-email tests).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/mailer.ts app/_lib/__tests__/mailer-dispatch.test.ts
git commit -m "feat(dispatch): add customer-facing Royal Express dispatch email"
```

---

### Task 3: `DISPATCHED` status transition

**Files:**
- Modify: `app/_lib/admin-orders.ts:120-129` (the `TRANSITIONS` map)
- Test: `app/_lib/__tests__/admin-orders.test.ts`

**Interfaces:**
- Produces: `nextStatuses("DISPATCHED") === ["DELIVERED"]`; `nextStatuses("CONFIRMED")` stays `["DELIVERED"]` (so `DISPATCHED` is **not** reachable via `advanceStatus`). Consumed by the admin detail page (`nextStatuses(order.status)[0]`).

- [ ] **Step 1: Write the failing test**

In `app/_lib/__tests__/admin-orders.test.ts`, inside the existing `describe("status transitions", …)` block, add:

```ts
  it("dispatched orders can be marked delivered, and DISPATCHED is not a plain-advance target", () => {
    expect(nextStatuses("DISPATCHED")).toEqual(["DELIVERED"]);
    expect(nextStatuses("CONFIRMED")).not.toContain("DISPATCHED");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-orders.test.ts -t "dispatched orders can be marked delivered"`
Expected: FAIL — `nextStatuses("DISPATCHED")` returns `[]`, not `["DELIVERED"]`.

- [ ] **Step 3: Add the transition**

In `app/_lib/admin-orders.ts`, change the `TRANSITIONS` map to add a `DISPATCHED` row (leave `CONFIRMED` as-is):

```ts
const TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED"],
  CONFIRMED: ["DELIVERED"],
  DISPATCHED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/admin-orders.test.ts`
Expected: PASS (new test + the existing `CONFIRMED→DELIVERED` assertion at line 110 still green).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-orders.ts app/_lib/__tests__/admin-orders.test.ts
git commit -m "feat(dispatch): add DISPATCHED -> DELIVERED status transition"
```

---

### Task 4: Curfox dispatch path — flip status + email the customer

**Files:**
- Modify: `app/checkout/book-courier.ts` (imports; the "⑨ persist waybill" update ~line 178-190; add a `trySendCustomerDispatchEmail` helper; call it after the persist ~line 211)
- Test: `app/checkout/__tests__/book-courier.test.ts`

**Interfaces:**
- Consumes: `sendCustomerDispatchEmail` (Task 2), `DELIVERY_COMPANY_NAME` (Task 1), existing `prisma`, `logMailerError`.
- Produces: on a successful Curfox booking, the waybill-persist `prisma.order.update` also sets `status: "DISPATCHED"` and `deliveryCompany`, and `sendCustomerDispatchEmail` is called once with `trackingCode` = waybill, then `customerDispatchEmailSentAt` is stamped.

- [ ] **Step 1: Write the failing test**

In `app/checkout/__tests__/book-courier.test.ts`, extend the mailer mock (lines 19-23) to include the new function:

```ts
vi.mock("@/app/_lib/mailer", () => ({
  sendDispatchNotificationEmail: vi.fn(),
  sendCustomerDispatchEmail: vi.fn(),
  sendAdminFailureAlertEmail: vi.fn(),
  logMailerError: vi.fn(),
}));
```

Add `sendCustomerDispatchEmail` to the imports from the mailer (lines 40-43):

```ts
import {
  sendDispatchNotificationEmail,
  sendCustomerDispatchEmail,
  sendAdminFailureAlertEmail,
} from "@/app/_lib/mailer";
```

Add its reset to `beforeEach` (after line 68):

```ts
  vi.mocked(sendCustomerDispatchEmail).mockReset();
```

Then add this test inside `describe("bookCourierAndNotify — happy path", …)`:

```ts
  it("flips status to DISPATCHED with Royal Express and emails the customer once", async () => {
    vi.mocked(createCurfoxOrder).mockResolvedValueOnce("RA03870247");
    vi.mocked(sendDispatchNotificationEmail).mockResolvedValueOnce(undefined);
    vi.mocked(sendCustomerDispatchEmail).mockResolvedValueOnce(undefined);

    await bookCourierAndNotify({ order: ORDER });

    const persist = vi
      .mocked(prisma.order.update)
      .mock.calls.find((c) => (c[0] as { data: Record<string, unknown> }).data.courierWaybillNumber);
    expect(persist).toBeDefined();
    const data = (persist![0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe("DISPATCHED");
    expect(data.deliveryCompany).toBe("Royal Express");

    expect(sendCustomerDispatchEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendCustomerDispatchEmail).mock.calls[0][0].trackingCode).toBe("RA03870247");
    expect(vi.mocked(sendCustomerDispatchEmail).mock.calls[0][0].customerEmail).toBe("jane@example.com");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/checkout/__tests__/book-courier.test.ts -t "flips status to DISPATCHED"`
Expected: FAIL — `data.status` is undefined and `sendCustomerDispatchEmail` was never called.

- [ ] **Step 3: Implement the status flip + customer email**

In `app/checkout/book-courier.ts`:

(a) Extend the mailer import (lines 12-15) and add the carrier import:

```ts
import {
  sendDispatchNotificationEmail,
  sendCustomerDispatchEmail,
  sendAdminFailureAlertEmail,
  logMailerError,
} from "@/app/_lib/mailer";
import { DELIVERY_COMPANY_NAME } from "@/app/_lib/carrier";
```

(b) In the "⑨ Persist waybill" `prisma.order.update` `data` block (currently lines 182-189), add the two fields:

```ts
      data: {
        courierWaybillNumber: waybillNumber,
        courierBookedAt: new Date(),
        trackingCode: waybillNumber,
        status: "DISPATCHED",
        deliveryCompany: DELIVERY_COMPANY_NAME,
        royalExpressSubmitted: true,
        courierLastError: null,
        courierLastErrorAt: null,
      },
```

(c) Add a new helper next to `tryDispatchEmail` (after it ends, ~line 86):

```ts
async function trySendCustomerDispatchEmail(
  order: OrderDetails,
  waybillNumber: string,
): Promise<void> {
  try {
    await sendCustomerDispatchEmail({ ...order, trackingCode: waybillNumber });
    await prisma.order
      .update({
        where: { id: order.orderId },
        data: { customerDispatchEmailSentAt: new Date() },
      })
      .catch((err) => {
        console.error("[checkout] customerDispatchEmailSentAt update failed:", err);
      });
  } catch (err) {
    logMailerError(
      "dispatch",
      { orderId: order.orderId, webNumber: order.webNumber, rbNumber: order.rbNumber },
      err,
    );
  }
}
```

(d) Call it right after the existing merchant dispatch email (the `await tryDispatchEmail(order, waybillNumber, undefined);` line ~211):

```ts
  await tryDispatchEmail(order, waybillNumber, undefined);
  await trySendCustomerDispatchEmail(order, waybillNumber);

  return waybillNumber;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/checkout/__tests__/book-courier.test.ts`
Expected: PASS (new test + all existing book-courier tests, including the failure-cascade ones which never reach the persist step).

- [ ] **Step 5: Commit**

```bash
git add app/checkout/book-courier.ts app/checkout/__tests__/book-courier.test.ts
git commit -m "feat(dispatch): Curfox booking flips order to DISPATCHED and emails the customer"
```

---

### Task 5: Admin actions — `dispatchManually` + `updateTrackingNumber`

**Files:**
- Modify: `app/admin/orders/actions.ts` (imports; add two exported actions near `bookCourier`, ~line 272)
- Test: `app/admin/orders/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `sendCustomerDispatchEmail`, `logMailerError` (Tasks 2/existing), `DELIVERY_COMPANY_NAME` (Task 1), existing `toOrderDetails`, `ORDER_INCLUDE`, `revalidate`, `requireAdmin`, `prisma`, `z`.
- Produces:
  - `dispatchManually(orderId: string, trackingNumber: string): Promise<ActionResult>` — requires `status === "CONFIRMED"`; sets `trackingCode`, `status="DISPATCHED"`, `deliveryCompany`, then emails the customer once and stamps `customerDispatchEmailSentAt`. Consumed by Task 6 (`TrackingEditor` dispatch mode).
  - `updateTrackingNumber(orderId: string, trackingNumber: string): Promise<ActionResult>` — requires `status === "DISPATCHED"`; updates `trackingCode` only, **never** emails. Consumed by Task 6 (`TrackingEditor` edit mode).

- [ ] **Step 1: Write the failing tests**

In `app/admin/orders/__tests__/actions.test.ts`, extend the mailer mock (line 25-26) so the actions module can import the new function:

```ts
const { sendOrderConfirmationEmail, sendCustomerDispatchEmail, logMailerError } = vi.hoisted(() => ({
  sendOrderConfirmationEmail: vi.fn(),
  sendCustomerDispatchEmail: vi.fn(),
  logMailerError: vi.fn(),
}));
vi.mock("@/app/_lib/mailer", () => ({ sendOrderConfirmationEmail, sendCustomerDispatchEmail, logMailerError }));
```

Add resets to `beforeEach` (after line 60 `sendOrderConfirmationEmail.mockReset();`):

```ts
  sendCustomerDispatchEmail.mockReset();
  logMailerError.mockReset();
```

Append a new describe block (after the `bookCourier` describe, ~line 299):

```ts
import { dispatchManually, updateTrackingNumber } from "../actions";

describe("dispatchManually", () => {
  it("rejects a blank tracking number", async () => {
    const res = await dispatchManually("o1", "   ");
    expect(res).toEqual({ success: false, error: "Enter a valid tracking number" });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("rejects an order that is not CONFIRMED", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, status: "DISPATCHED" });
    const res = await dispatchManually("o1", "RX-123");
    expect(res).toEqual({ success: false, error: "Only confirmed orders can be dispatched" });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("sets DISPATCHED + Royal Express + tracking and emails the customer once", async () => {
    orderFindUnique.mockResolvedValueOnce(FULL_ORDER);
    orderUpdate.mockResolvedValue({});
    sendCustomerDispatchEmail.mockResolvedValueOnce(undefined);

    const res = await dispatchManually("o1", "  RX-123  ");

    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { trackingCode: "RX-123", status: "DISPATCHED", deliveryCompany: "Royal Express" },
    });
    expect(sendCustomerDispatchEmail).toHaveBeenCalledTimes(1);
    expect(sendCustomerDispatchEmail.mock.calls[0][0].trackingCode).toBe("RX-123");
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { customerDispatchEmailSentAt: expect.any(Date) },
    });
    expect(res).toEqual({ success: true, warning: "Dispatched — tracking RX-123." });
  });

  it("still reports success (and does not throw) when the email send fails", async () => {
    orderFindUnique.mockResolvedValueOnce(FULL_ORDER);
    orderUpdate.mockResolvedValue({});
    sendCustomerDispatchEmail.mockRejectedValueOnce(new Error("SMTP down"));

    const res = await dispatchManually("o1", "RX-9");

    expect(logMailerError).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: true, warning: "Dispatched — tracking RX-9." });
  });
});

describe("updateTrackingNumber", () => {
  it("updates trackingCode on a dispatched order without emailing", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, status: "DISPATCHED" });
    orderUpdate.mockResolvedValueOnce({});

    const res = await updateTrackingNumber("o1", "RX-NEW");

    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { trackingCode: "RX-NEW" } });
    expect(sendCustomerDispatchEmail).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true });
  });

  it("rejects updating a non-dispatched order", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, status: "CONFIRMED" });
    const res = await updateTrackingNumber("o1", "RX-NEW");
    expect(res).toEqual({ success: false, error: "Tracking number can only be updated on a dispatched order" });
    expect(orderUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts -t "dispatchManually"`
Expected: FAIL — `dispatchManually`/`updateTrackingNumber` are not exported.

- [ ] **Step 3: Implement the two actions**

In `app/admin/orders/actions.ts`:

(a) Extend the mailer import (line 11) and add the carrier import:

```ts
import { sendOrderConfirmationEmail, sendCustomerDispatchEmail, logMailerError, type OrderDetails } from "@/app/_lib/mailer";
import { DELIVERY_COMPANY_NAME } from "@/app/_lib/carrier";
```

(b) Add a tracking-number schema next to the other schemas (after `NoteSchema`, ~line 30):

```ts
const TrackingSchema = z.string().trim().min(1).max(64);
```

(c) Add both actions immediately after `bookCourier` ends (~line 272):

```ts
/**
 * Manual dispatch fallback used when Curfox is disabled or its booking failed.
 * Saves an admin-entered tracking number, flips the order to DISPATCHED with
 * Royal Express as the carrier, and emails the customer once. Does not call Curfox.
 */
export async function dispatchManually(orderId: string, trackingNumber: string): Promise<ActionResult> {
  await requireAdmin();
  const parsed = TrackingSchema.safeParse(trackingNumber);
  if (!parsed.success) return { success: false, error: "Enter a valid tracking number" };

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (!order) return { success: false, error: "Order not found" };
  if (order.status !== "CONFIRMED") {
    return { success: false, error: "Only confirmed orders can be dispatched" };
  }

  try {
    await prisma.order.update({
      where: { id: orderId },
      data: { trackingCode: parsed.data, status: "DISPATCHED", deliveryCompany: DELIVERY_COMPANY_NAME },
    });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }

  // Email the customer once. A send failure must not undo the dispatch.
  try {
    await sendCustomerDispatchEmail({ ...toOrderDetails(order), trackingCode: parsed.data });
    await prisma.order.update({ where: { id: orderId }, data: { customerDispatchEmailSentAt: new Date() } });
  } catch (err) {
    logMailerError("dispatch", { orderId, webNumber: order.webNumber, rbNumber: order.rbNumber }, err);
  }

  revalidate(orderId);
  return { success: true, warning: `Dispatched — tracking ${parsed.data}.` };
}

/**
 * Updates the tracking number on an already-dispatched order. Never re-sends the
 * customer dispatch email (req: no duplicate dispatch emails).
 */
export async function updateTrackingNumber(orderId: string, trackingNumber: string): Promise<ActionResult> {
  await requireAdmin();
  const parsed = TrackingSchema.safeParse(trackingNumber);
  if (!parsed.success) return { success: false, error: "Enter a valid tracking number" };

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Order not found" };
  if (order.status !== "DISPATCHED") {
    return { success: false, error: "Tracking number can only be updated on a dispatched order" };
  }

  try {
    await prisma.order.update({ where: { id: orderId }, data: { trackingCode: parsed.data } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }

  revalidate(orderId);
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts`
Expected: PASS (new blocks + all existing action tests).

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(dispatch): add dispatchManually + updateTrackingNumber admin actions"
```

---

### Task 6: Admin UI — tracking editor, DISPATCHED-aware buttons

**Files:**
- Create: `app/_components/admin/orders/tracking-editor.tsx`
- Modify: `app/_components/admin/orders/order-actions.tsx` (gate the Curfox button on `curfoxEnabled`)
- Modify: `app/_components/admin/orders/row-actions.tsx` (Mark delivered keys off `DISPATCHED`)
- Modify: `app/admin/orders/[id]/page.tsx` (compute Curfox availability; render `TrackingEditor`; pass `curfoxEnabled`)

**Interfaces:**
- Consumes: `dispatchManually`, `updateTrackingNumber` (Task 5), `useActionRunner`/`Spinner` (existing).
- Produces: `TrackingEditor` client component with props `{ orderId: string; mode: "dispatch" | "edit"; trackingCode: string | null }`.

This task is UI; it is verified by `npm run build` (typecheck) plus the manual checklist in Task 8. No unit test (the repo has no component-test harness).

- [ ] **Step 1: Create the `TrackingEditor` client component**

Create `app/_components/admin/orders/tracking-editor.tsx`:

```tsx
"use client";
import { useState } from "react";
import { dispatchManually, updateTrackingNumber } from "@/app/admin/orders/actions";
import { useActionRunner, Spinner } from "./use-action-runner";

type Props = {
  orderId: string;
  mode: "dispatch" | "edit";
  trackingCode: string | null;
};

export function TrackingEditor({ orderId, mode, trackingCode }: Props) {
  const { pending, runningLabel, run } = useActionRunner();
  const [value, setValue] = useState(trackingCode ?? "");

  const submit = () => {
    const tracking = value.trim();
    if (!tracking) return;
    if (mode === "dispatch") {
      run("track", () => dispatchManually(orderId, tracking),
        "Mark this order dispatched and email the customer the tracking number?");
    } else {
      run("track", () => updateTrackingNumber(orderId, tracking));
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={`tracking-${orderId}`}>
        {mode === "dispatch" ? "Royal Express tracking number" : "Update tracking number"}
      </label>
      <input
        id={`tracking-${orderId}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. RA03870247"
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <button
        disabled={pending || !value.trim()}
        onClick={submit}
        className="flex w-full items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {runningLabel === "track" && <Spinner />}
        {mode === "dispatch" ? "📦 Mark dispatched (Royal Express)" : "Save tracking number"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Gate the Curfox button on `curfoxEnabled` in `order-actions.tsx`**

In `app/_components/admin/orders/order-actions.tsx`, add `curfoxEnabled` to `Props`:

```tsx
type Props = {
  orderId: string; status: string; paymentMethod: string; paymentStatus: string | null;
  courierBooked: boolean; nextStatus: string | null; curfoxEnabled: boolean;
};
```

Change the Curfox button condition (line 28) to also require `p.curfoxEnabled`:

```tsx
      {p.status === "CONFIRMED" && !p.courierBooked && p.curfoxEnabled && (
```

- [ ] **Step 3: Make `row-actions.tsx` Mark-delivered key off `DISPATCHED`**

In `app/_components/admin/orders/row-actions.tsx`, change the inline Mark-delivered button condition (line 61) from `p.status === "CONFIRMED" && p.courierBooked` to:

```tsx
      {p.status === "DISPATCHED" && (
```

(The `CONFIRMED && !courierBooked` menu entry for "Mark delivered" stays as the no-courier fallback.)

- [ ] **Step 4: Wire it into the order detail page**

In `app/admin/orders/[id]/page.tsx`:

(a) Add the import:

```tsx
import { TrackingEditor } from "@/app/_components/admin/orders/tracking-editor";
```

(b) After `const next = nextStatuses(order.status)[0] ?? null;` (line 18), compute the flags:

```tsx
  const curfoxEnabled = process.env.ROYAL_EXPRESS_ENABLED === "true";
  const showManualDispatch = order.status === "CONFIRMED" && (!curfoxEnabled || !!order.courierLastError);
```

(c) In the "Status & dispatch" panel (lines 50-53), pass `curfoxEnabled` to `OrderActions` and render the editor below it:

```tsx
          <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Status &amp; dispatch</h4>
            <OrderActions orderId={order.id} status={order.status} paymentMethod={order.paymentMethod}
              paymentStatus={order.paymentStatus} courierBooked={!!order.courierBookedAt} nextStatus={next}
              curfoxEnabled={curfoxEnabled} />
            {showManualDispatch && (
              <div className="mt-3 border-t pt-3">
                <TrackingEditor orderId={order.id} mode="dispatch" trackingCode={order.trackingCode} />
              </div>
            )}
            {order.status === "DISPATCHED" && (
              <div className="mt-3 border-t pt-3">
                <TrackingEditor orderId={order.id} mode="edit" trackingCode={order.trackingCode} />
              </div>
            )}
          </div>
```

- [ ] **Step 5: Typecheck via build**

Run: `npm run build`
Expected: PASS (compiles; the page is a server component reading `process.env` and order fields, the editor is a client leaf).

- [ ] **Step 6: Commit**

```bash
git add app/_components/admin/orders/tracking-editor.tsx app/_components/admin/orders/order-actions.tsx app/_components/admin/orders/row-actions.tsx "app/admin/orders/[id]/page.tsx"
git commit -m "feat(dispatch): admin tracking editor + DISPATCHED-aware order actions"
```

---

### Task 7: Customer order history — Dispatched status + Royal Express

**Files:**
- Modify: `app/account/orders/page.tsx` (`STATUS_LABEL`; the tracking line)

This task is UI; verified by `npm run build` plus the Task 8 checklist.

- [ ] **Step 1: Add the carrier import**

In `app/account/orders/page.tsx`, after the existing imports (line 8), add:

```tsx
import { DELIVERY_COMPANY_NAME } from "@/app/_lib/carrier";
```

- [ ] **Step 2: Update the status labels**

Replace the `STATUS_LABEL` map (lines 10-16) with one that adds `DISPATCHED` and drops the dead `SHIPPED`:

```tsx
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};
```

- [ ] **Step 3: Show the carrier next to the tracking number**

Replace the tracking block (lines 70-74) with one that names the carrier (falling back to the constant for older dispatched orders with a null `deliveryCompany`):

```tsx
                    {o.trackingCode && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {o.deliveryCompany ?? DELIVERY_COMPANY_NAME} · Tracking: {o.trackingCode}
                      </div>
                    )}
```

- [ ] **Step 4: Typecheck via build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/account/orders/page.tsx
git commit -m "feat(dispatch): show Dispatched status and Royal Express carrier in order history"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole unit suite**

Run: `npm run test`
Expected: PASS — all suites green, including the updated mailer-dispatch, book-courier, admin-orders, and admin actions tests.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: PASS — no type errors; all routes compile.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS (or only pre-existing warnings unrelated to these files).

- [ ] **Step 4: Curfox-leak grep over customer surfaces**

Run: `git grep -in "curfox" -- app/account app/_lib/mailer.ts app/_lib/carrier.ts app/checkout/success`
Expected: the only matches are in code comments / the merchant `sendDispatchNotificationEmail` (which is merchant-only). No "Curfox" in `sendCustomerDispatchEmail`, the carrier constant, or any customer page body.

- [ ] **Step 5: Manual smoke (dev, Curfox disabled — the fallback path)**

With `ROYAL_EXPRESS_ENABLED="false"` and SMTP configured, run `npm run dev`:
- Confirm a COD order in the admin → it becomes `CONFIRMED`.
- On the order detail, the manual **Royal Express tracking number** field appears (Curfox button hidden). Enter a number → **Mark dispatched** → toast success.
- Order status shows `DISPATCHED`; the **Update tracking number** field now appears.
- Customer receives the dispatch email (check the brand bcc inbox): names **Royal Express**, the order number, the tracking number; contains **no** "Curfox" and no portal link.
- `/account/orders` for that customer shows the **Dispatched** badge and `Royal Express · Tracking: <code>`.
- Re-saving a different tracking number does **not** trigger another customer email.

- [ ] **Step 6: Apply the migration (deploy step, decoupled from build)**

When deploying, apply the new column migration explicitly (it does **not** run during `npm run build`):
Run (against the target DB): `npm run db:deploy`  (i.e. `prisma migrate deploy`)
Expected: `20260618090000_dispatch_royal_express` applied; `Order.deliveryCompany` and `Order.customerDispatchEmailSentAt` exist.

---

## Self-review notes

- **Spec coverage:** Req #1 → Tasks 4/5 (email on dispatch). Req #2 → Task 2 (email content). Req #3 → Tasks 1/5/6 (tracking entry/update + `deliveryCompany` saved). Req #4 → Tasks 2/7 (Royal Express in email + history). Req #5 → Task 8 grep + Task 2 no-Curfox assertions. Req #6 → Task 5 (`updateTrackingNumber` never emails; status guards prevent re-dispatch) + the `customerDispatchEmailSentAt` stamp.
- **No placeholders:** every step has concrete code/commands.
- **Type consistency:** `DELIVERY_COMPANY_NAME`, `dispatchManually`, `updateTrackingNumber`, `sendCustomerDispatchEmail`, `TrackingEditor` props, and the `curfoxEnabled` prop are used with identical names/signatures across tasks.
