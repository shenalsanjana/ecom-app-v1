# Koko and Mintpay Payment Integration Design

Date: 2026-05-28

## Goal

Add Koko and Mintpay as online checkout payment methods alongside COD and PayHere. The implementation should use a shared payment provider layer so provider-specific signing and redirect details do not duplicate order finalization, stock restoration, email, and courier logic.

The correct payment method name is `MINTPAY`. Existing code references to `MINITPAY` are spelling mistakes and should be replaced during implementation. This project is assumed to be pre-production for Mintpay, so no legacy `MINITPAY` compatibility is required unless production data says otherwise.

## Local Provider References

Provider files are available under:

- `tmp/minit/`
- `tmp/koko/`

These local files contain real-looking test credentials and private key material. Do not commit those files, do not copy provider secrets into docs, and do not echo credential values in logs or test output. Implementation should use environment variables only.

## Current State

The checkout flow already supports order creation for COD and online payment methods:

- COD orders use `paymentStatus = COD_PENDING`.
- Online orders use `paymentStatus = PENDING`.
- Stock is decremented when the order is created.
- PayHere has a complete provider-specific flow: initiate route, checkout form fields, webhook verification, success-page polling, paid finalization, email, and courier trigger.
- Koko and Mintpay currently appear as payment options in code, but do not have working provider integration.

## Architecture

Add a shared payment layer under `app/_lib/payments/`.

Recommended modules:

- `types.ts`: shared `PaymentMethod`, provider names, initiate result, callback/finalization types.
- `registry.ts`: maps online payment methods to provider adapters and filters checkout-visible methods from env/config.
- `payhere.ts`: PayHere URL selection, hash generation, form-field creation, and webhook verification using the current logic.
- `koko.ts`: Koko URL selection, RSA SHA256 data-string signing, and form-field creation.
- `mintpay.ts`: Mintpay URL selection, create-order API payload, HMAC return/fail hash generation, and return verification.
- `order-finalization.ts`: shared order lifecycle logic for successful and failed online payments.

Checkout should call one generic payment initiation endpoint for online methods instead of special-casing PayHere in the client. COD remains a direct order confirmation path.

## Provider Flows

### PayHere

Keep the existing hosted checkout behavior:

1. Load the created order from the database.
2. Verify `order.paymentMethod === "PAYHERE"` and `paymentStatus !== "PAID"`.
3. Generate the PayHere checkout hash.
4. Return gateway URL and hidden form fields.
5. Verify PayHere webhook signature before marking the order paid.

The implementation may keep legacy `/api/payhere/payment` and `/api/payhere/webhook` route paths as wrappers, but business logic should move into the shared provider/finalization layer.

### Koko

Koko uses a form POST to its order-create endpoint.

Design behavior:

1. Select endpoint by `KOKO_MODE`, defaulting to test/QA.
2. Build provider fields from the created order: merchant id, API key, return URL, response URL, cancel URL, currency, amount, order id, reference, customer name, email, phone, description, plugin name/version.
3. Build the Koko data string in the documented order.
4. Sign the data string with the configured RSA private key using SHA256, base64 encode the signature, and include it in the form fields.
5. Redirect customer by submitting the hidden form.
6. Finalize payment only from a verified provider response/return. If Koko provides only a return response in the current docs, the route must still verify all available signed/hashable data before changing order state.

### Mintpay

Mintpay uses an API create-order step followed by a form POST to the Mintpay login URL.

Design behavior:

1. Select API and login URLs by `MINTPAY_MODE`, defaulting to test/dev.
2. Build the API payload with merchant id, order id, total, discount, customer email/telephone, delivery address/city, product lines, success URL, and fail URL.
3. Authenticate the create-order API call with the configured merchant secret token.
4. On successful API response, return Mintpay login URL and a hidden `purchase_id` form field.
5. Success URL includes an HMAC hash over merchant id, formatted amount, and order id.
6. Fail URL includes an HMAC hash over order id.
7. Return handler verifies the HMAC before marking the order `PAID` or failed.

## Data Flow

1. Customer selects `COD`, `PAYHERE`, `KOKO`, or `MINTPAY`.
2. `processOrder()` validates cart, customer, and address input.
3. The order is created and stock is decremented atomically.
4. Initial payment status is assigned:
   - COD: `COD_PENDING`
   - Online methods: `PENDING`
5. For online methods, checkout calls the generic initiate endpoint with `orderId`.
6. Provider adapter returns gateway form action and hidden fields.
7. Browser shows a provider-specific redirect overlay and submits the hidden form.
8. Provider return/callback route verifies the provider response.
9. Shared finalization handles the order:
   - Success: set `paymentStatus = PAID`, keep `status = PENDING`, send confirmation email, and trigger courier booking.
   - Failure/cancel: set `paymentStatus = PAYMENT_FAILED`, set `status = CANCELLED`, restore stock once, and do not send confirmation email or book courier.
