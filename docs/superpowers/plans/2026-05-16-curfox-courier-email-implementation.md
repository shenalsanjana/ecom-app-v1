# Curfox Courier Booking + Dispatch Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate courier booking with Curfox/Royal Express for COD orders and send automated dispatch/failure emails.

**Architecture:** A dedicated Curfox client handles auth and API calls. The checkout action orchestrates order creation followed by courier booking. Failures in the courier step are captured, logged, and emailed to admin without interrupting the customer's checkout success.

**Tech Stack:** Next.js 16 (App Router), Prisma, Zod, Nodemailer.

---

### Task 1: Environment Configuration

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: Update .env.local.example**
Add the new Curfox-specific variables with their production-ready defaults.

```env
# ...existing vars...

# Royal Express / Curfox Courier
ROYAL_EXPRESS_ENABLED="false"
ROYAL_EXPRESS_USER="your-email@example.com"
ROYAL_EXPRESS_PASS="your-password"
ROYAL_EXPRESS_TENANT="royalexpress"

# Curfox API Config
CURFOX_MERCHANT_BUSINESS_ID="7290"
CURFOX_BASE_URL="https://v2-operations.api.curfox.com"
CURFOX_LOGIN_BASE_URL="https://v1.api.curfox.com"
CURFOX_ORDER_CREATE_PATH="/api/merchant/order/single"
CURFOX_WAYBILL_PDF_PATH_TEMPLATE="/api/merchant/order/print/{waybill}"
CURFOX_ORIGIN_CITY_ID="1500"
CURFOX_ORIGIN_WAREHOUSE_ID="78"
CURFOX_DEFAULT_WEIGHT_KG="1"
```

- [ ] **Step 2: Commit**
```bash
git add .env.local.example
git commit -m "docs: add Curfox environment variables to example"
```

---

### Task 2: Curfox Zod Schemas & Types

**Files:**
- Create: `app/_lib/courier/curfox-types.ts`

- [ ] **Step 1: Implement schemas**
Define the nested request payload and the array-based response format discovered during validation.

```typescript
import { z } from "zod";

export const CurfoxLoginResponseSchema = z.object({
  token: z.string()
});

export const CurfoxOrderResponseSchema = z.object({
  message: z.string(),
  data: z.array(z.string()) // Array of waybill numbers
});

export const CurfoxCreateOrderInputSchema = z.object({
  general_data: z.object({
    merchant_business_id: z.number(),
    origin_city_id: z.number(),
    origin_warehouse_id: z.number().optional()
  }),
  order_data: z.array(z.object({
    order_no: z.string(),
    customer_name: z.string(),
    customer_address: z.string(),
    customer_phone: z.string(),
    weight: z.number(),
    cod: z.number(),
    description: z.string(),
    destination_city_name: z.string(),
    remark: z.string().optional()
  }))
});

export type CurfoxCreateOrderInput = z.infer<typeof CurfoxCreateOrderInputSchema>;
```

- [ ] **Step 2: Commit**
```bash
git add app/_lib/courier/curfox-types.ts
git commit -m "feat: add Curfox Zod schemas and types"
```

---

### Task 3: Curfox Client Implementation

**Files:**
- Create: `app/_lib/courier/curfox-client.ts`
- Create: `app/_lib/courier/__tests__/curfox-client.test.ts`

- [ ] **Step 1: Write test for token caching**
Verify that `getToken` reuses a valid token and re-logs on expiry.

```typescript
// app/_lib/courier/__tests__/curfox-client.test.ts (simplified snippet)
it("reuses cached token within TTL", async () => { /* ... */ });
```

- [ ] **Step 2: Implement client with token cache**
Implement `createCurfoxOrder` and `fetchCurfoxWaybillPdf` with 401 retry logic.

```typescript
// app/_lib/courier/curfox-client.ts
// ... imports ...
let cachedToken: { value: string; expiresAt: number } | null = null;
const TOKEN_TTL_MS = 50 * 60 * 1000;

export class CurfoxError extends Error {
  constructor(
    message: string,
    readonly step: "login" | "create-order" | "fetch-pdf",
    readonly status?: number,
    readonly responseBody?: string
  ) { super(message); }
}

async function getToken(): Promise<string> {
  // logic: login if null or expired
}

export async function createCurfoxOrder(input: CurfoxCreateOrderInput): Promise<string> {
  // logic: nested POST, return data[0] (waybill)
}

export async function fetchCurfoxWaybillPdf(waybill: string): Promise<Buffer> {
  // logic: GET template path, handle raw PDF vs JSON-URL
}
```

- [ ] **Step 3: Run tests and verify**
`npm test app/_lib/courier/__tests__/curfox-client.test.ts`

- [ ] **Step 4: Commit**
```bash
git add app/_lib/courier/curfox-client.ts
git commit -m "feat: implement Curfox client with token caching and retries"
```

---

### Task 4: Email Notification Templates

**Files:**
- Modify: `app/_lib/mailer.ts`

- [ ] **Step 1: Add Dispatch Success helper**
Add `sendDispatchNotificationEmail` with PDF attachment support.

- [ ] **Step 2: Add Admin Failure helper**
Add `sendAdminFailureAlertEmail` with the multi-step failure matrix templates.

- [ ] **Step 3: Add Pending Prepaid helper**
Add `sendPendingPrepaidNotificationEmail` for non-COD orders.

- [ ] **Step 4: Commit**
```bash
git add app/_lib/mailer.ts
git commit -m "feat: add dispatch, failure alert, and pending prepaid email helpers"
```

---

### Task 5: Checkout Action Integration

**Files:**
- Modify: `app/checkout/actions.ts`

- [ ] **Step 1: Implement bookCourierAndNotify orchestrator**
Add internal helper to handle the Curfox flow with robust try/catch.

```typescript
async function bookCourierAndNotify(order: any) {
  try {
    const waybill = await createCurfoxOrder({ /* mapping */ });
    // update order record
    const pdf = await fetchCurfoxWaybillPdf(waybill);
    await sendDispatchNotificationEmail({ order, waybill, pdfBuffer: pdf });
  } catch (err) {
    // email admin alert, log, but DON'T throw
  }
}
```

- [ ] **Step 2: Update processOrder**
Call `bookCourierAndNotify` for COD or `sendPendingPrepaidNotificationEmail` for others after successful order creation.

- [ ] **Step 3: Commit**
```bash
git add app/checkout/actions.ts
git commit -m "feat: integrate courier booking and notifications into checkout action"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Build check**
`npm run build`

- [ ] **Step 2: Integration tests**
Run full checkout integration tests (mocking Curfox and SMTP).

- [ ] **Step 3: Commit**
```bash
git commit --allow-empty -m "chore: final verification passed"
```
