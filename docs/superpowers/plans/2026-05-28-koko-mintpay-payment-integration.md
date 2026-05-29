# Koko Mintpay Payment Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add verified Koko and Mintpay online payments through a shared payment provider layer, while preserving the existing COD and PayHere checkout behavior.

**Architecture:** Create focused provider adapters under `app/_lib/payments/` and route all online payment initiation through a generic endpoint. Move reusable paid/failed order finalization into one helper so PayHere, Koko, and Mintpay share idempotent status updates, stock restoration, email, and courier behavior.

**Tech Stack:** Next.js 16 App Router route handlers, React 19, TypeScript, Prisma, Vitest, built-in Node `crypto`, existing mailer/courier helpers.

---

## Amendments (2026-05-29, after vendor-doc verification)

These supersede the original task text where they conflict. They were derived by checking the plan against the real vendor reference material under `tmp/koko/` and `tmp/minit/` (Koko API v1.05 PDF, Merchant Order View PDF, Koko PHP samples, Mintpay PHP plugin, Mintpay Postman collection).

- **A1 (Task 2 — Koko `orderViewUrl` follows mode):** The Koko v1.05 doc documents per-environment hosts (`devapi`/`qaapi`/`prodapi`) and states the examples merely use prod URLs. To avoid creating QA orders on `qaapi` but polling status on `prodapi` (which would break sandbox finalization), `getKokoConfig().orderViewUrl` must follow `KOKO_MODE`: `live → https://prodapi.paykoko.com/api/merchants/orderView`, otherwise `https://qaapi.paykoko.com/api/merchants/orderView`. The config test is updated to assert the QA orderView host in test mode. (If sandbox proves orderView is genuinely prod-only even for QA orders, this is a one-line revert — confirmed at the Task 8 sandbox gate.)
- **A2 (Task 4 — atomic paid-claim):** Koko fires BOTH a server-to-server `response` and a browser `return`, each calling `finalizePaidPayment`. The `paymentStatus === "PAID"` check-then-act guard is racy under concurrency; email is guarded by `emailSent` but courier booking is not, risking a double courier booking. `finalizePaidPayment` must claim the order atomically — `prisma.order.updateMany({ where: { id, paymentStatus: { not: "PAID" } }, data: { paymentStatus: "PAID" } })` — and proceed with email/courier side effects only when `count === 1`. The Task 4 test is updated to assert the atomic claim instead of a plain `update`. Mirror the same guard on the failed path for symmetry (secondary).
- **A3 (Task 6 — Koko response-signature, defense-in-depth):** Keep the orderView-pull approach (status is fetched server-to-server via a merchant-authenticated, RSA-signed request — the trust anchor is TLS + our signed request, exactly like the Mintpay create call). The Koko `_responseUrl` POST and the orderView response also carry a `signature` over `orderId+trnId+status` validated with `KOKO_PUBLIC_KEY` (RSA-SHA256, per the v1.05 `RsaVerify.verify` sample). Verify that signature WHEN it and the public key are present, log a warning on mismatch, but still finalize off the orderView `status`. Do NOT make this fail-closed: the response-signature primitive is described only in prose (no code sample), so a wrong guess would hard-fail 100% of Koko payments. Scheme confirmation is a Task 8 sandbox item.

