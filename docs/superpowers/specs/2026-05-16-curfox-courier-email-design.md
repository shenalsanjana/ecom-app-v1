# Curfox Courier Booking + Dispatch Email — Design Spec

- **Status:** Approved (brainstorm 2026-05-16); pending implementation plan.
- **Owner:** Dressing Bear engineering
- **Touch points:** `app/checkout/actions.ts`, `app/_lib/mailer.ts`, new `app/_lib/courier/*`, new `app/api/admin/curfox/refresh-cities/route.ts`, Prisma schema, `.env.local.example`.
- **Related:** `CLAUDE.md` §1 (Spec → Plan → Implement), existing RoyalExpress stub in `app/checkout/actions.ts`.

## 1. Goal

When a customer places an order:

1. Save the order in Postgres (must succeed first).
2. **If COD:** book the shipment with the Curfox-powered Royal Express courier API, capture the printable airwaybill PDF, and email it to `dressingbear@gmail.com` for fulfilment.
3. **If prepaid (PAYHERE / KOKO / MINITPAY):** skip the courier booking, log the skip, and send admin a "pending payment" notification. Leave a marked hook point for a future webhook to trigger the courier booking on payment confirmation.
4. Any failure downstream of the local DB write must **never** be shown to the customer. Admin is alerted via email; the checkout success page renders as normal.

## 2. Decision log (the choices made during brainstorm)

| # | Decision | Rationale |
|---|---|---|
| D1 | Destination city resolution via cached Curfox city map + dropdown UX | Curfox requires numeric `destination_city_id`; free-text matching is unsafe (could ship to wrong city) |
| D2 | Synchronous booking with non-blocking failure (option D from brainstorm) | Matches user's stated intent: customer must see success even if Curfox fails. No job queue needed yet. |
| D3 | COD books immediately; prepaid skips (option B2) | No payment-webhook plumbing exists in the codebase yet; scaffolding stub webhooks is out of scope. Future hook is marked with a `TODO(curfox-hook)` comment. |
| D4 | In-memory token cache with TTL + 401 retry | YAGNI on Redis; serverless cold-starts mean worst case is one extra login. |
| D5 | Endpoint paths are env-configurable | The public docs site (`developer.curfox.com`) is bot-blocked; we cannot read exact paths upfront. Config layer lets us correct paths without code changes. |
| D6 | No automated retries of Curfox calls | A 500 may mean partial state on their side; blind retry can double-book. Admin alert → manual decision is safer. |
| D7 | Admin city-refresh endpoint guarded by `AUTH_SECRET` bearer check | Lightweight protection without standing up a full admin auth layer for one endpoint. |

## 3. Open questions / TODO markers

These are flagged inline in the code as `TODO(curfox-verify):` comments. They do not block design or first deployment behind the `ROYAL_EXPRESS_ENABLED=false` flag.

| # | Open question | Default behavior until resolved |
|---|---|---|
| Q1 | Are `v1.api.curfox.com` (login) and `v2-operations.api.curfox.com` (operations) actually different hosts? | Two separate env vars: `CURFOX_LOGIN_BASE_URL`, `CURFOX_BASE_URL`. Set them to the same value if they're identical. |
| Q2 | Exact path for single-order create (`/order` vs `/orders` vs `/order/create`)? | Configurable via `CURFOX_ORDER_CREATE_PATH`, default `/api/merchant/order`. |
| Q3 | How does the waybill PDF get returned (raw stream vs JSON-wrapped URL)? | Client handles both shapes by branching on `content-type`. |
| Q4 | Should `delivery_charge` be sent by us or computed by Curfox? | Omitted from payload by default (Curfox computes). |
| Q5 | Is the `remark` field name correct, or is it `note` / `merchant_remark`? | Sent as `remark`; flagged with TODO. |
| Q6 | Is `waybill_number` returned synchronously by create-order? | The sample data's `is_waybill_auto: true` implies yes. If not, we'll need to add a poll step (currently unimplemented). |

## 4. Module layout (Section 1 of brainstorm)

```
app/
├── checkout/
│   └── actions.ts                          # orchestrator only — calls into clients below
├── _lib/
│   ├── mailer.ts                           # EXISTING + 3 new email helpers
│   ├── courier/                            # NEW directory
│   │   ├── curfox-client.ts                # login → token cache → create order → fetch PDF
│   │   ├── curfox-types.ts                 # Zod schemas + inferred types
│   │   └── city-map.ts                     # DB-backed city name → id lookup + refresh
│   └── checkout-config.ts                  # EXISTING — unchanged
└── api/
    └── admin/
        └── curfox/refresh-cities/route.ts  # NEW — AUTH_SECRET-guarded manual refresh trigger
```

