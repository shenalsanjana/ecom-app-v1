# Checkout Contact Details & SMS Order Notifications — Design

**Date:** 2026-07-04
**Status:** Draft — pending implementation plan
**Branch:** `feat/checkout-contact-notifications` (single branch, phased)

---

## 1. Goal

Modernise the customer contact and order-notification flow so it matches how a phone-first, courier-delivered Sri Lankan store actually operates. Concretely:

- **Login** already accepts phone *or* email (via `resolveIdentifier`); only the sign-in / forgot-password **field label** and its supporting copy change to **"Email or Mobile Number"**. **Registration stays phone-first with OTP** (phone required, email optional) — no functional auth change.
- **Registered checkout** pre-fills the customer's saved **mobile, email, and default shipping address**; the contact number is **editable for the current order only** (never written back to the profile); an optional **Alternate Mobile Number** can be added for delivery.
- **Guest checkout** requires a **mobile number** (the notification channel) and makes **email optional**, with helper text setting the expectation that updates go by SMS.
- **Order notifications** gain an **SMS channel** (Notify.lk, already wired for auth OTP) for **confirmation, dispatch, and cancellation**, routed through a single dispatcher that also drives the existing transactional email. A customer is reached on **every channel available to them** — email when present, SMS to the order's mobile always.

This closes today's real gap: a phone-first registered customer with no `email` currently receives **no order communication at all**, because every order message is email-only.

## 2. Non-goals

- **No change to how the identifier is resolved.** `resolveIdentifier` (phone-vs-email) and the credentials `authorize()` lookup are untouched; login already works with either. This change is copy + checkout + notifications, not an auth rewrite.
- **Registration stays phone-first.** Sign-up still *requires* an OTP-verified mobile with optional email (decided in brainstorming). We are **not** adding an email-only registration path or an email-verification-link signup.
- **No "delivered" SMS, no marketing SMS, no per-channel opt-out preferences.** SMS is transactional and limited to the three chosen events. (Delivered has no email today either; a delivered notification is a possible follow-up.)
- **No OTP at checkout.** A registered customer editing the contact number, or a guest entering one, does **not** re-verify by OTP — it is a per-order delivery contact, matching the existing (unverified) guest-phone behaviour.
- **The Alternate Mobile Number never updates the profile or the Address book.** It lives only on the order and flows only to the courier.
- **No change to payment, cart, courier-booking mechanics, or admin bootstrap** beyond adding the alternate phone to the courier payload and routing customer notifications through the new dispatcher.

## 3. Constraints from the existing codebase

