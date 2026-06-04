# Admin Settings Page — Design

**Date:** 2026-06-04
**Status:** Approved (design)
**Spec #:** 6 (admin series: Orders → Products → Customers → Settings)

## Goal

Build the admin Settings page at `/admin/settings` — currently the only sidebar
nav item that 404s. The first version makes **store info** and **delivery pricing**
editable (DB-backed), and surfaces **payment methods** and **system config** as
**read-only diagnostics**. Payment-method toggles are deliberately deferred to a
fast-follow because Koko + PayHere are live in production and an admin toggle would
sit directly on the live revenue path.

## Why

- The `/admin/settings` sidebar link exists but leads nowhere — the page is the
  obvious gap to close the admin series.
- Delivery prices and the free-delivery threshold are currently hardcoded constants
  in `app/_lib/checkout-config.ts`; changing them requires a code deploy.
- Store identity (name, support email/phone, address) is scattered across env.
- A read-only diagnostics view gives operators a single place to confirm provider
  state without SSH/env access — **without ever exposing secret values**.

## Scope (v1)

| Section            | Mode      | Backed by                                  |
|--------------------|-----------|--------------------------------------------|
| Store info         | Editable  | `StoreSettings` row                        |
| Delivery pricing   | Editable  | `StoreSettings` row                        |
| Payment methods    | Read-only | env-derived diagnostics (presence/mode)    |
| System diagnostics | Read-only | env-derived diagnostics (presence/mode)    |

**Out of scope (fast-follow):** editable payment toggles, courier config,
notification/email template settings.

## Hard Constraints

1. **No secrets in any read-only view.** Diagnostics show `enabled` /
   `mode` (test|live) / `configured` (boolean = required keys present) only —
   never key material, secrets, or merchant credentials. (Standing risk: the Koko
   prod signing key was exposed once before; a page that naively reflects
   `process.env` is exactly how that recurs.)
2. **Delivery price changes are forward-only.** Orders persist their delivery cost
   at checkout time, so there is no order history to recompute on a price change.
3. **Byte-identical at rollout.** The singleton row is seeded from the current
   `checkout-config` constants + env store info, so production behavior is
   unchanged the moment the migration lands and before any edit is made.
4. **Editable values must actually take effect at runtime** — a delivery price
   edit must flow into checkout totals and all customer-facing free-delivery copy.

## Architecture

### Persistence — singleton typed row

A single `StoreSettings` row holds the ~7 editable fields. A fixed id
(`"singleton"`) enforces one row; reads go through an upsert that lazily seeds
defaults on first access. A key-value table is rejected as over-engineering for a
fixed, typed field set.

```prisma
model StoreSettings {
  id                    String   @id @default("singleton") // one row, fixed id
  storeName             String
  supportEmail          String
  supportPhone          String
  businessAddress       String
  colomboDeliveryCost   Int
  otherDeliveryCost     Int
  freeDeliveryThreshold Int
  updatedAt             DateTime @updatedAt
}
```

### Accessor layer — `app/_lib/store-settings.ts`

- `DEFAULT_STORE_SETTINGS` — seed values: delivery numbers from
  `checkout-config` constants, store info from env (with safe fallbacks).
- `getStoreSettings()` — returns the row, lazily creating it from
  `DEFAULT_STORE_SETTINGS` if absent. Wrapped in React `cache()` for per-request
  dedup; the underlying read is tagged (`settings`) and revalidated on mutation so
  the extra root-layout read (see below) is cheap.
- `getDeliveryConfig()` — derives `{ colombo, other, freeThreshold }` from
  `getStoreSettings()`. This is the single value threaded to the UI and read by
  server callers.

### Delivery-pricing integration (the crux)

The three constants are imported by **4 client components**
(`cart-summary`, `free-shipping-progress`, `checkout-client`, `buy-box-client`)
and **3 server modules** (`announcement-bar` — a Server Component —
`checkout/actions.ts`, `admin-orders.ts`). The free-delivery threshold drives
marketing copy app-wide, not just checkout totals.

**Approach:** a client context provider for the client consumers; direct reads
for server consumers. No prop-drilling.

- `app/_components/delivery/delivery-config-provider.tsx` — a `"use client"`
  context holding `DeliveryConfig`, plus a `useDeliveryConfig()` hook.
- The **root layout** (server) calls `getDeliveryConfig()` once and renders the
  provider with that value. This adds one cached singleton read per request.
- The 4 client consumers swap their constant import for `useDeliveryConfig()`.
- The 3 server consumers (`announcement-bar`, `checkout/actions.ts`,
  `admin-orders.ts`) call `getDeliveryConfig()` directly — `announcement-bar`
  renders in the layout tree above/outside the provider, so it reads server-side
  rather than via the hook.
- `calculateDelivery` is refactored from reading module constants to
  `calculateDelivery(subtotal, zone, config)` — kept pure and unit-testable.
  `DEFAULT_DELIVERY_CONFIG` remains exported as the seed source and test default.

### Read-only diagnostics — `app/_lib/payments/diagnostics.ts`