**Vendor-format confirmations (no change needed, recorded so reviewers don't re-litigate):** Koko `dataString` order matches the v1.05 Java sample and `phpqa.php` exactly. Mintpay payload field names, `Token` auth, `total_price` as string, `unit_price` as the per-unit price (string), and `sku` = product size all match the Mintpay Postman collection. Mintpay success/fail HMAC = `base64(hex hmac_sha256(...))` matches the PHP plugin.

---

## File Structure

- Create `app/_lib/payments/types.ts`: shared payment method types, provider interface, order shape, and response types.
- Create `app/_lib/payments/config.ts`: env readers, test/live URL selection, enabled flags, and customer-safe config error detection.
- Create `app/_lib/payments/registry.ts`: provider registry and checkout-visible method metadata.
- Create `app/_lib/payments/payhere.ts`: existing PayHere checkout/hash/webhook helpers behind the shared interface.
- Create `app/_lib/payments/koko.ts`: Koko form fields, RSA SHA256 signing, order-view status verification.
- Create `app/_lib/payments/mintpay.ts`: Mintpay create-order API payload, redirect form result, HMAC return verification.
- Create `app/_lib/payments/order-finalization.ts`: shared success/failure finalization, email, courier, stock restoration.
- Create `app/api/payments/initiate/route.ts`: generic online payment initiate route.
- Create `app/api/payments/koko/return/route.ts`: Koko customer return route, verifies status through Koko order-view.
- Create `app/api/payments/koko/response/route.ts`: Koko response route, verifies status through Koko order-view.
- Create `app/api/payments/mintpay/return/route.ts`: Mintpay success/fail return route with HMAC verification.
- Modify `app/api/payhere/payment/route.ts`: keep compatibility route as wrapper around generic provider initiation.
- Modify `app/api/payhere/webhook/route.ts`: reuse shared PayHere verification and finalization.
- Modify `app/checkout/actions.ts`: rename `MINITPAY` to `MINTPAY`.
- Modify: `app/checkout/page.tsx`: pass server-derived payment options into the checkout client.
- Modify `app/checkout/checkout-client.tsx`: provider-generic initiation, retry, overlay, and payment options.
- Modify `app/checkout/payhere-client.ts`: rename to generic helper or keep file exporting generic form submission helpers.
- Modify `app/_lib/order-status.ts`: add `PAYMENT_FAILED` label and cancelled/failed checkout state.
- Modify `app/checkout/success/page.tsx`: show failed/cancelled state for `PAYMENT_FAILED`.
- Modify `app/checkout/success/payment-status-poll.tsx`: stop polling on `PAYMENT_FAILED`.
- Modify `.env.local.example`: add Koko and Mintpay variable names only.
- Test files live beside implementation under `app/_lib/payments/__tests__/` and existing route/action test folders.

---

### Task 1: Normalize Payment Method And Status Types

**Files:**
- Modify: `app/_lib/order-status.ts`
- Modify: `app/checkout/actions.ts`
- Modify: `app/checkout/checkout-client.tsx`
- Modify: `app/api/payhere/webhook/route.ts`
- Modify: `app/checkout/__tests__/actions.test.ts`

- [ ] **Step 1: Write failing tests for `MINTPAY` and `PAYMENT_FAILED`**

Add/update these expectations in `app/checkout/__tests__/actions.test.ts`:

```ts
it.each(["PAYHERE", "KOKO", "MINTPAY"] as const)(
  "%s: persists PENDING paymentStatus and a WEB-prefixed webNumber",
  async (paymentMethod) => {
    await processOrder({ ...baseInput, paymentMethod });
    expect(txOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: "PENDING",
          webNumber: expect.stringMatching(/^WEB\d{4,}$/),
        }),
      }),
    );
  },
);
```

Add a new test file `app/_lib/__tests__/order-status-payment-failed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkoutPaymentState, paymentStatusLabel } from "../order-status";

describe("PAYMENT_FAILED status", () => {
  it("labels failed online payments", () => {
    expect(paymentStatusLabel("PAYMENT_FAILED")).toBe("Payment failed");
  });

  it("treats PAYMENT_FAILED as cancelled on checkout success page", () => {
    expect(
      checkoutPaymentState({
        paymentMethod: "MINTPAY",
        paymentStatus: "PAYMENT_FAILED",
      }),
    ).toEqual({ isPaid: false, isCod: false, isCancelled: true });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- app/checkout/__tests__/actions.test.ts app/_lib/__tests__/order-status-payment-failed.test.ts
```

Expected: fails because `MINTPAY` is not accepted and `PAYMENT_FAILED` is not labeled.

- [ ] **Step 3: Replace `MINITPAY` with `MINTPAY` and add failed status**

In `app/_lib/order-status.ts`, update:

```ts
export const PAYMENT_STATUSES = [
  "PENDING",
  "PAID",
  "PAYMENT_FAILED",
  "COD_PENDING",
  "COD_COLLECTED",
] as const;
```

Add cases:

```ts
case "PAYMENT_FAILED":
  return "Payment failed";
```

Update `checkoutPaymentState`:

```ts
const isCancelled =
  !isPaid &&
  !isCod &&
  (args.urlStatus === "cancelled" || args.paymentStatus === "PAYMENT_FAILED");
```

In `app/checkout/actions.ts`, change:

```ts
export type PaymentMethod = "COD" | "PAYHERE" | "KOKO" | "MINTPAY";
```

Update display map and Zod enum:

```ts
const PAYMENT_METHOD_DISPLAY: Record<PaymentMethod, string> = {
  COD: "Cash on Delivery",
  PAYHERE: "PayHere",
  KOKO: "Koko",
  MINTPAY: "Mintpay",
};

paymentMethod: z.enum(["COD", "PAYHERE", "KOKO", "MINTPAY"]),
```

In `app/checkout/checkout-client.tsx`, update the local type and payment option:

```ts
type PaymentMethod = "COD" | "PAYHERE" | "KOKO" | "MINTPAY";
{ id: "MINTPAY", name: "Mintpay", description: "Pay with Mintpay", icon: "📱" },
```

In `app/api/payhere/webhook/route.ts`, update casts:

```ts
paymentMethod: updated.paymentMethod as "COD" | "PAYHERE" | "KOKO" | "MINTPAY",
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
npm run test -- app/checkout/__tests__/actions.test.ts app/_lib/__tests__/order-status-payment-failed.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/order-status.ts app/_lib/__tests__/order-status-payment-failed.test.ts app/checkout/actions.ts app/checkout/checkout-client.tsx app/api/payhere/webhook/route.ts app/checkout/__tests__/actions.test.ts
git commit -m "refactor(payments): normalize mintpay method and failed status"
```

---

### Task 2: Add Shared Payment Types, Config, And Registry

**Files:**
- Create: `app/_lib/payments/types.ts`
- Create: `app/_lib/payments/config.ts`
- Create: `app/_lib/payments/registry.ts`
- Create: `app/_lib/payments/__tests__/config.test.ts`
- Create: `app/_lib/payments/__tests__/registry.test.ts`

- [ ] **Step 1: Write failing config tests**

Create `app/_lib/payments/__tests__/config.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import {
  getKokoConfig,
  getMintpayConfig,
  isPaymentConfigError,
} from "../config";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("payment provider config", () => {
  it("defaults Koko to QA mode URLs", () => {
    process.env.KOKO_MERCHANT_ID = "merchant";
    process.env.KOKO_API_KEY = "api-key";
    process.env.KOKO_PRIVATE_KEY = "private-key";

    expect(getKokoConfig()).toMatchObject({
      mode: "test",
      orderCreateUrl: "https://qaapi.paykoko.com/api/merchants/orderCreate",
      orderViewUrl: "https://qaapi.paykoko.com/api/merchants/orderView",
      pluginName: "customapi",
      pluginVersion: "1",
    });
  });

  it("selects Koko live order-create and order-view URLs", () => {
    process.env.KOKO_MODE = "live";
    process.env.KOKO_MERCHANT_ID = "merchant";
    process.env.KOKO_API_KEY = "api-key";
    process.env.KOKO_PRIVATE_KEY = "private-key";

    expect(getKokoConfig().orderCreateUrl).toBe(
      "https://prodapi.paykoko.com/api/merchants/orderCreate",
    );
    expect(getKokoConfig().orderViewUrl).toBe(
      "https://prodapi.paykoko.com/api/merchants/orderView",
    );
  });

  it("defaults Mintpay to dev URLs", () => {
    process.env.MINTPAY_MERCHANT_ID = "mp0001";
    process.env.MINTPAY_MERCHANT_SECRET = "secret";

    expect(getMintpayConfig()).toMatchObject({
      mode: "test",
      apiUrl: "https://dev.mintpay.lk/user-order/api/",
      loginUrl: "https://dev.mintpay.lk/user-order/login/",
    });
  });

  it("selects Mintpay live URLs", () => {
    process.env.MINTPAY_MODE = "live";
    process.env.MINTPAY_MERCHANT_ID = "mp0001";
    process.env.MINTPAY_MERCHANT_SECRET = "secret";

    expect(getMintpayConfig()).toMatchObject({
      apiUrl: "https://app.mintpay.lk/user-order/api/",
      loginUrl: "https://app.mintpay.lk/user-order/login/",
    });
  });

  it("identifies safe config errors", () => {
    expect(isPaymentConfigError(new Error("KOKO_PRIVATE_KEY must be set"))).toBe(true);
    expect(isPaymentConfigError(new Error("database down"))).toBe(false);
  });
});
```

- [ ] **Step 2: Write failing registry tests**

Create `app/_lib/payments/__tests__/registry.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { checkoutPaymentOptions, isOnlinePaymentMethod } from "../registry";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("payment registry", () => {
  it("knows online payment methods", () => {
    expect(isOnlinePaymentMethod("PAYHERE")).toBe(true);
    expect(isOnlinePaymentMethod("KOKO")).toBe(true);
    expect(isOnlinePaymentMethod("MINTPAY")).toBe(true);
    expect(isOnlinePaymentMethod("COD")).toBe(false);
  });

  it("hides Koko and Mintpay until enabled", () => {
    delete process.env.KOKO_ENABLED;
    delete process.env.MINTPAY_ENABLED;

    expect(checkoutPaymentOptions().map((o) => o.id)).toEqual(["COD", "PAYHERE"]);
  });

  it("shows Koko and Mintpay when enabled", () => {
    process.env.KOKO_ENABLED = "true";
    process.env.MINTPAY_ENABLED = "true";

    expect(checkoutPaymentOptions().map((o) => o.id)).toEqual([
      "COD",
      "PAYHERE",
      "KOKO",
      "MINTPAY",
    ]);
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm run test -- app/_lib/payments/__tests__/config.test.ts app/_lib/payments/__tests__/registry.test.ts
```

Expected: fails because payment modules do not exist.

- [ ] **Step 4: Implement shared types**

Create `app/_lib/payments/types.ts`:

```ts
export type OnlinePaymentMethod = "PAYHERE" | "KOKO" | "MINTPAY";
export type PaymentMethod = "COD" | OnlinePaymentMethod;

export type CheckoutPaymentOption = {
  id: PaymentMethod;
  name: string;
  description: string;
  icon: string;
};

export type PaymentInitResult = {
  provider: OnlinePaymentMethod;
  displayName: string;
  gatewayUrl: string;
  fields: Record<string, string>;
};

export type PaymentOrderItem = {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  size?: string | null;
};

export type PaymentOrder = {
  id: string;
  webNumber: string | null;
  total: number;
  subtotal: number;
  shippingCost: number;
  paymentMethod: string;
  paymentStatus: string | null;
  paymentMethodDisplay: string | null;
  customerPhone: string;
  guestName: string | null;
  guestEmail: string | null;
  shippingLine1: string;
  shippingLine2: string | null;
  shippingCity: string;
  shippingCountry: string;
  user: { name: string | null; email: string | null } | null;
  items: PaymentOrderItem[];
};

export type PaymentProvider = {
  method: OnlinePaymentMethod;
  displayName: string;
  initiate(order: PaymentOrder, baseUrl: string): Promise<PaymentInitResult>;
};
```

- [ ] **Step 5: Implement config**

Create `app/_lib/payments/config.ts`:

```ts
export type ProviderMode = "test" | "live";

function providerMode(value: string | undefined): ProviderMode {
  return value === "live" ? "live" : "test";
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

export function envFlag(name: string): boolean {
  return process.env[name] === "true";
}

export function isPaymentConfigError(error: unknown): boolean {
  return error instanceof Error && /^(KOKO|MINTPAY|PAYHERE)_/.test(error.message);
}

export function getKokoConfig() {
  const mode = providerMode(process.env.KOKO_MODE);
  return {
    mode,
    merchantId: requiredEnv("KOKO_MERCHANT_ID"),
    apiKey: requiredEnv("KOKO_API_KEY"),
    privateKey: requiredEnv("KOKO_PRIVATE_KEY").replace(/\\n/g, "\n"),
    pluginName: process.env.KOKO_PLUGIN_NAME || "customapi",
    pluginVersion: process.env.KOKO_PLUGIN_VERSION || "1",
    orderCreateUrl:
      mode === "live"
        ? "https://prodapi.paykoko.com/api/merchants/orderCreate"
        : "https://qaapi.paykoko.com/api/merchants/orderCreate",
    orderViewUrl:
      mode === "live"
        ? "https://prodapi.paykoko.com/api/merchants/orderView"
        : "https://qaapi.paykoko.com/api/merchants/orderView",
  };
}

export function getMintpayConfig() {
  const mode = providerMode(process.env.MINTPAY_MODE);
  return {
    mode,
    merchantId: requiredEnv("MINTPAY_MERCHANT_ID"),
    merchantSecret: requiredEnv("MINTPAY_MERCHANT_SECRET"),
    apiUrl:
      mode === "live"
        ? "https://app.mintpay.lk/user-order/api/"
        : "https://dev.mintpay.lk/user-order/api/",
    loginUrl:
      mode === "live"
        ? "https://app.mintpay.lk/user-order/login/"
        : "https://dev.mintpay.lk/user-order/login/",
  };
}
```

- [ ] **Step 6: Implement registry skeleton**

Create `app/_lib/payments/registry.ts`:

```ts
import { envFlag } from "./config";
import type { CheckoutPaymentOption, OnlinePaymentMethod, PaymentMethod } from "./types";

export const ONLINE_PAYMENT_METHODS = ["PAYHERE", "KOKO", "MINTPAY"] as const;

export function isOnlinePaymentMethod(value: string): value is OnlinePaymentMethod {
  return (ONLINE_PAYMENT_METHODS as readonly string[]).includes(value);
}

export function checkoutPaymentOptions(): CheckoutPaymentOption[] {
  const options: CheckoutPaymentOption[] = [
    { id: "COD", name: "Cash on Delivery", description: "Pay when you receive your order", icon: "💵" },
    { id: "PAYHERE", name: "PayHere", description: "Pay via PayHere gateway", icon: "💳" },
  ];

  if (envFlag("KOKO_ENABLED")) {
    options.push({ id: "KOKO", name: "Koko", description: "Pay in 3 with Koko", icon: "🐘" });
  }
  if (envFlag("MINTPAY_ENABLED")) {
    options.push({ id: "MINTPAY", name: "Mintpay", description: "Pay with Mintpay", icon: "📱" });
  }

  return options;
}

export function assertPaymentMethod(value: string): asserts value is PaymentMethod {
  if (value !== "COD" && !isOnlinePaymentMethod(value)) {
    throw new Error(`Unsupported payment method: ${value}`);
  }
}
```

- [ ] **Step 7: Run tests and commit**

Run:

```bash
npm run test -- app/_lib/payments/__tests__/config.test.ts app/_lib/payments/__tests__/registry.test.ts
```

Expected: pass.

Commit:

```bash
git add app/_lib/payments
git commit -m "feat(payments): add provider config and registry"
```

---

### Task 3: Implement Provider Initiation Adapters

**Files:**
- Create: `app/_lib/payments/payhere.ts`
- Create: `app/_lib/payments/koko.ts`
- Create: `app/_lib/payments/mintpay.ts`
- Modify: `app/_lib/payments/registry.ts`
- Create: `app/_lib/payments/__tests__/provider-init.test.ts`

- [ ] **Step 1: Write failing provider initiation tests**

Create `app/_lib/payments/__tests__/provider-init.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, verify } from "crypto";
import type { PaymentOrder } from "../types";

const { payHereCheckoutHash, mintpayFetch } = vi.hoisted(() => ({
  payHereCheckoutHash: vi.fn(() => "PAYHERE_HASH"),
  mintpayFetch: vi.fn(),
}));

vi.mock("@/app/_lib/payhere-config", () => ({
  payHereMerchantId: () => "256312",
  payHereCheckoutUrl: () => "https://sandbox.payhere.lk/pay/checkout",
  payHereCheckoutHash,
}));

const ORDER: PaymentOrder = {
  id: "ORD-123",
  webNumber: "WEB1001",
  total: 2440,
  subtotal: 2090,
  shippingCost: 350,
  paymentMethod: "PAYHERE",
  paymentStatus: "PENDING",
  paymentMethodDisplay: "PayHere",
  customerPhone: "0771234567",
  guestName: "Jane Buyer",
  guestEmail: "jane@example.com",
  shippingLine1: "1 Main Street",
  shippingLine2: null,
  shippingCity: "Colombo",
  shippingCountry: "Sri Lanka",
  user: null,
  items: [{ productId: "P1", name: "Oversize Tee", quantity: 2, price: 1045, size: "M" }],
};

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.APP_URL = "https://shop.example.com";
});

describe("provider initiation", () => {
  it("creates PayHere form fields from the stored order", async () => {
    const { payHereProvider } = await import("../payhere");
    const result = await payHereProvider.initiate(ORDER, "https://shop.example.com");

    expect(result).toMatchObject({
      provider: "PAYHERE",
      displayName: "PayHere",
      gatewayUrl: "https://sandbox.payhere.lk/pay/checkout",
      fields: {
        merchant_id: "256312",
        order_id: "ORD-123",
        amount: "2440.00",
        currency: "LKR",
        hash: "PAYHERE_HASH",
        return_url: "https://shop.example.com/checkout/success",
        cancel_url: "https://shop.example.com/checkout/success?status=cancelled",
        notify_url: "https://shop.example.com/api/payhere/webhook",
      },
    });
  });

  it("creates Koko fields and a verifiable RSA SHA256 signature", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
    process.env.KOKO_MERCHANT_ID = "merchant-1";
    process.env.KOKO_API_KEY = "api-key-1";
    process.env.KOKO_PRIVATE_KEY = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    process.env.KOKO_PLUGIN_NAME = "customapi";
    process.env.KOKO_PLUGIN_VERSION = "1";

    const { kokoProvider } = await import("../koko");
    const result = await kokoProvider.initiate({ ...ORDER, paymentMethod: "KOKO" }, "https://shop.example.com");

    const data = result.fields.dataString;
    const signatureBytes = Buffer.from(result.fields.signature, "base64");
    expect(result.gatewayUrl).toBe("https://qaapi.paykoko.com/api/merchants/orderCreate");
    expect(result.fields._orderId).toBe("ORD-123");
    expect(result.fields._responseUrl).toBe("https://shop.example.com/api/payments/koko/response");
    expect(result.fields._returnUrl).toBe("https://shop.example.com/api/payments/koko/return?order_id=ORD-123");
    expect(
      verify("RSA-SHA256", Buffer.from(data), publicKey, signatureBytes),
    ).toBe(true);
  });

  it("creates Mintpay purchase and returns purchase_id form fields", async () => {
    process.env.MINTPAY_MERCHANT_ID = "mp0001";
    process.env.MINTPAY_MERCHANT_SECRET = "secret";
    mintpayFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Success", data: "PURCHASE-1" }),
      text: async () => JSON.stringify({ message: "Success", data: "PURCHASE-1" }),
    });
    vi.stubGlobal("fetch", mintpayFetch);

    const { mintpayProvider } = await import("../mintpay");
    const result = await mintpayProvider.initiate({ ...ORDER, paymentMethod: "MINTPAY" }, "https://shop.example.com");

    expect(result).toMatchObject({
      provider: "MINTPAY",
      gatewayUrl: "https://dev.mintpay.lk/user-order/login/",
      fields: { purchase_id: "PURCHASE-1" },
    });
    expect(mintpayFetch).toHaveBeenCalledWith(
      "https://dev.mintpay.lk/user-order/api/",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Token secret",
          "Content-Type": "application/json",
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- app/_lib/payments/__tests__/provider-init.test.ts
```

Expected: fails because provider files do not exist.

- [ ] **Step 3: Implement PayHere adapter**

Create `app/_lib/payments/payhere.ts`:

```ts
import { payHereCheckoutHash, payHereCheckoutUrl, payHereMerchantId } from "@/app/_lib/payhere-config";
import type { PaymentOrder, PaymentProvider } from "./types";

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function customer(order: PaymentOrder) {
  const name = order.guestName ?? order.user?.name;
  const email = order.guestEmail ?? order.user?.email;
  if (!name || !email) throw new Error("Order is missing customer name or email");
  return { name, email };
}

export const payHereProvider: PaymentProvider = {
  method: "PAYHERE",
  displayName: "PayHere",
  async initiate(order, baseUrl) {
    const merchantId = payHereMerchantId();
    const amount = Number(order.total.toFixed(2));
    const buyer = customer(order);
    const { first_name, last_name } = splitName(buyer.name);
    const items =
      order.items.length > 0
        ? order.items.map((it) => `${it.name} x${it.quantity}`).join(", ")
        : "Dressing Bear Order";

    return {
      provider: "PAYHERE",
      displayName: "PayHere",
      gatewayUrl: payHereCheckoutUrl(),
      fields: {
        merchant_id: merchantId,
        return_url: `${baseUrl}/checkout/success`,
        cancel_url: `${baseUrl}/checkout/success?status=cancelled`,
        notify_url: `${baseUrl}/api/payhere/webhook`,
        first_name,
        last_name,
        email: buyer.email,
        phone: order.customerPhone,
        address: `${order.shippingLine1}${order.shippingLine2 ? ", " + order.shippingLine2 : ""}`,
        city: order.shippingCity,
        country: order.shippingCountry,
        order_id: order.id,
        items,
        currency: "LKR",
        amount: amount.toFixed(2),
        hash: payHereCheckoutHash(merchantId, order.id, amount, "LKR"),
      },
    };
  },
};
```

- [ ] **Step 4: Implement Koko adapter**

Create `app/_lib/payments/koko.ts`:

```ts
import { createPrivateKey, sign } from "crypto";
import { getKokoConfig } from "./config";
import type { PaymentOrder, PaymentProvider } from "./types";

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function customer(order: PaymentOrder) {
  const name = order.guestName ?? order.user?.name;
  const email = order.guestEmail ?? order.user?.email;
  if (!name || !email) throw new Error("Order is missing customer name or email");
  return { name, email };
}

export function signKokoDataString(dataString: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  return sign("RSA-SHA256", Buffer.from(dataString), key).toString("base64");
}

export const kokoProvider: PaymentProvider = {
  method: "KOKO",
  displayName: "Koko",
  async initiate(order, baseUrl) {
    const cfg = getKokoConfig();
    const buyer = customer(order);
    const { firstName, lastName } = splitName(buyer.name);
    const amount = order.total.toFixed(2);
    const description =
      order.items.length > 0
        ? order.items.map((it) => `${it.name} x${it.quantity}`).join(", ")
        : "Dressing Bear Order";
    const reference = order.webNumber ?? order.id;
    const returnUrl = `${baseUrl}/api/payments/koko/return?order_id=${encodeURIComponent(order.id)}`;
    const cancelUrl = `${baseUrl}/api/payments/koko/return?order_id=${encodeURIComponent(order.id)}&status=cancelled`;
    const responseUrl = `${baseUrl}/api/payments/koko/response`;
    const dataString =
      cfg.merchantId +
      amount +
      "LKR" +
      cfg.pluginName +
      cfg.pluginVersion +
      returnUrl +
      cancelUrl +
      order.id +
      reference +
      firstName +
      lastName +
      buyer.email +
      description +
      cfg.apiKey +
      responseUrl;

    return {
      provider: "KOKO",
      displayName: "Koko",
      gatewayUrl: cfg.orderCreateUrl,
      fields: {
        _mId: cfg.merchantId,
        api_key: cfg.apiKey,
        _returnUrl: returnUrl,
        _responseUrl: responseUrl,
        _currency: "LKR",
        _amount: amount,
        _reference: reference,
        _pluginName: cfg.pluginName,
        _pluginVersion: cfg.pluginVersion,
        _cancelUrl: cancelUrl,
        _orderId: order.id,
        _firstName: firstName,
        _lastName: lastName,
        _email: buyer.email,
        _description: description,
        dataString,
        signature: signKokoDataString(dataString, cfg.privateKey),
        _mobileNo: order.customerPhone,
      },
    };
  },
};
```

- [ ] **Step 5: Implement Mintpay adapter**

Create `app/_lib/payments/mintpay.ts`:

```ts
import { createHmac } from "crypto";
import { getMintpayConfig } from "./config";
import type { PaymentOrder, PaymentProvider } from "./types";

export function mintpaySuccessHash(merchantId: string, amount: number, orderId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${merchantId}${amount.toFixed(2)}${orderId}`)
    .digest("hex");
}