10. Success page polls `/api/orders/[id]/payment-status` until paid, failed, or timeout.

## Order Lifecycle

Add `PAYMENT_FAILED` to the known payment statuses.

Failure/cancel behavior:

- `paymentStatus = PAYMENT_FAILED`
- `status = CANCELLED`
- Stock is restored for each order item exactly once.
- Confirmation email is not sent.
- Courier booking is not triggered.

Idempotency rules:

- If an order is already `PAID`, ignore later failure/cancel callbacks.
- If an order is already `PAYMENT_FAILED` or `CANCELLED`, do not restore stock again.
- If an order is still `PENDING`, mark failed/cancelled and restore stock.
- If an order is already paid and receives another success callback, return success without repeating email/courier side effects.

## Environment Variables

Use variable names only in committed examples. Do not commit values.

Existing Koko names in local env:

- `KOKO_MODE`
- `KOKO_MERCHANT_ID`
- `KOKO_API_KEY`
- `KOKO_PUBLIC_KEY`
- `KOKO_PRIVATE_KEY`

Add launch/config variables:

- `KOKO_ENABLED`
- `MINTPAY_ENABLED`
- `MINTPAY_MODE`
- `MINTPAY_MERCHANT_ID`
- `MINTPAY_MERCHANT_SECRET`

Optional but useful:

- `KOKO_PLUGIN_NAME`
- `KOKO_PLUGIN_VERSION`

Mode behavior:

- Test/dev/QA mode is the default for both providers.
- Live mode is selected explicitly with provider mode env vars.
- Koko and Mintpay are hidden from checkout until test verification is complete and their enabled flags are true.
- After tests pass, setting `KOKO_ENABLED=true` and `MINTPAY_ENABLED=true` should make them visible in checkout immediately.

## User Experience

Checkout payment options should show:

- Cash on Delivery
- PayHere
- Koko
- Mintpay

Online payment submission should show a provider-specific redirect overlay:

- "Redirecting to PayHere..."
- "Redirecting to Koko..."
- "Redirecting to Mintpay..."

If gateway initiation fails, the order remains saved and the customer sees a clear retryable message:

> Payment gateway is not configured. Your order is saved. Please try again or contact support.

The retry payment button should be provider-generic, not PayHere-specific.

The success page should treat `PAYMENT_FAILED` and `CANCELLED` as a failed/cancelled payment state, not as a still-confirming payment.

## Error Handling

Provider config errors:

- Return a controlled 500 response from the initiate route.
- Do not expose secrets or raw provider config.
- Show a customer-safe error in checkout.

Provider API errors:

- Keep the created order in `PENDING`.
- Let the customer retry initiation without creating a duplicate order.
- Log provider name, order id, and sanitized failure reason.

Provider callback/return errors:

- Reject unverified signatures/hashes.
- Do not modify order state on unverified responses.
- Do not restore stock on suspicious/unverified responses.

## Testing

Unit tests:

- `PaymentMethod` uses `MINTPAY`; no production code path uses `MINITPAY`.
- Koko config reader selects QA/live URLs correctly.
- Mintpay config reader selects dev/live URLs correctly.
- Koko data string and RSA SHA256 signature generation are deterministic with fixture keys.
- Mintpay success and fail HMAC verification works.
- Shared finalization marks successful online payments as `PAID`.
- Shared finalization marks failed/cancelled online payments as `PAYMENT_FAILED` and `CANCELLED`.
- Stock restoration happens once on failure/cancel.
- Already-paid orders ignore later failure/cancel callbacks.
- Checkout order creation still assigns correct initial payment statuses.

Route/client tests:

- Generic initiate route rejects unsupported payment methods.
- Generic initiate route rejects provider/order mismatches.
- Checkout client uses generic provider initiation and redirect handling.
- Payment status endpoint returns enough state for paid and failed/cancelled success-page rendering.
- Success page renders failed/cancelled state for `PAYMENT_FAILED` / `CANCELLED`.

Manual/sandbox verification:

- Sandbox Koko paid flow.
- Sandbox Koko cancel/fail flow.
- Sandbox Mintpay paid flow.
- Sandbox Mintpay cancel/fail flow.
- Paid flow sends confirmation email and triggers courier only after verified payment.
- Cancel/fail flow restores stock and does not send confirmation email or trigger courier.

## Out Of Scope

- New admin order-management pages.
- A separate payment transaction/audit table.
- Automated payment expiry for long-running `PENDING` online orders.
- Provider settlement reconciliation dashboards.
- Committing provider sample files or credentials.