- `getPaymentDiagnostics()` → array of
  `{ method, label, enabled, mode, configured }` for COD / PayHere / Koko /
  Mintpay. `enabled` reuses the existing `checkoutPaymentOptions()` / `envFlag`
  gating; `mode` from `*_MODE`; `configured` = required env keys present (boolean).
  **Returns no secret values.**
- `getSystemDiagnostics()` → `{ nodeEnv, appUrl, providers: [...] }` — non-secret
  environment summary. App URL is non-secret; everything else is presence/mode.

### Mutations — `app/admin/settings/actions.ts`

Both gated by `requireAdmin()`, Zod-validated, and revalidate the `settings` tag
(plus relevant paths) on success:

- `updateStoreInfo(formData)` — validates non-empty name, email format, phone,
  address; upserts the store-info columns.
- `updateDeliveryPricing(formData)` — validates positive integer costs and a
  non-negative threshold; upserts the delivery columns. Forward-only — does not
  touch existing orders.

### UI components — `app/_components/admin/settings/*`

- `store-info-form.tsx` — client form bound to `updateStoreInfo`.
- `delivery-pricing-form.tsx` — client form bound to `updateDeliveryPricing`.
- `payment-methods-table.tsx` — read-only table from `getPaymentDiagnostics()`.
- `system-diagnostics.tsx` — read-only panel from `getSystemDiagnostics()`.

The page (`app/admin/settings/page.tsx`) is a Server Component that fetches all
four data sources and renders the sections in order.

## Data Flow

```
Admin edits delivery price
  → updateDeliveryPricing (Server Action, requireAdmin, Zod)
  → upsert StoreSettings + revalidateTag("settings")
  → next request: root layout getDeliveryConfig() returns new values (cache busted)
  → DeliveryConfigProvider supplies them to the 4 client surfaces
  → announcement-bar + checkout/actions.ts + admin-orders.ts read getDeliveryConfig() server-side
  → calculateDelivery(subtotal, zone, config) computes the new total
```

## Error Handling

- Server Actions return typed `{ ok, error }` results; forms surface validation
  errors inline (mirrors the Customers/Products action pattern).
- `getStoreSettings()` upsert-on-read means a missing row is self-healing, never an
  error path.
- Diagnostics helpers are total functions — a missing/blank env var renders as
  `configured: false`, never throws and never leaks.

## Testing

- `app/_lib/__tests__/store-settings.test.ts` — seeding/defaults, `getDeliveryConfig`
  derivation (mocked Prisma).
- `app/_lib/__tests__/checkout-config.test.ts` — **updated** for the new
  `calculateDelivery(subtotal, zone, config)` signature.
- `app/_lib/payments/__tests__/diagnostics.test.ts` — presence/mode mapping and the
  **no-secrets** invariant (assert returned shape contains no key material).
- `app/admin/settings/__tests__/actions.test.ts` — `requireAdmin` gate, Zod
  validation, upsert + revalidate (mocked).
- `tests/e2e/admin-settings.spec.ts` — non-admin redirect; edit delivery price →
  cart/checkout total reflects it; payment table renders read-only with no secrets.

## File Manifest

### Create
- `app/_lib/store-settings.ts`
- `app/_lib/payments/diagnostics.ts`
- `app/_components/delivery/delivery-config-provider.tsx`
- `app/admin/settings/page.tsx`
- `app/admin/settings/actions.ts`
- `app/_components/admin/settings/store-info-form.tsx`
- `app/_components/admin/settings/delivery-pricing-form.tsx`
- `app/_components/admin/settings/payment-methods-table.tsx`
- `app/_components/admin/settings/system-diagnostics.tsx`
- `prisma/migrations/<timestamp>_add_store_settings/migration.sql` (generated)
- Tests listed above.

### Modify
- `prisma/schema.prisma` — add `StoreSettings`.
- `app/_lib/checkout-config.ts` — `calculateDelivery(…, config)` + `DEFAULT_DELIVERY_CONFIG`.
- Root layout (`app/layout.tsx`) — fetch `getDeliveryConfig()`, wrap in provider.
- `app/_components/cart/cart-summary.tsx` — use `useDeliveryConfig()`.
- `app/_components/cart/free-shipping-progress.tsx` — use `useDeliveryConfig()`.
- `app/checkout/checkout-client.tsx` — use `useDeliveryConfig()`.
- `app/_components/product/buy-box-client.tsx` — use `useDeliveryConfig()`.
- `app/_components/shared/announcement-bar.tsx` — Server Component; read `getDeliveryConfig()` directly.
- `app/checkout/actions.ts` — `getDeliveryConfig()` + new `calculateDelivery` signature.
- `app/_lib/admin-orders.ts` — `getDeliveryConfig()` + new `calculateDelivery` signature.

## Tech Stack

Next.js 16 App Router (React 19), NextAuth v5, Prisma 6 + PostgreSQL, Zod 4,
Vitest 4 (node env, `.ts`), Playwright e2e, shadcn/ui. Mirrors the shipped
Orders/Products/Customers admin patterns.