export function mintpayFailHash(orderId: string, secret: string): string {
  return createHmac("sha256", secret).update(orderId).digest("hex");
}

function customer(order: PaymentOrder) {
  const email = order.guestEmail ?? order.user?.email;
  if (!email) throw new Error("Order is missing customer email");
  return { email };
}

export const mintpayProvider: PaymentProvider = {
  method: "MINTPAY",
  displayName: "Mintpay",
  async initiate(order, baseUrl) {
    const cfg = getMintpayConfig();
    const buyer = customer(order);
    const successHash = Buffer.from(
      mintpaySuccessHash(cfg.merchantId, order.total, order.id, cfg.merchantSecret),
    ).toString("base64");
    const failHash = Buffer.from(mintpayFailHash(order.id, cfg.merchantSecret)).toString("base64");
    const successUrl = `${baseUrl}/api/payments/mintpay/return?orderId=${encodeURIComponent(order.id)}&amount=${encodeURIComponent(order.total.toFixed(2))}&hash=${encodeURIComponent(successHash)}&result=success`;
    const failUrl = `${baseUrl}/api/payments/mintpay/return?orderId=${encodeURIComponent(order.id)}&hash=${encodeURIComponent(failHash)}&result=failed`;
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    const payload = {
      merchant_id: cfg.merchantId,
      order_id: order.id,
      total_price: order.total.toFixed(2),
      discount: "0",
      customer_email: buyer.email,
      customer_id: order.user?.email ?? order.guestEmail ?? "guest",
      delivery_street: `${order.shippingLine1}${order.shippingLine2 ? ", " + order.shippingLine2 : ""}`,
      customer_telephone: order.customerPhone,
      ip: "0.0.0.0",
      x_forwarded_for: "0.0.0.0",
      delivery_region: order.shippingCity,
      delivery_postcode: "",
      cart_created_date: now,
      cart_updated_date: now,
      products: order.items.map((item) => ({
        name: item.name,
        product_id: item.productId,
        sku: item.size ?? item.productId,
        quantity: String(item.quantity),
        unit_price: item.price.toFixed(2),
        discount: "0.00",
        created_date: now,
        updated_date: now,
      })),
      success_url: successUrl,
      fail_url: failUrl,
    };

    const response = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Token ${cfg.merchantSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as { message?: string; data?: string };
    if (!response.ok || body.message !== "Success" || !body.data) {
      throw new Error("Mintpay order creation failed");
    }

    return {
      provider: "MINTPAY",
      displayName: "Mintpay",
      gatewayUrl: cfg.loginUrl,
      fields: { purchase_id: body.data },
    };
  },
};
```

- [ ] **Step 6: Register providers**

Append to `app/_lib/payments/registry.ts`:

```ts
import { kokoProvider } from "./koko";
import { mintpayProvider } from "./mintpay";
import { payHereProvider } from "./payhere";
import type { PaymentProvider } from "./types";

const PROVIDERS: Record<OnlinePaymentMethod, PaymentProvider> = {
  PAYHERE: payHereProvider,
  KOKO: kokoProvider,
  MINTPAY: mintpayProvider,
};

export function getPaymentProvider(method: OnlinePaymentMethod): PaymentProvider {
  return PROVIDERS[method];
}
```

- [ ] **Step 7: Run tests and commit**

Run:

```bash
npm run test -- app/_lib/payments/__tests__/provider-init.test.ts
```

Expected: pass.

Commit:

```bash
git add app/_lib/payments
git commit -m "feat(payments): add provider initiation adapters"
```

---

### Task 4: Add Shared Order Finalization

**Files:**
- Create: `app/_lib/payments/order-finalization.ts`
- Create: `app/_lib/payments/__tests__/order-finalization.test.ts`

- [ ] **Step 1: Write failing finalization tests**

Create `app/_lib/payments/__tests__/order-finalization.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  orderFindUnique,
  orderUpdate,
  orderUpdateMany,
  productUpdate,
  orderItemFindMany,
  sendOrderConfirmationEmail,
  bookCourierAndNotify,
} = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderUpdateMany: vi.fn(),
  productUpdate: vi.fn(),
  orderItemFindMany: vi.fn(),
  sendOrderConfirmationEmail: vi.fn(),
  bookCourierAndNotify: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: { findUnique: orderFindUnique, update: orderUpdate, updateMany: orderUpdateMany },
    orderItem: { findMany: orderItemFindMany },
    product: { update: productUpdate },
    $transaction: vi.fn(async (fn) =>
      fn({
        order: { findUnique: orderFindUnique, update: orderUpdate, updateMany: orderUpdateMany },
        product: { update: productUpdate },
      }),
    ),
  },
}));