- **Notify.lk SMS client already exists** (`app/_lib/sms.ts`): private `sendSms(phone, message)` strips the leading `+` (Notify wants `94XXXXXXXXX`), reads `NOTIFY_LK_USER_ID` / `NOTIFY_LK_API_KEY` / `NOTIFY_LK_SENDER_ID`, throws unless `json.status === "success"`, and has a `__setTestSmsSender` seam. Today it exports only `sendOtpSms` and `sendAccountExistsSms`. **No new env vars are needed** — order SMS reuses the same three secrets.
- **Email is nodemailer + raw SMTP** (`app/_lib/mailer.ts`); customer functions `sendOrderConfirmationEmail`, `sendCustomerDispatchEmail`, `sendCustomerCancellationEmail` all send `to: OrderDetails.customerEmail`. `OrderDetails.customerEmail` is resolved as `guestEmail ?? user.email ?? ""` at each build site (`checkout/actions.ts`, `order-finalization.ts:paidDetails`, `admin/orders/actions.ts:toOrderDetails`). A `shouldEmailCustomer(email)` guard (`app/_lib/mailer-guard.ts`) skips empty/placeholder emails. **These email behaviours must be preserved exactly.**
- **Confirmation-email idempotency is load-bearing on the prepaid path.** `finalizePaidPayment` (`app/_lib/payments/order-finalization.ts`) claims the order atomically with `updateMany({ where: { paymentStatus: { not: "PAID" } }, data: { paymentStatus: "PAID" } })` — Koko fires *two* callbacks, so this claim, not the `emailSent` flag, is the real single-send gate. **Any SMS added here must sit inside/after that claim and carry its own idempotency flag; it must not weaken the payment claim.**
- **No local database in this workspace.** `DATABASE_URL` is unset, so `prisma migrate dev` and `next build` prerender cannot run here. Schema changes ship as **hand-authored SQL** through the decoupled `.github/workflows/migrate.yml` flow. Local gate = **`npm run test` (Vitest) + `tsc --noEmit`**.
- **Phone schemas already split by capability.** `LkMobileSchema` (`app/_lib/phone.ts`) canonicalises to E.164 `+947XXXXXXXX` and **rejects landlines** (used by signup/reset). `LkPhoneSchema` (`app/_lib/validation.ts`) is permissive — accepts landlines, strips separators, does **not** canonicalise — and is what checkout uses today for `contactPhone` and guest `phone`.
- **`Order.customerPhone` is a required, per-order snapshot** (`String`, non-null). `guestEmail`/`guestName` are already nullable. There is **no** alternate-phone column and **no** SMS-sent flags today. Existing flags: `emailSent Boolean`, `dispatchEmailSentAt`, `customerDispatchEmailSentAt`.
- **Curfox already supports a secondary phone.** `CurfoxOrderDataItem.customer_secondary_phone` exists (`app/_lib/courier/curfox-types.ts`) and is redacted in logs, but `book-courier.ts` never populates it. This is the reuse target for the alternate number. `toLocalSriLankaPhone()` there converts `+94…`/`94…` → leading-`0` local form.
- **Checkout pre-fill has nothing to read from today.** `checkout/page.tsx` passes only `{ name, email }` from the session; the JWT carries no phone, and the `Address` book (`app/account/addresses/`, `Address` model with `isDefault`) is never queried by checkout. `CheckoutClient` initialises `phone=""` and a blank address.
- **Tests:** Vitest under `app/**/__tests__/`; Playwright E2E under `tests/e2e/` (several specs assert `getByLabel("Phone or email")` and the guest email field — these will need updating).

## 4. Design

### 4.1 Schema changes (one hand-authored migration)

`prisma/schema.prisma` — add four nullable columns to `Order`:

```prisma
model Order {
  // ...existing fields...
  customerPhone             String     // unchanged: primary (SMS) contact, now stored canonical +94…
  alternatePhone            String?    // NEW — optional secondary delivery phone; courier-only, order-scoped
  confirmationSmsSentAt     DateTime?  // NEW — idempotency stamp for the confirmation SMS
  dispatchSmsSentAt         DateTime?  // NEW — idempotency stamp for the customer dispatch SMS
  cancellationSmsSentAt     DateTime?  // NEW — idempotency stamp for the cancellation SMS
  // ...
}
```

- **Migration SQL (hand-authored)**, additive and backfill-free:
  `ALTER TABLE "Order" ADD COLUMN "alternatePhone" TEXT, ADD COLUMN "confirmationSmsSentAt" TIMESTAMP(3), ADD COLUMN "dispatchSmsSentAt" TIMESTAMP(3), ADD COLUMN "cancellationSmsSentAt" TIMESTAMP(3);`
- All nullable → existing rows are untouched; no data migration. Applied through the decoupled migrate flow.
- **No `User` change.** Alternate phone is deliberately order-only; the profile's `phone` is the single registered mobile.

### 4.2 Auth label — copy only

Change the identifier label and its supporting strings from "Phone or email" to **"Email or Mobile Number"**, and reorder placeholders to lead with email so they match the new label:

| File | Change |
|------|--------|
| `app/(auth)/login/page.tsx:86` | `<Label>` text → "Email or Mobile Number"; placeholder → `you@email.com or 0771234567` |
| `app/(auth)/forgot-password/page.tsx:73` | same label + placeholder + helper copy |
| `app/_lib/auth.ts:47` | Credentials provider `label: "Email or Mobile Number"` (fallback UI only) |
| `app/_lib/validation.ts:27,48` | `LoginSchema`/`RequestResetSchema` message → "Email or mobile number required" |
| `app/(auth)/actions.ts:152,182,197` | error strings → "Invalid email/mobile or password" / "Enter your email or mobile number." |