**Frontend impact:** The existing free-text `city` field in `app/checkout/checkout-client.tsx` becomes a `<select>` populated from `listAvailableCities()` (called from the server component shell, passed in as a prop). Required for D1 (deterministic `destination_city_id` resolution).

### 4.1 Prisma schema additions

```prisma
model Order {
  // …existing fields…

  // Curfox booking lifecycle
  courierWaybillNumber  String?
  courierBookedAt       DateTime?
  courierLastError      String?    @db.Text
  courierLastErrorAt    DateTime?

  // PDF capture
  dispatchPdfFetchedAt  DateTime?

  // Email audit
  dispatchEmailSentAt   DateTime?
  adminAlertSentAt      DateTime?
}

model CurfoxCity {
  id                  Int      @id        // The Curfox-assigned city id
  name                String
  defaultWarehouseId  Int?
  updatedAt           DateTime @updatedAt

  @@index([name])
}
```

**Invariant:** `courierWaybillNumber != null && courierBookedAt != null` ⇔ the order is booked at Curfox. `dispatchPdfFetchedAt != null` ⇔ the PDF was captured. Recovery queries can locate "booked but PDF missing" orders.

## 5. Curfox wire format (Section 2 of brainstorm)

### 5.1 Hosts

| Purpose | Default base URL | Env var |
|---|---|---|
| Login | `https://v1.api.curfox.com` | `CURFOX_LOGIN_BASE_URL` |
| Order operations | `https://v2-operations.api.curfox.com` | `CURFOX_BASE_URL` |
| Merchant portal (humans only) | `https://royalexpress.merchant.curfox.com` | — |

### 5.2 Auth — two-step flow

```
POST {LOGIN_BASE}/api/public/merchant/login
  Headers:  Content-Type: application/json
            Accept:       application/json
            X-Tenant:     royalexpress
  Body:     { email: ROYAL_EXPRESS_USER, password: ROYAL_EXPRESS_PASS }
  Response: { token } | { access_token } | { data: { token } }

POST {BASE}{CURFOX_ORDER_CREATE_PATH}
  Headers:  Authorization: Bearer <token>
            X-Tenant:      royalexpress
            Content-Type:  application/json
            Accept:        application/json
  Body:     <mapped payload — see §5.3>
  Response: { data: { id, waybill_number, ... } }
```

The previous Basic-Auth attempt in the existing code is replaced.

### 5.3 Payload mapping

| Curfox field | Source | Notes |
|---|---|---|
| `order_no` | local `orderId` | Customer-facing reference. |
| `customer_name` | session user name ∥ `guestInfo.name` | |
| `customer_address` | `${line1}${line2 ? ", " + line2 : ""}, ${postalCode}` | Curfox is freeform single-field. |
| `customer_phone` | `contactPhone` | Already validated via `LkPhoneSchema`. |
| `customer_secondary_phone` | `null` | Not collected. |
| `customer_email` | session email ∥ `guestInfo.email` | Nullable in Curfox. Same value already used for customer-confirmation email; sent here only as courier-side metadata. |
| `weight` | `CURFOX_DEFAULT_WEIGHT_KG` (default `1`) | Refine when item weights are modeled. |
| `origin_city_id` | `CURFOX_ORIGIN_CITY_ID` (default `1500` = Kotte) | |
| `origin_warehouse_id` | `CURFOX_ORIGIN_WAREHOUSE_ID` (default `78` = Colombo Metropolitan) | |
| `destination_city_id` | `CurfoxCity` lookup by `shippingAddress.city` | Hard-fail with admin alert on miss. |
| `destination_warehouse_id` | `CurfoxCity.defaultWarehouseId` for the chosen city | Optional. |
| `cod` | `paymentMethod === "COD" ? total : 0` | Per D3. |
| `description` | `items.length === 1 ? items[0].name : "Clothes (<n> items)"` | Mirrors sample. |
| `remark` | `notes` (checkout field) | TODO(curfox-verify): field name. |

### 5.4 Token caching strategy

Module-level singleton in `curfox-client.ts`:

