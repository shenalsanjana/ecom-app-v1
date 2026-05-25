# PayHere Embedded Checkout Integration — Design

**Date:** 2026-05-25
**Type:** Payment Gateway Integration
**Status:** Approved

---

## 1. Overview

Integrate PayHere Checkout JS (embedded modal) as the payment flow for orders placed with the "PayHere" payment method. The user selects PayHere at checkout, clicks "Place Order", a PayHere modal opens on the same page, and after successful payment the order transitions to PAID and courier booking is triggered.

## 2. Credentials

Stored in `.env.local`:

```
PAYHERE_MODE="sandbox"          # "sandbox" | "live"
PAYHERE_APP_ID="4J9MIkFKo1V4J9Mbj0Yjf43sXFJ1QyO8117uH1N3o3u"
PAYHERE_APP_SECRET="4KEQTWQqCSi8m1nlh92Hqe8Rkt8rCfLEZ4Z7h65YXBa9"
```

Credentials are accessed server-side only via `process.env`.

## 3. PayHere Checkout JS Integration

PayHere provides a client-side SDK loaded via their CDN. The integration uses the **Payment Ticket** flow:

1. Server creates a payment ticket (one-time session) via PayHere REST API
2. Client initializes the Checkout JS with the returned `payment_id`
3. Checkout SDK opens a modal for the user to enter card details
4. On completion, PayHere redirects to a specified `return_url`

### 3.1 New API Routes

**`POST /api/payhere/payment`**

Creates a PayHere payment ticket. Called from the checkout client before opening the modal.

Request body:
```typescript
{
  orderId: string;      // Internal order ID (ORD-...)
  amount: number;       // Total in LKR ( PayHere requires paisa-less integer)
  currency: "LKR";
  items: { name: string; quantity: number; amount: number }[];
  customer: { name: string; email: string; phone: string };
  returnUrl: string;    // e.g. `${APP_URL}/checkout/success`
  notifyUrl: string;    // Webhook URL: `${APP_URL}/api/payhere/webhook`
}
```

Response:
```typescript
{ paymentId: string } | { error: string }
```

Implementation:
- Fetch `https://www.payhere.lk/paycheckout.ps? identifier=payment_ticket` (sandbox) with Basic auth using PayHere credentials
- Returns a `payment_id` (a UUID string)
- Order's `paymentStatus` is set to `PENDING` before this call (already done by `processOrder`)

**`POST /api/payhere/webhook`**

Receives PayHere's asynchronous payment notification. Updates the order's `paymentStatus` to `PAID` and triggers courier booking.

PayHere POSTs to this URL with `application/x-www-form-urlencoded`. Fields include:
- `payment_id`, `order_id`, `status`, `amount`, `currency`, `md5sig`

Verification:
- Compute HMAC-SHA256 of `merchant_id + order_id + amount + currency + status` using `PAYHERE_APP_SECRET`
- Compare against `md5sig` header
- Reject if signature mismatch

Side effects on success (`status === "COMPLETED"`):
1. `prisma.order.update({ where: { id }, data: { paymentStatus: "PAID" } })`
2. Re-fetch order details and call `orchestrateCourierBooking(orderId, orderDetails)` — same pattern as COD flow
3. Send order confirmation email if not already sent

The handler must be **idempotent** — if PayHere retries the webhook, the update is a no-op on an already-PAID order.

### 3.2 Checkout Client Changes

In `app/checkout/checkout-client.tsx`:

- Add `useEffect` to load PayHere Checkout JS SDK from `https://www.payhere.lk/paycheckout.js` (sandbox URL)
- When `paymentMethod === "PAYHERE"` and form is submitted:
  1. First call `processOrder` server action (creates the order in PENDING state)
  2. Then call `POST /api/payhere/payment` to get a `payment_id`
  3. Initialize `PayHerePayment.checkout({ payment_id })` — this opens the modal
- On PayHere redirect to `/checkout/success`, show the confirmation screen

### 3.3 New Pages

**`app/checkout/success/page.tsx`**

Server component. Reads `orderId` from search params. Fetches order from Prisma and displays:
- Order reference number
- Payment status (PAID)
- Estimated delivery info
- Continue shopping button

## 4. Data Model

No schema changes needed. The `Order.paymentStatus` field already supports `"PENDING"` and `"PAID"` via the existing `PAYMENT_STATUSES` enum in `app/_lib/order-status.ts`.

## 5. Error Handling

| Scenario | Behavior |
|---|---|
| PayHere modal closes without payment | Order stays PENDING; user sees checkout with items still in cart; can retry |
| PayHere payment fails | SDK shows error in modal; user can retry from modal |
| Webhook verification fails | Return 403; PayHere retries |
| Order already PAID when webhook arrives | Idempotent — no-op, return 200 |
| Courier booking fails after webhook | Logged; admin alerted via `sendAdminFailureAlertEmail` |
| `/api/payhere/payment` server error | Return error; client shows generic error message |

## 6. Sandbox vs Live

- **Sandbox** (`PAYHERE_MODE=sandbox`): Use PayHere sandbox API endpoints and `https://sandbox.payhere.lk/paycheckout.ps? identifier=payment_ticket`
- **Live** (`PAYHERE_MODE=live`): Use production PayHere endpoints

## 7. Implementation Order

1. Add `PAYHERE_APP_ID`, `PAYHERE_APP_SECRET`, `PAYHERE_MODE` to `.env.local`
2. Create `app/api/payhere/payment/route.ts` — creates payment ticket
3. Create `app/api/payhere/webhook/route.ts` — receives and verifies webhook
4. Create `app/checkout/success/page.tsx` — success confirmation page
5. Update `app/checkout/checkout-client.tsx` — integrate PayHere Checkout JS
6. Write tests for webhook signature verification and idempotency
7. Run `npm run build` and verify

## 8. Security Considerations

- `PAYHERE_APP_SECRET` never leaves the server — only used in API routes
- Webhook signature verification using HMAC-SHA256 prevents spoofed notifications
- Idempotent webhook handler prevents double-charging or double-processing
- Order amount on webhook is validated server-side against stored order total