vi.mock("@/app/_lib/mailer", () => ({
  sendOrderConfirmationEmail,
  sendAdminFailureAlertEmail: vi.fn(),
  logMailerError: vi.fn(),
}));

vi.mock("@/app/checkout/book-courier", () => ({ bookCourierAndNotify }));

import { finalizeFailedPayment, finalizePaidPayment } from "../order-finalization";

const ORDER = {
  id: "ORD-1",
  total: 1000,
  subtotal: 900,
  shippingCost: 100,
  paymentMethod: "KOKO",
  paymentMethodDisplay: "Koko",
  paymentStatus: "PENDING",
  status: "PENDING",
  guestName: "Jane",
  guestEmail: "jane@example.com",
  user: null,
  customerPhone: "0771234567",
  shippingLine1: "1 Main Street",
  shippingLine2: null,
  shippingCity: "Colombo",
  shippingCountry: "Sri Lanka",
  webNumber: "WEB1001",
  rbNumber: null,
  emailSent: false,
};

const ITEMS = [{ productId: "P1", name: "Tee", size: "M", price: 1000, quantity: 2 }];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ROYAL_EXPRESS_ENABLED = "false";
  orderFindUnique.mockResolvedValue(ORDER);
  orderUpdate.mockResolvedValue({ ...ORDER, paymentStatus: "PAID" });
  orderUpdateMany.mockResolvedValue({ count: 1 });
  orderItemFindMany.mockResolvedValue(ITEMS);
});