```ts
let cachedToken: { value: string; expiresAt: number } | null = null;
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 min — safe under typical 60-min Sanctum default

async function getToken(): Promise<string> { /* re-login if expired or null */ }

async function authedFetch(url, init): Promise<Response> {
  let token = await getToken();
  let res   = await fetch(url, withBearer(init, token));
  if (res.status === 401) {            // token expired between cache hit and call
    cachedToken = null;
    token = await getToken();
    res = await fetch(url, withBearer(init, token));
  }
  return res;
}
```

Cross-request reuse is best-effort (cold starts wipe the cache); worst case is one extra login per cold start.

### 5.5 PDF retrieval — handles both response shapes

```ts
async function fetchWaybillPdf(orderId, waybillNumber): Promise<Buffer> {
  const url = buildPdfUrl(orderId, waybillNumber); // template substitution
  const res = await authedFetch(url);
  const ct  = res.headers.get("content-type") ?? "";

  if (ct.includes("application/pdf")) {
    return Buffer.from(await res.arrayBuffer());
  }
  if (ct.includes("application/json")) {
    const j = await res.json();
    const downloadUrl = j.url ?? j.data?.url ?? j.pdf_url;
    if (!downloadUrl) throw new CurfoxError("Waybill PDF: no url in JSON response", "fetch-pdf");
    const pdfRes = await fetch(downloadUrl);
    return Buffer.from(await pdfRes.arrayBuffer());
  }
  throw new CurfoxError(`Waybill PDF: unexpected content-type ${ct}`, "fetch-pdf");
}
```

## 6. Data flow (Section 3 of brainstorm)

### 6.1 COD path

1. Zod parse → idempotency check → size validation → stock-decrement TXN + order.create (existing, unchanged).
2. Branch on `paymentMethod === "COD"`.
3. Resolve `destination_city_id` from `CurfoxCity` table.
4. `getToken()` (cache or re-login).
5. POST create order; validate response with Zod.
6. Persist `courierWaybillNumber`, `courierBookedAt` to `Order` row.
7. GET waybill PDF; on success record `dispatchPdfFetchedAt`.
8. Send dispatch notification email with PDF attachment.
9. Send existing customer-confirmation email.
10. Return `{success:true, orderId, trackingCode: waybill_number}` to client.

### 6.2 Prepaid path (PAYHERE / KOKO / MINITPAY)

1. Steps 1 identical to COD.
2. `console.log("[checkout] Skipped courier automation: awaiting payment confirmation", { orderId })`.
3. Send pending-prepaid notification email (no PDF, no Curfox info).
4. Send existing customer-confirmation email.
5. `// TODO(curfox-hook): on PayHere/Koko/MinitPay webhook confirmation, call bookCourierAndNotify(orderId).`
6. Return `{success:true, orderId}` to client.

### 6.3 Idempotency

The existing `idempotencyKey` short-circuit on the existing order is preserved. A retried submission **never re-triggers Curfox** — if the first call booked successfully, the second short-circuits before reaching the courier branch. If the first call failed at the Curfox step, admin alerts already fired, and re-booking would require a manual admin action (future enhancement).

## 7. Error handling & recovery (Section 5 of brainstorm)

### 7.1 Per-step matrix

| Step | DB write on failure | Console log | Admin email | Retry |
|---|---|---|---|---|
| City lookup miss | `courierLastError = "city not in map: <name>"` | `console.warn("[curfox] city-lookup failed", { orderId, city })` | `city-lookup` alert | No |
| Login failure | `courierLastError = "login failed: <status>"` | `console.error("[curfox] login failed", { status, body })` | `curfox-login` alert | No |
| Create-order 4xx/5xx | `courierLastError = "create-order <status>: <body>"` | `console.error("[curfox] create-order failed", { status, body, payload })` (phone redacted) | `curfox-create` alert with full body | No |
| Waybill persist failure | — (DB unavailable) | `console.error("[curfox] WAYBILL LOST", { waybillNumber, orderId })` | `curfox-persist` `[URGENT]` alert | No |
| PDF fetch failure | `courierLastError = "pdf-fetch: <reason>"`; `courierBookedAt` retained | `console.warn("[curfox] pdf-fetch failed", ...)` | **Both:** the `curfox-pdf` admin alert AND the dispatch-success email (the latter sent without the PDF attachment, with a note in the body that the PDF must be downloaded from the portal) | No |
| Dispatch email failure | `courierLastError = "dispatch-email: <smtp err>"` | `console.error("[mailer] dispatch send failed", err)` | **No** (would loop) | No |
| Customer-confirmation email failure | (existing) | (existing) | **No** | No |

### 7.2 Boundary guarantee

The only failures the customer ever sees are:

- Zod validation
- "Failed to create order" (DB unavailable at the order-create TXN)
- "Insufficient stock for X"
- "Please select a size for X"

Everything downstream of a successful `order.create` is contained.

## 8. Admin email content (Section 5.3–5.5 of brainstorm)

### 8.1 Failure alert (uniform template)

```
Subject: [Dressing Bear] Order ORD-1747824361-A3K9XQ — Curfox <step> failed
From:    Dressing Bear <a9e490001@smtp-brevo.com>
Reply-To: dressingbear@gmail.com
To:      dressingbear@gmail.com

A Dressing Bear order saved successfully but the downstream
courier/dispatch step failed. The customer was NOT shown an
error. Manual action may be required.

ORDER DETAILS
─────────────
Order ID:      ORD-...
Placed:        <UTC>
Customer:      <name>
Email:         <email>
Phone:         <e.164>
Payment:       <method>
Total:         LKR ...
Items:         ...

SHIPPING ADDRESS
────────────────
...

FAILURE
───────
Step:          <step>
Reason:        <one-line>
Server time:   <UTC>

DETAIL
──────
    <verbatim error body / stack>

NEXT ACTION
───────────
<step-specific instruction>

─────────────
Dressing Bear · automated alert
```

**Next-action text per step:**

| Step | Next action |
|---|---|
| `city-lookup` | "The city <name> is not in our Curfox city map. Either add it via the admin city-refresh route, or book this order manually in the Curfox portal." |
| `curfox-login` | "Curfox login is failing. Verify ROYAL_EXPRESS_USER / PASS in production env. Until fixed, all COD orders need manual booking." |
| `curfox-create` | "Curfox rejected the order payload. Review the response body above. Book manually at https://royalexpress.merchant.curfox.com/" |
| `curfox-persist` | "⚠ URGENT — Order was booked at Curfox (waybill <n>) but the local DB write failed. Reconcile manually." |
| `curfox-pdf` | "Order booked successfully (waybill <n>) but PDF could not be fetched. Download from the Curfox portal." |

### 8.2 Dispatch success notification (with PDF attachment)

```
Subject: [Dispatch] Order ORD-... — Waybill RA...
Attachment: delivery-note.pdf

A new COD order has been booked with Royal Express via Curfox.
The printable airwaybill is attached.

ORDER:        ORD-...
WAYBILL:      RA...
CUSTOMER:     <name>
PHONE:        <e.164>
COD AMOUNT:   LKR ...
DESTINATION:  <city>

ITEMS:
  • <name> (<size>) × <qty>
  ...

ADDRESS:
  <full address>

Print the attached delivery-note.pdf and hand the parcel + label
to the Royal Express pickup rider.
```

### 8.3 Pending-prepaid notification (no PDF, no Curfox)

```
Subject: [PENDING PAYMENT] Order ORD-... — LKR ... via <Gateway>

A new prepaid order has been placed. Courier booking is
DEFERRED until the payment gateway confirms the transaction.
Do NOT ship this order yet.

ORDER:        ORD-...
CUSTOMER:     <name>
PAYMENT:      <gateway> (pending)
TOTAL:        LKR ...

ITEMS:
  ...

ADDRESS:
  ...

When the gateway confirms, the courier booking will be
triggered (currently manual; future improvement will hook
the gateway webhook).
```

### 8.4 Logging conventions

- Prefixes: `[curfox]`, `[mailer]`, `[checkout]`.
- Sensitive fields **never** logged in full: phone last 4 stripped; emails partially redacted; tokens/passwords never logged.
- Full request body **is** logged on Curfox 4xx (after phone redaction) — necessary for fixing payload bugs.

## 9. Interfaces (Section 4 of brainstorm)

### 9.1 `app/_lib/courier/curfox-types.ts`

- `CurfoxLoginResponseSchema` (z.union of 3 token shapes)
- `CurfoxOrderResponseSchema` (`data.{id, waybill_number, order_no, customer_name, cod, ...}`)
- `CurfoxCitySchema`, `CurfoxCityListResponseSchema`
- `CurfoxCreateOrderInputSchema` (per §5.3 mapping)
- Inferred types: `CurfoxCreateOrderInput`, `CurfoxCreatedOrder`, `CurfoxCity`.

### 9.2 `app/_lib/courier/curfox-client.ts`

