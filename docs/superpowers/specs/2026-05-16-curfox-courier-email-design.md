# Curfox Courier Booking + Dispatch Email — Design Spec

- **Status:** Approved (brainstorm 2026-05-16); revised with validation findings.
- **Owner:** Dressing Bear engineering
- **Touch points:** `app/checkout/actions.ts`, `app/_lib/mailer.ts`, new `app/_lib/courier/*`, Prisma schema, `.env.local.example`.
- **Related:** `CLAUDE.md` §1 (Spec → Plan → Implement), existing RoyalExpress stub in `app/checkout/actions.ts`.

## 1. Goal

When a customer places an order:

1. Save the order in Postgres (must succeed first).
2. **If COD:** book the shipment with the Curfox-powered Royal Express courier API, capture the printable airwaybill PDF, and email it to `dressingbear@gmail.com` for fulfilment.
3. **If prepaid (PAYHERE / KOKO / MINITPAY):** skip the courier booking, log the skip, and send admin a "pending payment" notification. Leave a marked hook point for a future webhook to trigger the courier booking on payment confirmation.
4. Any failure downstream of the local DB write must **never** be shown to the customer. Admin is alerted via email; the checkout success page renders as normal.

## 2. Decision log (the choices made during brainstorm & validation)

| # | Decision | Rationale |
|---|---|---|
| D1 | Free-text `destination_city_name` (Revised) | Curfox has no public city ID list; `destination_city_name` is supported and allows us to skip a complex DB-backed lookup table. |
| D2 | Synchronous booking with non-blocking failure | Matches user's stated intent: customer must see success even if Curfox fails. |
| D3 | COD books immediately; prepaid skips | No payment-webhook plumbing exists in the codebase yet. |
| D4 | In-memory token cache with TTL + 401 retry | YAGNI on Redis; serverless cold-starts mean worst case is one extra login. |
| D5 | Endpoint paths are env-configurable | API hosts/paths vary (v1 vs v2). Config layer allows runtime fixes without code changes. |
| D6 | Nested payload structure (Revised) | Validation showed Curfox rejects flat payloads; requires `general_data` + `order_data[]` envelope. |
| D7 | Waybill-based PDF retrieval (Revised) | The API returns waybills but no numeric order IDs; path template must use `{waybill}`. |

## 3. Open questions / TODO markers

| # | Open question | Default behavior until resolved |
|---|---|---|
| Q1 | Exact path for waybill PDF print? | Probed candidate: `/api/merchant/order/print/{waybill}`. Flagged with `TODO(curfox-verify)`. |
| Q2 | How does the waybill PDF get returned (raw stream vs JSON-wrapped URL)? | Client handles both shapes by branching on `content-type`. |
| Q3 | Should `delivery_charge` be sent by us or computed by Curfox? | Omitted from payload by default (Curfox computes). |
| Q4 | Is the `remark` field name correct? | Sent as `remark`; flagged with TODO. |

## 4. Module layout

```
app/
├── checkout/
│   └── actions.ts                          # orchestrator only — calls into clients below
├── _lib/
│   ├── mailer.ts                           # EXISTING + 3 new email helpers
│   ├── courier/                            # NEW directory
│   │   ├── curfox-client.ts                # login → token cache → create order (nested) → fetch PDF
│   │   └── curfox-types.ts                 # Zod schemas (nested payload, array response)
│   └── checkout-config.ts                  # EXISTING — unchanged
```

**Removed from original design:** `city-map.ts`, `refresh-cities` route, and `CurfoxCity` Prisma model (redundant due to D1).

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
```

## 5. Curfox wire format

### 5.1 Auth — two-step flow

```
POST {LOGIN_BASE}/api/public/merchant/login
  Headers:  Content-Type: application/json
            X-Tenant:     royalexpress
  Body:     { email: ROYAL_EXPRESS_USER, password: ROYAL_EXPRESS_PASS }
  Response: { token: "..." }

POST {BASE}{CURFOX_ORDER_CREATE_PATH}
  Headers:  Authorization: Bearer <token>
            X-Tenant:      royalexpress
  Body:     <nested payload — see §5.2>
  Response: { "message": "...", "data": ["RA000000"] }
```

### 5.2 Nested Payload Mapping

```json
{
  "general_data": {
    "merchant_business_id": CURFOX_MERCHANT_BUSINESS_ID,
    "origin_city_id": CURFOX_ORIGIN_CITY_ID,
    "origin_warehouse_id": CURFOX_ORIGIN_WAREHOUSE_ID
  },
  "order_data": [
    {
      "order_no": "ORD-...",
      "customer_name": "...",
      "customer_address": "...",
      "customer_phone": "...",
      "weight": 1,
      "cod": 0,
      "description": "...",
      "destination_city_name": "...",
      "remark": "..."
    }
  ]
}
```

## 6. Data flow

### 6.1 COD path

1. Local DB write (existing).
2. `bookCourierAndNotify()` called.
3. Build nested payload using `CURFOX_MERCHANT_BUSINESS_ID`.
4. POST to `/api/merchant/order/single`.
5. Parse waybill from response array: `data[0]`.
6. GET waybill PDF using waybill number.
7. Send dispatch notification with PDF.
8. Send customer confirmation.

## 7. Interfaces

### 7.1 `app/_lib/courier/curfox-types.ts`

- `CurfoxCreateOrderInputSchema`: `{ general_data: {...}, order_data: [{...}] }`
- `CurfoxOrderResponseSchema`: `{ message: string, data: string[] }`

### 7.2 `app/_lib/courier/curfox-client.ts`

```ts
export async function createCurfoxOrder(input: CurfoxCreateOrderInput): Promise<string>; // returns waybill
export async function fetchCurfoxWaybillPdf(waybillNumber: string): Promise<Buffer>;
```

## 8. Env vars

```
CURFOX_MERCHANT_BUSINESS_ID      = "7290"
CURFOX_BASE_URL                  = "https://v2-operations.api.curfox.com"
CURFOX_LOGIN_BASE_URL            = "https://v1.api.curfox.com"
CURFOX_ORDER_CREATE_PATH         = "/api/merchant/order/single"
CURFOX_WAYBILL_PDF_PATH_TEMPLATE = "/api/merchant/order/print/{waybill}"
```

## 9. Validation log: 2026-05-16

Real probe of API hosts revealed:
- Flat payload is rejected; **nested format required**.
- Response is an **array of waybills**, not an object.
- **No numeric order ID** returned; PDF fetch must use waybill.
- **No cities endpoint** found; use `destination_city_name` (free text).
- `merchant_business_id` is required (7290 for Dressing Bear).
- Success waybill `RA03872055` created during probe (needs manual portal cancellation).

## 10. Out of scope

- Curfox webhook ingestion (order-status updates back to our DB)
- Real PayHere / Koko / MinitPay payment-gateway integration
- Waybill-reprint admin UI
- Bulk-order create
- Multi-courier fallback