describe("order finalization", () => {
  it("marks paid and sends confirmation email", async () => {
    await finalizePaidPayment("ORD-1", "KOKO");

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: "ORD-1", paymentStatus: { not: "PAID" } },
      data: { paymentStatus: "PAID" },
    });
    expect(sendOrderConfirmationEmail).toHaveBeenCalledOnce();
  });

  it("marks failed, cancels order, and restores stock once", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, items: ITEMS });

    await finalizeFailedPayment("ORD-1", "KOKO", "cancelled");

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "ORD-1",
        paymentStatus: { notIn: ["PAID", "PAYMENT_FAILED"] },
        status: { not: "CANCELLED" },
      },
      data: { paymentStatus: "PAYMENT_FAILED", status: "CANCELLED" },
    });
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: "P1" },
      data: { stock: { increment: 2 } },
    });
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
  });

  it("does not restore stock when already failed", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, paymentStatus: "PAYMENT_FAILED", status: "CANCELLED", items: ITEMS });

    await finalizeFailedPayment("ORD-1", "KOKO", "cancelled");

    expect(productUpdate).not.toHaveBeenCalled();
  });

  it("ignores failure when already paid", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, paymentStatus: "PAID", items: ITEMS });

    await finalizeFailedPayment("ORD-1", "KOKO", "cancelled");

    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(productUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- app/_lib/payments/__tests__/order-finalization.test.ts
```

Expected: fails because `order-finalization.ts` does not exist.

- [ ] **Step 3: Implement finalization helper**

Create `app/_lib/payments/order-finalization.ts`:

```ts
import { prisma } from "@/app/_lib/prisma";
import { bookCourierAndNotify } from "@/app/checkout/book-courier";
import {
  logMailerError,
  sendAdminFailureAlertEmail,
  sendOrderConfirmationEmail,
  type OrderDetails,
} from "@/app/_lib/mailer";

function paidDetails(order: any, items: any[]): OrderDetails {
  return {
    orderId: order.id,
    customerName: order.guestName ?? order.user?.name ?? "Customer",
    customerEmail: order.guestEmail ?? order.user?.email ?? "",
    customerPhone: order.customerPhone,
    items: items.map((it) => ({
      name: it.name,
      size: it.size,
      price: it.price,
      quantity: it.quantity,
    })),
    subtotal: order.subtotal,
    shipping: order.shippingCost,
    total: order.total,
    shippingAddress: {
      line1: order.shippingLine1,
      line2: order.shippingLine2 ?? undefined,
      city: order.shippingCity,
      country: order.shippingCountry,
    },
    paymentMethod: order.paymentMethod,
    paymentMethodDisplay: order.paymentMethodDisplay ?? undefined,
    webNumber: order.webNumber,
    rbNumber: order.rbNumber,
    paymentStatus: "PAID",
  };
}

export async function finalizePaidPayment(orderId: string, expectedMethod: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!order) return { status: "order_not_found" as const };
  if (order.paymentMethod !== expectedMethod) return { status: "payment_method_mismatch" as const };
  if (order.paymentStatus === "PAID") return { status: "already_processed" as const };
  if (order.paymentStatus === "PAYMENT_FAILED" || order.status === "CANCELLED") {
    return { status: "already_failed" as const };
  }

  // Atomically claim the order as PAID. Koko fires BOTH a server-to-server
  // response and a browser return, so two concurrent callers can pass the
  // check-then-act guard above. Only the caller whose conditional updateMany
  // flips the row (count === 1) proceeds to run email/courier side effects;
  // the loser short-circuits as already_processed. (Amendment A2)
  const claim = await prisma.order.updateMany({
    where: { id: orderId, paymentStatus: { not: "PAID" } },
    data: { paymentStatus: "PAID" },
  });
  if (claim.count !== 1) return { status: "already_processed" as const };

  const updated = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!updated) return { status: "success" as const };

  const items = await prisma.orderItem.findMany({ where: { orderId } });
  const details = paidDetails(updated, items);

  if (process.env.ROYAL_EXPRESS_ENABLED === "true") {
    try {
      await bookCourierAndNotify({ order: details });
    } catch (err) {
      try {
        await sendAdminFailureAlertEmail({
          orderId,
          step: "orchestrate-courier",
          reason: err instanceof Error ? err.message : "unknown",
          order: details,
        });
      } catch {
        /* webhook response must not fail because alert delivery failed */
      }
    }
  }

  if (!updated.emailSent) {
    try {
      await sendOrderConfirmationEmail(details);
      await prisma.order.update({ where: { id: orderId }, data: { emailSent: true } });
    } catch (err) {
      logMailerError("order-confirmation", { orderId, webNumber: updated.webNumber }, err);
    }
  }

  return { status: "success" as const };
}

export async function finalizeFailedPayment(orderId: string, expectedMethod: string, reason: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return { status: "order_not_found" as const };
  if (order.paymentMethod !== expectedMethod) return { status: "payment_method_mismatch" as const };
  if (order.paymentStatus === "PAID") return { status: "already_paid" as const };
  if (order.paymentStatus === "PAYMENT_FAILED" || order.status === "CANCELLED") {
    return { status: "already_failed" as const };
  }

  await prisma.$transaction(async (tx) => {
    // Atomically claim the failure so concurrent callbacks restore stock
    // exactly once (design doc: "Stock is restored ... exactly once"). (Amendment A2)
    const claim = await tx.order.updateMany({
      where: {
        id: orderId,
        paymentStatus: { notIn: ["PAID", "PAYMENT_FAILED"] },
        status: { not: "CANCELLED" },
      },
      data: { paymentStatus: "PAYMENT_FAILED", status: "CANCELLED" },
    });
    if (claim.count !== 1) return;
    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
    }
  });

  return { status: "failed" as const, reason };
}
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npm run test -- app/_lib/payments/__tests__/order-finalization.test.ts
```

Expected: pass.

Commit:

```bash
git add app/_lib/payments/order-finalization.ts app/_lib/payments/__tests__/order-finalization.test.ts
git commit -m "feat(payments): add shared order finalization"
```

---

### Task 5: Add Generic Initiate Route And PayHere Compatibility Wrapper

**Files:**
- Create: `app/api/payments/initiate/route.ts`
- Create: `app/api/payments/__tests__/initiate-route.test.ts`
- Modify: `app/api/payhere/payment/route.ts`
- Modify: `app/api/payhere/__tests__/payment-route.test.ts`

- [ ] **Step 1: Write failing generic initiate route tests**

Create `app/api/payments/__tests__/initiate-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { orderFindUnique, initiate } = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  initiate: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { order: { findUnique: orderFindUnique } },
}));