```ts
export class CurfoxError extends Error {
  constructor(
    message: string,
    readonly step: "login" | "create-order" | "fetch-pdf" | "list-cities",
    readonly status?: number,
    readonly responseBody?: string,
  );
}

export async function createCurfoxOrder(input: CurfoxCreateOrderInput): Promise<CurfoxCreatedOrder>;
export async function fetchCurfoxWaybillPdf(orderId: number, waybillNumber: string): Promise<Buffer>;
export async function listCurfoxCities(): Promise<CurfoxCity[]>;
```

### 9.3 `app/_lib/courier/city-map.ts`

```ts
export async function resolveCurfoxCity(cityName: string):
  Promise<{ destinationCityId: number; destinationWarehouseId: number | null } | null>;

export async function refreshCurfoxCityMap(): Promise<{ count: number }>;
export async function listAvailableCities(): Promise<Array<{ id: number; name: string }>>;
```

### 9.4 `app/_lib/mailer.ts` — three additions

```ts
export async function sendDispatchNotificationEmail(params: {
  order: OrderDetails;
  waybillNumber: string;
  pdfBuffer?: Buffer;
}): Promise<void>;

export async function sendPendingPrepaidNotificationEmail(params: {
  order: OrderDetails;
}): Promise<void>;

export async function sendAdminFailureAlertEmail(params: {
  orderId: string;
  step: "city-lookup" | "curfox-login" | "curfox-create" | "curfox-persist" | "curfox-pdf";
  reason: string;
  errorDetail?: string;
  order: OrderDetails;
}): Promise<void>;
```

All reuse the existing `getTransport()`, `requireFrom()`, `brandReplyTo()`.

### 9.5 `app/api/admin/curfox/refresh-cities/route.ts`

POST endpoint guarded by `AUTH_SECRET`:

```ts
export async function POST(req: Request) {
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.AUTH_SECRET || provided !== process.env.AUTH_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { count } = await refreshCurfoxCityMap();
  return Response.json({ count });
}
```

Runtime: `nodejs` (uses Prisma).

### 9.6 `app/checkout/actions.ts`

Public `processOrder(input): Promise<CheckoutResult>` signature unchanged. Internal flow:

```ts
// existing: parse → idempotency → size check → stock TXN + order.create
// [unchanged]

if (paymentMethod === "COD") {
  await bookCourierAndNotify({ orderId, /* ...mapped fields... */ });
  // never throws — internal try/catch chain emits admin alerts on failure
} else {
  console.log("[checkout] Skipped courier automation: awaiting payment confirmation", { orderId });
  await sendPendingPrepaidEmailSafe({ orderId, /* ... */ });
  // TODO(curfox-hook): on gateway webhook confirmation, call bookCourierAndNotify(orderId)
}

// existing customer-confirmation email — unchanged
await sendOrderConfirmationEmailSafe(...);

return { success: true, orderId, trackingCode, isGuest: !userId };
```

## 10. Env vars

```
# Existing (unchanged)
ROYAL_EXPRESS_ENABLED       = "true" | "false"
ROYAL_EXPRESS_USER          = login email
ROYAL_EXPRESS_PASS          = login password
ROYAL_EXPRESS_TENANT        = "royalexpress"

# New (all with safe defaults so checkout runs unchanged when unset)
CURFOX_BASE_URL                  = "https://v2-operations.api.curfox.com"
CURFOX_LOGIN_BASE_URL            = "https://v1.api.curfox.com"
CURFOX_ORDER_CREATE_PATH         = "/api/merchant/order"
CURFOX_WAYBILL_PDF_PATH_TEMPLATE = "/api/merchant/order/{id}/waybill"
CURFOX_CITIES_PATH               = "/api/merchant/city"
CURFOX_ORIGIN_CITY_ID            = "1500"
CURFOX_ORIGIN_WAREHOUSE_ID       = "78"
CURFOX_DEFAULT_WEIGHT_KG         = "1"
```

`.env.local.example` is updated with the new vars.

## 11. Testing strategy (Section 6 of brainstorm)

### 11.1 Tiers

| Tier | Proves | Speed |
|---|---|---|
| Unit | Payload mapping, Zod schemas, error class metadata, mailer templates | <1s |
| Integration | `processOrder` end-to-end with stubbed Curfox + SMTP — COD branch, prepaid branch, every failure-cascade row | ~5s |
| Manual smoke | Real Curfox + real Brevo, on staging | ~2 min |

### 11.2 Critical unit cases