No logic changes — `resolveIdentifier` already classifies the input. **E2E specs that assert the old label must be updated** (see §7).

### 4.3 Checkout — registered customers (pre-fill via server load)

`checkout/page.tsx` (server component, Node runtime) loads the customer's contact + default address and passes them down:

```ts
const dbUser = session?.user?.id
  ? await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, phone: true },
    })
  : null;

const defaultAddress = dbUser
  ? (await prisma.address.findFirst({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }], // default first, else most-recent
    }))
  : null;
```

`CheckoutClient`'s `user` prop widens from `{ name, email }` to `{ name, email, phone, address }` (address = `{ line1, line2, city } | null`). The client seeds state from it:

- `phone` state initialises to `user.phone ?? ""` — **editable; the edited value is what `processOrder` stores on `Order.customerPhone`** and where notifications go. It is **never** written back to `User.phone`.
- `address` state initialises `line1/line2/city` from `user.address` when present (country stays the fixed, disabled "Sri Lanka"; the Address book's 2-letter `country` code is not surfaced into the checkout country field).
- Email is display/derived server-side as today (registered email is taken from the session/DB in `processOrder`, not an editable input).

For guests (`user === null`) nothing pre-fills; behaviour is unchanged except §4.4.

### 4.4 Checkout — guest customers (email optional + helper text)

- **`GuestInfoSchema`** (`checkout/actions.ts:51`): `email` becomes optional — `z.string().trim().email("Enter a valid email").optional().or(z.literal(""))`. `name` stays required; `phone` becomes `LkMobileSchema` (§4.6).
- **`processOrder`** guest branch: `guestEmail = guestInfo.email && guestInfo.email.length > 0 ? guestInfo.email : null`; `customerEmail = guestEmail ?? ""`. A guest without an email still checks out; `customerEmail === ""` means email is skipped and SMS carries the notifications.
- **UI** (`checkout-client.tsx`): guest email input loses `required`, relabels to **"Email (optional)"**; the guest state already tolerates an empty email.
- **Helper text** under the mobile field (shown for everyone, most meaningful for guests): replace the current "For delivery contact." with
  > "Order confirmations and delivery updates will be sent to this mobile number."

### 4.5 Alternate Mobile Number (order-only, courier-only)

- **New optional field** in the Delivery Address card, below the primary phone: label "Alternate Mobile Number", helper "Optional — an extra number the courier can call for delivery." New `alternatePhone` state, `type="tel"`.
- **Validation:** `alternatePhone: LkPhoneSchema.optional()` in `ProcessOrderSchema` — permissive (a landline alternate is acceptable for a courier call). The client sends `alternatePhone: alt.trim() || undefined` so a blank field arrives as `undefined` (the same pattern `notes`/`line2` already use), keeping `LkPhoneSchema`'s `min(1)` from tripping on an empty string. (The *primary* number is mobile-only; the alternate is not the SMS target so it need not be.)
- **Persistence:** stored on `Order.alternatePhone`. Passed into `OrderDetails` (`alternatePhone?: string | null`, added to the type and to all three build sites) and, in `book-courier.ts`, mapped to the Curfox payload:
  `customer_secondary_phone: order.alternatePhone ? toLocalSriLankaPhone(order.alternatePhone) : null`.
- **Never** touches `User` or `Address`. Receives **no** notifications.

### 4.6 The notification (primary) phone must be SMS-capable

Because checkout now promises "we'll SMS this number", the **primary** contact number validates as **mobile**:

- `ProcessOrderSchema.contactPhone` and `GuestInfoSchema.phone`: `LkPhoneSchema` → **`LkMobileSchema`**. This canonicalises to `+947XXXXXXXX` and rejects landlines.
- **Side benefit:** `Order.customerPhone` is now stored in consistent E.164 form. Downstream is unaffected — `book-courier.ts:toLocalSriLankaPhone` already converts `+94…` → `0…`, and `sms.ts:sendSms` already strips the `+`.
- Client `pattern` on the primary phone input tightens to a mobile pattern (e.g. `^(?:\+?94|0)?7\d{8}$`) so the browser catches a landline before submit; the alternate input keeps the looser pattern.
- Existing orders keep their historical `customerPhone` strings; only new orders are canonical. No backfill.

### 4.7 Unified order-notification dispatcher

**New module `app/_lib/order-notifications.ts`** — the single place that owns "who is reached, on which channels, exactly once", for the three customer-facing events. Each function takes the already-built `OrderDetails` (which carries `orderId`, `customerEmail`, `customerPhone`, `webNumber`, …) and re-reads the per-order sent-flags to enforce idempotency independently per channel:

```ts
// Email + SMS, each guarded by its own flag; safe to call more than once.
export async function notifyOrderConfirmed(details: OrderDetails): Promise<void>;
export async function notifyOrderDispatched(details: OrderDetails, trackingCode: string): Promise<void>;
export async function notifyOrderCancelled(details: OrderDetails): Promise<void>;
```

Behaviour, per function:

1. **Email channel** — if `shouldEmailCustomer(details.customerEmail)` and the channel's email flag is unset, call the existing mailer function (`sendOrderConfirmationEmail` / `sendCustomerDispatchEmail` / `sendCustomerCancellationEmail`) and set the flag (`emailSent` / `customerDispatchEmailSentAt` / — cancellation email keeps its current unflagged, status-guarded behaviour). Preserves today's copy, BCC, and guards.
2. **SMS channel** — if `details.customerPhone` is non-empty, **atomically claim** the SMS flag and, only if the claim wins, send:
   ```ts
   const claim = await prisma.order.updateMany({
     where: { id: details.orderId, confirmationSmsSentAt: null },
     data: { confirmationSmsSentAt: new Date() },
   });
   if (claim.count === 1) {
     try { await sendOrderConfirmationSms(details); }
     catch (err) { // send failed — release the claim so a retry can re-send
       await prisma.order.update({ where: { id: details.orderId }, data: { confirmationSmsSentAt: null } }).catch(() => {});
       logSmsError("order-confirmation", { orderId: details.orderId, webNumber: details.webNumber }, err);
     }
   }
   ```
   The claim-before-send pattern mirrors the payment claim and makes the Koko double-callback safe for SMS too. On send failure the flag is released so the next legitimate trigger retries (matching the "delete the dangling challenge" instinct in the OTP code). **Neither channel throws** — a notification failure never breaks order creation, payment finalisation, or dispatch.
3. Add a small `logSmsError(context, meta, err)` helper (mirror of `logMailerError`) so SMS failures are structured in logs.

This centralises the recipient rules the requirements describe:
- **Registered:** `customerEmail = user.email` (email sent when present) **and** `customerPhone` (SMS always) → "email and/or SMS, depending on what's available."
- **Guest:** `customerPhone` (SMS always) **and** `customerEmail = guestEmail` (email only when the guest supplied one).

### 4.8 SMS templates (`app/_lib/sms.ts`)

Three new exported functions reusing the private `sendSms` core, kept short (target ≤1 segment / 160 GSM-7 chars) to cap cost. They take the `OrderDetails` fields they need; the order reference is `details.webNumber ?? orderReference(details)` and support contact reuses the mailer's `CONTACT_NUMBER` env:

```ts
export function sendOrderConfirmationSms(o): Promise<void>;
//  "Dressing Bear: order <ref> confirmed. Total Rs <total>. We'll text you when it ships."
export function sendOrderDispatchedSms(o, trackingCode): Promise<void>;
//  "Dressing Bear: order <ref> shipped via <carrier>. Track: <trackingCode>."
export function sendOrderCancelledSms(o): Promise<void>;
//  "Dressing Bear: order <ref> has been cancelled. Questions? Call <CONTACT_NUMBER>."
```

Exact copy finalised during implementation; all SMS route through the existing `__setTestSmsSender` seam so tests assert on payloads without hitting the network.

### 4.9 Wiring into the existing dispatch points

Replace direct customer-email calls with the dispatcher; internal/brand emails are left as-is.

| Event | Site | Change |
|-------|------|--------|
| Confirmation (COD) | `checkout/actions.ts:308–329` | Replace the `if (shouldEmailCustomer) { send; set emailSent }` block with `await notifyOrderConfirmed(orderDetailsForEmail)`. |
| Confirmation (prepaid) | `order-finalization.ts:77–84` | Replace the `if (!updated.emailSent) { send; set emailSent }` block with `await notifyOrderConfirmed(details)` — **after** the atomic `paymentStatus` claim (unchanged). |
| Dispatch | `book-courier.ts:250` (`trySendCustomerDispatchEmail`) | Replace with `await notifyOrderDispatched(order, waybillNumber)`. The brand dispatch email (`tryDispatchEmail` → `sendDispatchNotificationEmail`) is unchanged. |
| Dispatch (manual) | `admin/orders/actions.ts:330–339` (`dispatchManually`) | Replace the customer-dispatch email block with `await notifyOrderDispatched(toOrderDetails(order), parsed.data)`. |
| Cancellation | `admin/orders/actions.ts:274` (`trySendCancellationEmail`, called by `cancelOrder` + `bulkCancel`) | Route through `await notifyOrderCancelled(details)`. |
| Confirmation (admin resend) | `admin/orders/actions.ts:370` (`resendConfirmationEmail`) | **Unchanged** — stays an explicit, email-only admin override that bypasses idempotency; it does not send SMS (avoids surprise SMS cost on a manual click). Noted as deliberate. |

`OrderDetails` gains `alternatePhone?: string | null`, populated in the three build sites (`checkout/actions.ts`, `order-finalization.ts:paidDetails`, `admin/orders/actions.ts:toOrderDetails`) so §4.5's courier mapping has the value.

### 4.10 UI details

- **Checkout** (`checkout-client.tsx`): `CheckoutUser` type widens to include `phone` and `address`; state seeds from props (§4.3). New "Alternate Mobile Number" input (§4.5). Guest email optional + relabelled (§4.4). Primary-phone helper text updated (§4.4) and `pattern` tightened to mobile (§4.6). Keep existing brand tokens / shadcn components; add `data-testid`s on the alternate-phone input and the (now optional) guest email for E2E.
- **Auth pages**: label/placeholder copy only (§4.2).
- No new pages, no layout restructure.

## 5. File-level change summary

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | edit | Add `Order.alternatePhone`, `confirmationSmsSentAt`, `dispatchSmsSentAt`, `cancellationSmsSentAt` (all nullable) |
| `prisma/migrations/<ts>_order_contact_sms/…` | new | Hand-authored additive SQL for the four columns |
| `app/_lib/order-notifications.ts` | new | `notifyOrderConfirmed/Dispatched/Cancelled` — recipient rules + per-channel idempotency + fan-out |
| `app/_lib/sms.ts` | edit | Add `sendOrderConfirmationSms`, `sendOrderDispatchedSms`, `sendOrderCancelledSms` (reuse `sendSms`) |
| `app/_lib/mailer.ts` | edit | Add `alternatePhone?: string \| null` to `OrderDetails`; add `logSmsError` (or place in sms.ts) |
| `app/checkout/page.tsx` | edit | Load `User.phone` + default `Address`; pass widened `user` prop |
| `app/checkout/checkout-client.tsx` | edit | Seed phone/address from props; alternate-phone field; guest email optional; helper text; mobile pattern |
| `app/checkout/actions.ts` | edit | `GuestInfoSchema` email optional; `contactPhone`/guest `phone` → `LkMobileSchema`; `alternatePhone` in schema + persist; `OrderDetails.alternatePhone`; confirmation via `notifyOrderConfirmed` |
| `app/checkout/book-courier.ts` | edit | Map `alternatePhone` → `customer_secondary_phone`; dispatch via `notifyOrderDispatched` |
| `app/_lib/payments/order-finalization.ts` | edit | Prepaid confirmation via `notifyOrderConfirmed` (after the atomic claim); `paidDetails.alternatePhone` |
| `app/admin/orders/actions.ts` | edit | `dispatchManually` → `notifyOrderDispatched`; `trySendCancellationEmail` → `notifyOrderCancelled`; `toOrderDetails.alternatePhone` |
| `app/(auth)/login/page.tsx` | edit | Label + placeholder → "Email or Mobile Number" |
| `app/(auth)/forgot-password/page.tsx` | edit | Label + placeholder + helper copy |
| `app/_lib/auth.ts` | edit | Credentials provider label copy |
| `app/_lib/validation.ts` | edit | `LoginSchema`/`RequestResetSchema` message copy |
| `app/(auth)/actions.ts` | edit | Login/reset error-string copy |
| `app/_lib/__tests__/order-notifications.test.ts` | new | Recipient routing + idempotency (see §7) |
| `app/_lib/__tests__/order-sms.test.ts` | new | SMS template formatting via test seam |
| `app/checkout/__tests__/checkout-contact.test.ts` | new | Guest email optional; mobile-only primary; alternate persisted + to courier; no profile write |
| `tests/e2e/*.spec.ts` | edit | Update label + guest-email assertions (see §7) |

## 6. Environment variables

**None new.** Order SMS reuses the existing `NOTIFY_LK_USER_ID` / `NOTIFY_LK_API_KEY` / `NOTIFY_LK_SENDER_ID` (already required for auth OTP) and the existing `CONTACT_NUMBER` / `BRAND_NAME` used by the mailer. If Notify.lk is unconfigured, SMS sends throw and are caught/logged exactly like a failed OTP send — orders still succeed.

## 7. Testing strategy

Local gate = **`npm run test` (Vitest) + `tsc --noEmit`** (no local DB → no `next build`/`migrate dev`). SMS and email are mocked via `__setTestSmsSender` / `__setTestTransport`.

**Unit (Vitest):**
- **`order-notifications.test.ts`** — the core routing/idempotency matrix:
  - Registered **with** email → both `sendOrderConfirmationEmail` and `sendOrderConfirmationSms` fire.
  - Registered **without** email (phone-only) → **SMS only**, email skipped, order/flow succeeds (the gap this closes).
  - Guest **without** email → SMS only. Guest **with** email → both.
  - **Idempotency:** two `notifyOrderConfirmed` calls for the same order → SMS sent **once** (second claim `count === 0`); simulate the Koko double-callback.
  - **Send failure releases the flag** → a subsequent call re-sends; a thrown SMS never propagates.
- **`order-sms.test.ts`** — each template renders the order ref, total/tracking, stays within the length budget, and targets `customerPhone` (with `+` handling delegated to `sendSms`).
- **`checkout-contact.test.ts`** — `processOrder`: guest email omitted succeeds; landline primary rejected, mobile accepted and stored canonical; `alternatePhone` persisted to the order and **not** to `User`; alternate reaches the Curfox payload as `customer_secondary_phone`.

**E2E (Playwright) — update existing, add one:**
- Update label assertions `getByLabel("Phone or email")` → "Email or Mobile Number" in `tests/e2e/auth-state.spec.ts`, `payhere-purchase.spec.ts`, `payhere-order.spec.ts`, `order-confirmation.spec.ts`.
- Update any guest-checkout spec that fills a **required** email to treat it as optional.
- Add a registered-checkout spec asserting the mobile + address pre-fill and the alternate-phone field (SMS transport mocked).

## 8. Phasing (one `feat/*` branch; `tsc` + `npm run test` green at each step)

1. **Schema + notification core** — migration (four columns); `sms.ts` templates; `order-notifications.ts` dispatcher; `OrderDetails.alternatePhone`; `logSmsError`. Unit: `order-sms`, `order-notifications`. No user-visible change yet (dispatcher not wired).
2. **Wire notifications** — swap the five customer send-points (§4.9) to the dispatcher; add `alternatePhone` to the three `OrderDetails` builders and the courier payload. Regression: existing mailer tests still green; add the Koko-double-callback idempotency case.
3. **Checkout contact** — `page.tsx` pre-fill load; `checkout-client` phone/address seeding, alternate field, guest email optional, helper text, mobile validation. Unit: `checkout-contact`; E2E pre-fill spec.
4. **Auth copy** — label/placeholder/error-string edits; update E2E label assertions.

Phases 1–2 are notification infrastructure; 3–4 are the customer-facing surface. Each is independently reviewable.

## 9. Risks & mitigations

- **Duplicate SMS on payment-webhook retries** (Koko fires twice) → per-channel **atomic `updateMany` claim** on `confirmationSmsSentAt` before send; only `count === 1` sends. Idempotency test simulates the double callback.
- **Weakening the prepaid payment claim** → the SMS is added *after* the existing `paymentStatus` claim and never alters it; the confirmation dispatcher is called where `sendOrderConfirmationEmail` is today.
- **Notification failure breaking checkout** → dispatcher catches per channel, logs via `logSmsError`/`logMailerError`, returns void; order creation/payment/dispatch never depend on it (matches current email behaviour).
- **Promising SMS to an unreachable number** → primary phone tightened to `LkMobileSchema` (mobile-only) so the "we'll text you" copy is deliverable; landline alternates are courier-only and never texted.
- **Alternate phone leaking into the profile** → it is written only to `Order.alternatePhone`; no code path updates `User`/`Address`; unit test asserts the profile is untouched.
- **Pre-fill overriding a customer's intent** → pre-filled phone/address are editable initial state; the edited value is what persists on the order and never writes back to the profile.
- **Empty Address book** → `findFirst` returns null → address fields stay blank (today's behaviour); phone still pre-fills from `User.phone`.
- **SMS cost / unconfigured Notify.lk** → limited to three transactional events; admin "resend" stays email-only; missing Notify config throws→caught→logged, order unaffected.
- **E2E drift from the label change** → the four specs asserting the old label are updated in the same phase (§7).

## 10. Open / deferred decisions

- **Delivered-status SMS** → deferred (no delivered email today either); a natural follow-up once the dispatcher exists — add `notifyOrderDelivered` + a flag.
- **Per-channel opt-out / notification preferences** → out of scope; a future account-settings surface.
- **SMS for admin "resend confirmation"** → intentionally omitted; revisit if support wants a "re-text the customer" action.
- **Saving a checkout-entered phone/alternate back to the profile** (opt-in "save to my account") → deferred; the current rule is strictly order-scoped.
- **Canonicalising historical `Order.customerPhone`** → not needed; only new orders store E.164, and all consumers already normalise.

## 11. Acceptance criteria

The change is done when:

1. `Order` has `alternatePhone`, `confirmationSmsSentAt`, `dispatchSmsSentAt`, `cancellationSmsSentAt` (all nullable) via a hand-authored migration that applies through the decoupled flow; existing rows are untouched.
2. Login and forgot-password show **"Email or Mobile Number"**; the credentials label and error copy match; auth logic is unchanged and login still works with either identifier.
3. A **registered** customer's checkout pre-fills mobile, email, and default shipping address; editing the contact number affects **only that order** and never `User.phone`; an optional Alternate Mobile Number can be added.
4. A **guest** can check out with **mobile only** (no email); the mobile field shows the SMS helper text; the primary number is validated as a mobile.
5. The **Alternate Mobile Number** is stored on the order, forwarded to Curfox as `customer_secondary_phone`, receives no notifications, and never updates the profile or Address book.
6. **Order confirmation, dispatch, and cancellation** notify the customer on **every available channel**: SMS to the order's mobile always; email additionally whenever an email exists (registered `user.email` or guest-supplied). A **phone-only registered customer now receives SMS** where they previously got nothing.
7. SMS sends are **idempotent** — a repeated confirmation trigger (e.g. Koko's double callback) sends at most one SMS per event; a failed send releases its flag for retry; no notification failure ever breaks the order flow.
8. `npm run test` (including the new routing/idempotency/template/checkout tests) and `tsc --noEmit` pass; updated E2E specs reflect the new label and optional guest email.