vi.mock("@/app/_lib/payments/registry", async (orig) => {
  const actual = await orig<typeof import("@/app/_lib/payments/registry")>();
  return {
    ...actual,
    getPaymentProvider: () => ({ method: "KOKO", displayName: "Koko", initiate }),
  };
});

import { POST } from "../initiate/route";

const ORDER = {
  id: "ORD-1",
  paymentMethod: "KOKO",
  paymentStatus: "PENDING",
  user: null,
  items: [],
};

describe("POST /api/payments/initiate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_URL = "https://shop.example.com";
    initiate.mockResolvedValue({
      provider: "KOKO",
      displayName: "Koko",
      gatewayUrl: "https://qaapi.paykoko.com/api/merchants/orderCreate",
      fields: { _orderId: "ORD-1" },
    });
  });

  it("initiates the order's online provider", async () => {
    orderFindUnique.mockResolvedValue(ORDER);

    const res = await POST(new Request("https://shop.example.com/api/payments/initiate", {
      method: "POST",
      body: JSON.stringify({ orderId: "ORD-1" }),
    }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      provider: "KOKO",
      gatewayUrl: "https://qaapi.paykoko.com/api/merchants/orderCreate",
    });
  });

  it("rejects COD orders", async () => {
    orderFindUnique.mockResolvedValue({ ...ORDER, paymentMethod: "COD" });

    const res = await POST(new Request("https://shop.example.com/api/payments/initiate", {
      method: "POST",
      body: JSON.stringify({ orderId: "ORD-1" }),
    }));

    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- app/api/payments/__tests__/initiate-route.test.ts
```

Expected: fails because route does not exist.

- [ ] **Step 3: Implement generic initiate route**

Create `app/api/payments/initiate/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { isPaymentConfigError } from "@/app/_lib/payments/config";
import { getPaymentProvider, isOnlinePaymentMethod } from "@/app/_lib/payments/registry";

const InitiateSchema = z.object({ orderId: z.string().min(1) });

function appBaseUrl(req: Request): string {
  return process.env.APP_URL || new URL(req.url).origin;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = InitiateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    include: {
      items: { select: { productId: true, name: true, quantity: true, price: true, size: true } },
      user: { select: { name: true, email: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!isOnlinePaymentMethod(order.paymentMethod)) {
    return NextResponse.json({ error: "Order was not created for an online payment method" }, { status: 409 });
  }
  if (order.paymentStatus === "PAID") {
    return NextResponse.json({ error: "Order is already paid" }, { status: 409 });
  }

  try {
    const provider = getPaymentProvider(order.paymentMethod);
    return NextResponse.json(await provider.initiate(order, appBaseUrl(req)));
  } catch (error) {
    console.error("[payments/initiate] failure", { order_id: order.id, provider: order.paymentMethod, error });
    if (isPaymentConfigError(error)) {
      return NextResponse.json({ error: "Payment gateway is not configured" }, { status: 500 });
    }
    return NextResponse.json({ error: "Failed to initialize payment" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Replace PayHere payment route with wrapper**

Modify `app/api/payhere/payment/route.ts` to delegate:

```ts
export { POST } from "@/app/api/payments/initiate/route";
```

Keep existing PayHere route tests and update mocked provider behavior if needed so they still verify PayHere field shape through the generic route.

- [ ] **Step 5: Run route tests and commit**

Run:

```bash
npm run test -- app/api/payments/__tests__/initiate-route.test.ts app/api/payhere/__tests__/payment-route.test.ts
```

Expected: pass.

Commit:

```bash
git add app/api/payments app/api/payhere/payment/route.ts app/api/payhere/__tests__/payment-route.test.ts
git commit -m "feat(payments): add generic payment initiation route"
```

---

### Task 6: Add Verified Provider Callback And Return Routes

**Files:**
- Modify: `app/_lib/payments/payhere.ts`
- Modify: `app/_lib/payments/koko.ts`
- Modify: `app/_lib/payments/mintpay.ts`
- Modify: `app/api/payhere/webhook/route.ts`
- Create: `app/api/payments/koko/return/route.ts`
- Create: `app/api/payments/koko/response/route.ts`
- Create: `app/api/payments/mintpay/return/route.ts`
- Create: `app/api/payments/__tests__/provider-callbacks.test.ts`
- Modify: `app/api/payhere/__tests__/webhook-route.test.ts`

- [ ] **Step 1: Write failing callback tests**

Create `app/api/payments/__tests__/provider-callbacks.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

const { finalizePaidPayment, finalizeFailedPayment, kokoFetch } = vi.hoisted(() => ({
  finalizePaidPayment: vi.fn(async () => ({ status: "success" })),
  finalizeFailedPayment: vi.fn(async () => ({ status: "failed" })),
  kokoFetch: vi.fn(),
}));

vi.mock("@/app/_lib/payments/order-finalization", () => ({
  finalizePaidPayment,
  finalizeFailedPayment,
}));

describe("provider callback routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.KOKO_MERCHANT_ID = "merchant";
    process.env.KOKO_API_KEY = "api-key";
    process.env.KOKO_PRIVATE_KEY = "private-key";
    process.env.KOKO_PLUGIN_NAME = "customapi";
    process.env.KOKO_PLUGIN_VERSION = "1";
    process.env.MINTPAY_MERCHANT_ID = "mp0001";
    process.env.MINTPAY_MERCHANT_SECRET = "secret";
  });

  it("finalizes Mintpay success when HMAC is valid", async () => {
    const { GET } = await import("../mintpay/return/route");
    const hash = Buffer.from(
      createHmac("sha256", "secret").update("mp00012440.00ORD-1").digest("hex"),
    ).toString("base64");

    const res = await GET(new Request(`https://shop.example.com/api/payments/mintpay/return?orderId=ORD-1&amount=2440.00&hash=${encodeURIComponent(hash)}&result=success`));

    expect(res.status).toBe(302);
    expect(finalizePaidPayment).toHaveBeenCalledWith("ORD-1", "MINTPAY");
  });

  it("finalizes Mintpay failure when fail HMAC is valid", async () => {
    const { GET } = await import("../mintpay/return/route");
    const hash = Buffer.from(createHmac("sha256", "secret").update("ORD-1").digest("hex")).toString("base64");

    const res = await GET(new Request(`https://shop.example.com/api/payments/mintpay/return?orderId=ORD-1&hash=${encodeURIComponent(hash)}&result=failed`));

    expect(res.status).toBe(302);
    expect(finalizeFailedPayment).toHaveBeenCalledWith("ORD-1", "MINTPAY", "failed");
  });

  it("does not finalize Mintpay when HMAC is invalid", async () => {
    const { GET } = await import("../mintpay/return/route");

    const res = await GET(new Request("https://shop.example.com/api/payments/mintpay/return?orderId=ORD-1&hash=bad&result=success"));

    expect(res.status).toBe(403);
    expect(finalizePaidPayment).not.toHaveBeenCalled();
    expect(finalizeFailedPayment).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- app/api/payments/__tests__/provider-callbacks.test.ts
```

Expected: fails because routes do not exist.

- [ ] **Step 3: Add Mintpay return verification route**

Create `app/api/payments/mintpay/return/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getMintpayConfig } from "@/app/_lib/payments/config";
import { finalizeFailedPayment, finalizePaidPayment } from "@/app/_lib/payments/order-finalization";
import { mintpayFailHash, mintpaySuccessHash } from "@/app/_lib/payments/mintpay";

function redirectUrl(req: Request, orderId: string, status?: string): URL {
  const url = new URL("/checkout/success", req.url);
  url.searchParams.set("order_id", orderId);
  if (status) url.searchParams.set("status", status);
  return url;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId") ?? "";
  const hash = url.searchParams.get("hash") ?? "";
  const result = url.searchParams.get("result") ?? "";
  const amount = Number(url.searchParams.get("amount") ?? "0");
  const cfg = getMintpayConfig();

  if (!orderId || !hash) {
    return NextResponse.json({ error: "Invalid Mintpay return" }, { status: 400 });
  }

  if (result === "success") {
    const expected = Buffer.from(mintpaySuccessHash(cfg.merchantId, amount, orderId, cfg.merchantSecret)).toString("base64");
    if (hash !== expected) return NextResponse.json({ error: "Signature verification failed" }, { status: 403 });
    await finalizePaidPayment(orderId, "MINTPAY");
    return NextResponse.redirect(redirectUrl(req, orderId));
  }

  const expected = Buffer.from(mintpayFailHash(orderId, cfg.merchantSecret)).toString("base64");
  if (hash !== expected) return NextResponse.json({ error: "Signature verification failed" }, { status: 403 });
  await finalizeFailedPayment(orderId, "MINTPAY", "failed");
  return NextResponse.redirect(redirectUrl(req, orderId, "cancelled"));
}
```

- [ ] **Step 4: Add Koko order-view verification helper**

Append to `app/_lib/payments/koko.ts`:

```ts
export function signKokoOrderViewString(args: {
  merchantId: string;
  pluginName: string;
  pluginVersion: string;
  orderId: string;
  apiKey: string;
  privateKey: string;
}): string {
  return signKokoDataString(
    args.merchantId + args.pluginName + args.pluginVersion + args.orderId + args.apiKey,
    args.privateKey,
  );
}

export async function fetchKokoOrderStatus(orderId: string): Promise<"PENDING" | "SUCCESS" | "FAILED"> {
  const cfg = getKokoConfig();
  const body = new URLSearchParams({
    _mId: cfg.merchantId,
    _pluginName: cfg.pluginName,
    _pluginVersion: cfg.pluginVersion,
    api_key: cfg.apiKey,
    _orderId: orderId,
    signature: signKokoOrderViewString({
      merchantId: cfg.merchantId,
      pluginName: cfg.pluginName,
      pluginVersion: cfg.pluginVersion,
      orderId,
      apiKey: cfg.apiKey,
      privateKey: cfg.privateKey,
    }),
  });

  const response = await fetch(cfg.orderViewUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json()) as { status?: string; data?: { status?: string } };
  const status = data.data?.status ?? data.status;
  if (status === "SUCCESS" || status === "FAILED" || status === "PENDING") return status;
  return "PENDING";
}
```

- [ ] **Step 5: Add Koko return and response routes**

Create `app/api/payments/koko/return/route.ts`:

```ts
import { NextResponse } from "next/server";
import { fetchKokoOrderStatus } from "@/app/_lib/payments/koko";
import { finalizeFailedPayment, finalizePaidPayment } from "@/app/_lib/payments/order-finalization";

function successUrl(req: Request, orderId: string, status?: string): URL {
  const url = new URL("/checkout/success", req.url);
  url.searchParams.set("order_id", orderId);
  if (status) url.searchParams.set("status", status);
  return url;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("order_id") ?? url.searchParams.get("_orderId") ?? "";
  if (!orderId) return NextResponse.json({ error: "Missing order id" }, { status: 400 });

  const status = await fetchKokoOrderStatus(orderId);
  if (status === "SUCCESS") {
    await finalizePaidPayment(orderId, "KOKO");
    return NextResponse.redirect(successUrl(req, orderId));
  }
  if (status === "FAILED") {
    await finalizeFailedPayment(orderId, "KOKO", "failed");
    return NextResponse.redirect(successUrl(req, orderId, "cancelled"));
  }
  return NextResponse.redirect(successUrl(req, orderId));
}
```

Create `app/api/payments/koko/response/route.ts`:

```ts
import { NextResponse } from "next/server";
import { fetchKokoOrderStatus } from "@/app/_lib/payments/koko";
import { finalizeFailedPayment, finalizePaidPayment } from "@/app/_lib/payments/order-finalization";

async function orderIdFromRequest(req: Request): Promise<string> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await req.json()) as Record<string, string>;
    return body.order_id ?? body._orderId ?? body.orderId ?? "";
  }
  const body = new URLSearchParams(await req.text());
  return body.get("order_id") ?? body.get("_orderId") ?? body.get("orderId") ?? "";
}

export async function POST(req: Request) {
  const orderId = await orderIdFromRequest(req);
  if (!orderId) return NextResponse.json({ error: "Missing order id" }, { status: 400 });

  const status = await fetchKokoOrderStatus(orderId);
  if (status === "SUCCESS") {
    return NextResponse.json(await finalizePaidPayment(orderId, "KOKO"));
  }
  if (status === "FAILED") {
    return NextResponse.json(await finalizeFailedPayment(orderId, "KOKO", "failed"));
  }
  return NextResponse.json({ status: "pending" });
}
```

- [ ] **Step 6: Migrate PayHere webhook finalization**

In `app/api/payhere/webhook/route.ts`, keep existing merchant id, signature, amount, and currency verification. Replace the custom update/email/courier block after verification with:

```ts
const result = await finalizePaidPayment(order_id, "PAYHERE");
return NextResponse.json(result.status === "success" ? { status: "success" } : result);
```

Import:

```ts
import { finalizePaidPayment } from "@/app/_lib/payments/order-finalization";
```

- [ ] **Step 7: Run callback tests and commit**

Run:

```bash
npm run test -- app/api/payments/__tests__/provider-callbacks.test.ts app/api/payhere/__tests__/webhook-route.test.ts
```

Expected: pass.

Commit:

```bash
git add app/_lib/payments app/api/payments app/api/payhere/webhook/route.ts app/api/payhere/__tests__/webhook-route.test.ts
git commit -m "feat(payments): add verified provider callbacks"
```

---

### Task 7: Update Checkout Client And Success Page

**Files:**
- Modify: `app/checkout/page.tsx`
- Modify: `app/checkout/checkout-client.tsx`
- Modify: `app/checkout/payhere-client.ts`
- Modify: `app/checkout/success/page.tsx`
- Modify: `app/checkout/success/payment-status-poll.tsx`
- Create: `app/checkout/__tests__/payment-client.test.ts`

- [ ] **Step 1: Write failing client helper tests**

Create `app/checkout/__tests__/payment-client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { paymentErrorMessage, readPaymentInitiationResponse } from "../payhere-client";

describe("generic payment client helpers", () => {
  it("parses provider initiation JSON", async () => {
    const response = new Response(JSON.stringify({
      provider: "KOKO",
      displayName: "Koko",
      gatewayUrl: "https://gateway.example",
      fields: { _orderId: "ORD-1" },
    }));

    await expect(readPaymentInitiationResponse(response)).resolves.toMatchObject({
      provider: "KOKO",
      displayName: "Koko",
      gatewayUrl: "https://gateway.example",
    });
  });

  it("uses provider-generic error message", () => {
    expect(paymentErrorMessage("Failed to initialize payment")).toBe(
      "Failed to initialize payment. Your order is saved. Please try again or contact support.",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- app/checkout/__tests__/payment-client.test.ts
```

Expected: fails because helpers are PayHere-specific.

- [ ] **Step 3: Make payment client helpers generic**

Modify `app/checkout/payhere-client.ts`:

```ts
export type PaymentInitiationResponse = {
  provider?: "PAYHERE" | "KOKO" | "MINTPAY";
  displayName?: string;
  gatewayUrl?: string;
  fields?: Record<string, string>;
  error?: string;
};

export async function readPaymentInitiationResponse(
  response: Response,
): Promise<PaymentInitiationResponse> {
  const text = await response.text();
  if (!text) return { error: "Payment gateway returned an empty response" };
  try {
    return JSON.parse(text) as PaymentInitiationResponse;
  } catch {
    return { error: "Payment gateway returned an invalid response" };
  }
}

export function paymentErrorMessage(error?: string): string {
  const message = error?.trim() || "Payment gateway error";
  return `${message}. Your order is saved. Please try again or contact support.`;
}

export function submitPaymentCheckoutForm(gatewayUrl: string, fields: Record<string, string>): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = gatewayUrl;
  form.target = "_top";
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export const readPayHerePaymentResponse = readPaymentInitiationResponse;
export const payHerePaymentErrorMessage = paymentErrorMessage;
export const submitPayHereCheckoutForm = submitPaymentCheckoutForm;
```

- [ ] **Step 4: Update checkout client to call generic initiate route**

In `app/checkout/page.tsx`, pass server-side payment options:

```tsx
import { checkoutPaymentOptions } from "@/app/_lib/payments/registry";
```

```tsx
<CheckoutClient user={user} paymentOptions={checkoutPaymentOptions()} />
```

In `app/checkout/checkout-client.tsx`, replace PayHere-only state:

```ts
type Props = {
  user: CheckoutUser;
  paymentOptions: {
    id: PaymentMethod;
    name: string;
    description: string;
    icon: string;
  }[];
};

export function CheckoutClient({ user, paymentOptions }: Props) {
```

Use `paymentOptions` anywhere the client currently reads `PAYMENT_OPTIONS`, then replace PayHere-only state:

```ts
const [pendingOnlineOrderId, setPendingOnlineOrderId] = useState<string | null>(null);
const [redirectingProvider, setRedirectingProvider] = useState<string | null>(null);
```

Replace `initiatePayHere` with:

```ts
async function initiateOnlinePayment(onlineOrderId: string) {
  setError(null);
  setPendingOnlineOrderId(onlineOrderId);
  setIsSubmitting(true);
  try {
    const res = await fetch("/api/payments/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: onlineOrderId }),
    });
    const data = await readPaymentInitiationResponse(res);
    if (res.ok && data.gatewayUrl && data.fields) {
      flushSync(() => setRedirectingProvider(data.displayName ?? data.provider ?? "payment gateway"));
      const { gatewayUrl, fields } = data;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => submitPaymentCheckoutForm(gatewayUrl, fields));
      });
      return;
    }
    setError(paymentErrorMessage(data.error));
  } catch {
    setError(paymentErrorMessage("Failed to initialize payment"));
  } finally {
    setIsSubmitting(false);
  }
}
```

In submit handler:

```ts
if (paymentMethod !== "COD") {
  setOrderReference(result.webNumber ?? result.orderId);
  await initiateOnlinePayment(result.orderId);
  return;
}
```

Update retry condition:

```tsx
{error && pendingOnlineOrderId && paymentMethod !== "COD" && (
  <Button
    type="button"
    variant="secondary"
    className="w-full mt-3"
    size="lg"
    disabled={isSubmitting}
    onClick={() => {
      if (pendingOnlineOrderId) void initiateOnlinePayment(pendingOnlineOrderId);
    }}
  >
    {isSubmitting ? "Retrying..." : "Retry payment"}
  </Button>
)}
```

Update overlay copy:

```tsx
{redirectingProvider && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur" role="status" aria-live="polite">
    <div className="text-center max-w-sm px-4">
      <Loader2 className="mx-auto h-10 w-10 text-primary animate-spin mb-4" />
      <h2 className="text-xl font-semibold mb-2">Redirecting to {redirectingProvider}...</h2>
      <p className="text-sm text-muted-foreground">
        Please don&apos;t close or refresh this page. You&apos;ll be taken to secure checkout in a moment.
      </p>
    </div>
  </div>
)}
```

- [ ] **Step 5: Update success-page polling for failed payments**

In `app/checkout/success/payment-status-poll.tsx`, stop polling on failed status:

```ts
if (data.paymentStatus === "PAYMENT_FAILED") {
  router.refresh();
  return;
}
```

In `app/checkout/success/page.tsx`, update confirming copy to avoid PayHere-only language:

```tsx
<p className="text-muted-foreground text-lg mb-2">
  Your payment provider received your request. We&apos;re finalizing your order; this usually takes just a few seconds.
</p>
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npm run test -- app/checkout/__tests__/payment-client.test.ts app/api/orders/__tests__/payment-status-route.test.ts
```

Expected: pass.

Commit:

```bash
git add app/checkout/page.tsx app/checkout/checkout-client.tsx app/checkout/payhere-client.ts app/checkout/success/page.tsx app/checkout/success/payment-status-poll.tsx app/checkout/__tests__/payment-client.test.ts
git commit -m "feat(checkout): use generic online payment initiation"
```

---

### Task 8: Add Env Examples And End-To-End Verification

**Files:**
- Modify: `.env.local.example`
- Run: full test/build commands

- [ ] **Step 1: Update env example with variable names only**

Append to `.env.local.example`:

```env
KOKO_ENABLED="false"
KOKO_MODE="test"
KOKO_MERCHANT_ID=""
KOKO_API_KEY=""
KOKO_PUBLIC_KEY=""
KOKO_PRIVATE_KEY=""
KOKO_PLUGIN_NAME="customapi"
KOKO_PLUGIN_VERSION="1"

MINTPAY_ENABLED="false"
MINTPAY_MODE="test"
MINTPAY_MERCHANT_ID=""
MINTPAY_MERCHANT_SECRET=""
```

- [ ] **Step 2: Scan for forbidden typo and leaked provider samples**

Run:

```bash
rg -n "MINITPAY|MinitPay" app tests docs prisma
rg -n "KOKO_PRIVATE_KEY=|MINTPAY_MERCHANT_SECRET=.*[A-Za-z0-9]{8}|BEGIN RSA PRIVATE KEY" .env.local.example docs app tests
```

Expected: first command has no output. Second command has no output.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm run test -- app/_lib/payments app/checkout/__tests__ app/api/payments app/api/payhere app/api/orders
```

Expected: all selected tests pass.

- [ ] **Step 4: Run project verification**

Run:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit env/test cleanup**

```bash
git add .env.local.example
git commit -m "chore(payments): document koko and mintpay environment"
```

- [ ] **Step 6: Manual sandbox verification checklist**

Use configured sandbox credentials in `.env.local`; do not commit values.

```txt
1. Set KOKO_ENABLED=true and MINTPAY_ENABLED=true locally.
2. Start the app with npm run dev.
3. Place one Koko order and complete sandbox payment.
4. Confirm order paymentStatus becomes PAID.
5. Confirm confirmation email/courier path runs only after verified payment.
6. Place one Koko order and cancel/fail payment.
7. Confirm paymentStatus becomes PAYMENT_FAILED and status becomes CANCELLED.
8. Confirm stock is restored once.
9. Repeat steps 3-8 for Mintpay.
```

**SANDBOX-GATED CONFIRMATIONS** (cannot be proven by unit tests — network calls are mocked; must be confirmed with real sandbox credentials):

**SG-1 — Koko orderView host (Amendment A1):** The code points both `orderCreateUrl` and `orderViewUrl` at `qaapi.paykoko.com` in test mode (dev/QA), and `prodapi.paykoko.com` in live mode. Confirm with Koko sandbox credentials that a Koko order CREATED against `qaapi.paykoko.com/api/merchants/orderCreate` is VIEWABLE via `qaapi.paykoko.com/api/merchants/orderView` (the QA orderView host). This is doc-ambiguous: the v1.05 reference examples use `prodapi` URLs generically and do not explicitly confirm whether QA orders can be queried on the prod orderView host. If sandbox testing shows QA orders are only viewable on `prodapi.paykoko.com/api/merchants/orderView` (i.e. the orderView endpoint is environment-neutral while orderCreate is environment-specific), revert `getKokoConfig().orderViewUrl` to always return the prod host — that is a one-line change in `app/_lib/payments/config.ts`.

**SG-2 — Koko response-signature scheme (Amendment A3):** The Koko `_responseUrl` POST and the orderView response may carry a `signature` field over `orderId+trnId+status` that should verify as RSA-SHA256 against the Koko public key (`KOKO_PUBLIC_KEY`). The code in `app/api/payments/koko/response/route.ts` calls `verifyKokoResponseSignature` when both `signature` and `KOKO_PUBLIC_KEY` are present — on mismatch it logs a warning but still finalizes based on the orderView-fetched `status` (never fail-closed). Confirm in sandbox: (a) whether the Koko response/return POST body includes a `signature` field at all, (b) whether it verifies correctly as RSA-SHA256 over `orderId+trnId+status` against the shared public key. If the signature scheme differs (e.g. different field concatenation order, different algorithm, or absent entirely), adjust `verifyKokoResponseSignature` accordingly — but keep the behavior non-fail-closed: a signature mismatch must only log a warning, never block finalization, because a wrong scheme assumption would hard-fail 100% of Koko payments.

---

## Self-Review Notes

- Spec coverage: method rename, shared provider layer, PayHere preservation, Koko RSA signing, Koko order-view verification, Mintpay create-order/HMAC flow, failure status, stock restoration, launch flags, and checkout UX are all mapped to tasks.
- Scope: no new payment transaction table, no admin order page, and no pending-payment expiry job are included.
- Type consistency: `MINTPAY` is the only Mintpay method identifier in planned production code.