1. Token cache reuse within TTL; expiry triggers re-login; 401 mid-call triggers one re-login then propagates failure.
2. `fetchCurfoxWaybillPdf` branches on `content-type`: raw PDF vs JSON-wrapped URL.
3. COD with missing city → order saved, `courierLastError` set, `city-lookup` admin alert, customer sees success.
4. COD with Curfox 422 → order saved, no waybill, `curfox-create` admin alert with full response body, customer sees success.
5. Prepaid → no Curfox calls (mock would throw if hit), pending-prepaid email sent, customer sees success.
6. COD with Curfox 200 but PDF 404 → `courierWaybillNumber` + `courierBookedAt` set, no `dispatchPdfFetchedAt`, dispatch email sent **without** attachment.

### 11.3 Test seams

- **Curfox**: `vi.mock("@/app/_lib/courier/curfox-client", ...)` at the import boundary.
- **SMTP**: small `mailer.ts` refactor to honor `__setTestTransport()` override; tests use `nodemailer.createTransport({ jsonTransport: true })` (built-in, no deps).
- **Prisma**: per-test SQLite database (`file:./test.db`) reset between test files.

### 11.4 Staging validation checklist

Run on staging (or local with prod-like env) before flipping `ROYAL_EXPRESS_ENABLED=true` in production. Log results back into this spec as "Validation log: <date>".

1. **City map seeding** — `POST /api/admin/curfox/refresh-cities` (with `AUTH_SECRET` bearer) returns `{ count: N }`, N > 0. Spot-check that Colombo and Kotte rows exist with expected IDs.
2. **COD happy path** — place low-value test order to your own phone, Colombo address. Verify: success in <8s; `Order` row has `courierWaybillNumber`, `courierBookedAt`, `dispatchPdfFetchedAt` set; admin email arrives with PDF attachment; new order visible in Curfox portal. Cancel in portal before pickup.
3. **COD with unknown city** — `city="ZZZ-Nonexistent"`. Verify: success; no waybill; `courierLastError` contains "city not in map"; admin `city-lookup` alert email arrives; customer email arrives.
4. **Prepaid** — `paymentMethod=PAYHERE`. Verify: success in <2s; no `courier*` fields set; `[PENDING PAYMENT]` admin email arrives; server log shows "Skipped courier automation".
5. **Simulated Curfox outage** — temporarily `CURFOX_BASE_URL=https://example.invalid`. Place COD order. Verify: success; `courierLastError` contains network error; `curfox-login` admin alert; customer email arrives. Revert env.
6. **SMTP outage (optional)** — `SMTP_HOST=smtp.invalid`. Place order. Verify: success (no thrown error); `[mailer] dispatch send failed` log; order row still created. Revert env.

### 11.5 Local execution

```powershell
npm install
npx prisma migrate dev --name curfox-courier-fields
npm run dev
# Seed cities (one-time):
curl -X POST http://localhost:3000/api/admin/curfox/refresh-cities `
  -H "Authorization: Bearer $env:AUTH_SECRET"
# → { count: <N> }

npm test
npm run build  # MUST pass before merge (per CLAUDE.md §2)
```

## 12. Rollout plan

| Step | Action | Rollback |
|---|---|---|
| 1 | Deploy with `ROYAL_EXPRESS_ENABLED=false` | n/a — code is no-op |
| 2 | Seed city map via admin route | n/a |
| 3 | Flip `ROYAL_EXPRESS_ENABLED=true` | Flip back to `false` (zero-downtime, no code change) |

### Kill-switches

| Symptom | Override | Effect |
|---|---|---|
| Curfox rejects payloads | `ROYAL_EXPRESS_ENABLED=false` | Skip all courier calls |
| PDF endpoint broken; bookings OK | `CURFOX_WAYBILL_PDF_PATH_TEMPLATE=""` | Treat PDF as failed; dispatch email sent without attachment |
| SMTP rate-limited | (none — log-only) | Existing behavior; checkout continues |

## 13. Definition of done

- [ ] Prisma migration applied; existing orders have `null` for new columns
- [ ] All files in §4 exist with the interfaces from §9
- [ ] All unit cases from §11.2 pass
- [ ] Integration test covers COD-happy, COD-fail-per-step, prepaid
- [ ] `npm run build` clean
- [ ] `.env.local.example` updated with §10 vars
- [ ] Staging validation checklist (§11.4) completed; results pasted here as "Validation log: <date>"
- [ ] PR description references this spec doc

## 14. Out of scope

- Curfox webhook ingestion (order-status updates back to our DB)
- Real PayHere / Koko / MinitPay payment-gateway integration
- Waybill-reprint admin UI
- Bulk-order create
- Multi-courier fallback
