# Admin Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin Settings page at `/admin/settings` — store info + delivery pricing editable (DB-backed via a singleton `StoreSettings` row), payment methods + system config surfaced read-only (presence/mode only, never secrets).

**Architecture:** A singleton `StoreSettings` Prisma row holds the ~7 editable fields, seeded from today's constants/env so production is byte-identical at rollout. A pure `calculateDelivery(subtotal, zone, config)` reads a `DeliveryConfig`; the live config is fetched once in the root layout and threaded to the 4 client surfaces via a `DeliveryConfigProvider` context, and read directly server-side by `announcement-bar`, `checkout/actions.ts`, and `admin-orders.ts`. Read-only diagnostics derive enabled/mode/configured booleans from env without ever returning key material. Mutations are `requireAdmin`-gated Server Actions. Mirrors the shipped Orders/Products/Customers patterns.

**Tech Stack:** Next.js 16 App Router (React 19), NextAuth v5, Prisma 6 + PostgreSQL, Zod 4, Vitest 4 (node env, `.ts`), Playwright e2e, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-04-admin-settings-page-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `prisma/schema.prisma` | Add `StoreSettings` singleton model |
| `app/_lib/checkout-config.ts` | `DeliveryConfig` type, `DEFAULT_DELIVERY_CONFIG`, `calculateDelivery(subtotal, zone, config?)` |
| `app/_lib/store-settings.ts` | `STORE_SETTINGS_ID`, `DEFAULT_STORE_SETTINGS`, `getStoreSettings`, `getDeliveryConfig` |
| `app/_lib/payments/diagnostics.ts` | `getPaymentDiagnostics`, `getSystemDiagnostics` (presence/mode only — no secrets) |
| `app/admin/settings/actions.ts` | `updateStoreInfo`, `updateDeliveryPricing` Server Actions |
| `app/admin/settings/page.tsx` | Server Component composing the four sections |
| `app/_components/delivery/delivery-config-provider.tsx` | Client context + `useDeliveryConfig()` hook |
| `app/_components/admin/settings/store-info-form.tsx` | Editable store-info form |
| `app/_components/admin/settings/delivery-pricing-form.tsx` | Editable delivery-pricing form |
| `app/_components/admin/settings/payment-methods-table.tsx` | Read-only payment table |
| `app/_components/admin/settings/system-diagnostics.tsx` | Read-only system panel |
| `app/_lib/__tests__/store-settings.test.ts` | unit |
| `app/_lib/__tests__/checkout-config.test.ts` | unit (updated) |
| `app/_lib/payments/__tests__/diagnostics.test.ts` | unit |
| `app/admin/settings/__tests__/actions.test.ts` | action unit tests |
| `tests/e2e/admin-settings.spec.ts` | e2e |

**Modified consumers:** `app/layout.tsx`, `app/_components/shared/announcement-bar.tsx`, `app/_components/cart/cart-summary.tsx`, `app/_components/cart/free-shipping-progress.tsx`, `app/_components/product/buy-box-client.tsx`, `app/checkout/checkout-client.tsx`, `app/checkout/actions.ts`, `app/_lib/admin-orders.ts`, `app/admin/orders/actions.ts`.

---

## Task 1: Add `StoreSettings` Prisma model + migration

**Files:** Modify `prisma/schema.prisma`; generate `prisma/migrations/<timestamp>_add_store_settings/migration.sql`

- [ ] **Step 1: Add the model**

Append to `prisma/schema.prisma` (after the last model):

```prisma
/// Singleton row (id is always "singleton") holding admin-editable store
/// settings. Seeded lazily from app/_lib/store-settings.ts defaults on first read.
model StoreSettings {
  id                    String   @id @default("singleton")
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

- [ ] **Step 2: Create the migration**

Run: `npx prisma migrate dev --name add_store_settings`
Expected: a new `prisma/migrations/<timestamp>_add_store_settings/migration.sql` is created and applied to the local DB; `CREATE TABLE "StoreSettings"` appears in the SQL.

- [ ] **Step 3: Regenerate the client**

Run: `npx prisma generate`
Expected: completes without error; `prisma.storeSettings` is now typed.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(settings): add StoreSettings singleton model + migration"
```

---

## Task 2: Refactor `calculateDelivery` to take a `DeliveryConfig`

**Files:** Modify `app/_lib/checkout-config.ts`; Test `app/_lib/__tests__/checkout-config.test.ts`

Config is an **optional** parameter defaulting to `DEFAULT_DELIVERY_CONFIG`, so existing callers keep compiling; live consumers pass the DB-backed config explicitly in later tasks.

- [ ] **Step 1: Update the failing test**

Replace `app/_lib/__tests__/checkout-config.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import {
  calculateDelivery,
  DEFAULT_DELIVERY_CONFIG,
  COLOMBO_DELIVERY_COST,
  OTHER_DELIVERY_COST,
  FREE_DELIVERY_THRESHOLD,
  type DeliveryConfig,
} from "@/app/_lib/checkout-config";

describe("calculateDelivery", () => {
  it("uses DEFAULT_DELIVERY_CONFIG when no config is passed", () => {
    expect(calculateDelivery(1000, "COLOMBO")).toBe(350);
    expect(calculateDelivery(1000, "OTHER")).toBe(450);
    expect(calculateDelivery(4999, "COLOMBO")).toBe(350);
  });

  it("is free at or above the free threshold for either zone", () => {
    expect(calculateDelivery(FREE_DELIVERY_THRESHOLD, "COLOMBO")).toBe(0);
    expect(calculateDelivery(10_000, "OTHER")).toBe(0);
  });

  it("honours a custom config", () => {
    const cfg: DeliveryConfig = { colombo: 500, other: 700, freeThreshold: 8000 };
    expect(calculateDelivery(1000, "COLOMBO", cfg)).toBe(500);
    expect(calculateDelivery(1000, "OTHER", cfg)).toBe(700);
    expect(calculateDelivery(7999, "COLOMBO", cfg)).toBe(500); // below custom threshold
    expect(calculateDelivery(8000, "COLOMBO", cfg)).toBe(0);   // at custom threshold
  });

  it("exposes the documented rate constants + default config", () => {
    expect(COLOMBO_DELIVERY_COST).toBe(350);
    expect(OTHER_DELIVERY_COST).toBe(450);
    expect(FREE_DELIVERY_THRESHOLD).toBe(5000);
    expect(DEFAULT_DELIVERY_CONFIG).toEqual({ colombo: 350, other: 450, freeThreshold: 5000 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/checkout-config.test.ts`
Expected: FAIL — `DEFAULT_DELIVERY_CONFIG` / `DeliveryConfig` not exported, `calculateDelivery` arity mismatch.

- [ ] **Step 3: Implement the new signature**

Replace `app/_lib/checkout-config.ts` with:

```ts
// app/_lib/checkout-config.ts
// Shared so the client cart summary and the server action agree on totals.
import type { DeliveryZone } from "@/app/_lib/delivery-zones";

export const COLOMBO_DELIVERY_COST = 350;
export const OTHER_DELIVERY_COST = 450;
export const FREE_DELIVERY_THRESHOLD = 5000;

export type DeliveryConfig = {
  colombo: number;
  other: number;
  freeThreshold: number;
};

// Seed/fallback. Live values come from StoreSettings via getDeliveryConfig().
export const DEFAULT_DELIVERY_CONFIG: DeliveryConfig = {
  colombo: COLOMBO_DELIVERY_COST,
  other: OTHER_DELIVERY_COST,
  freeThreshold: FREE_DELIVERY_THRESHOLD,
};

export function calculateDelivery(
  subtotal: number,
  zone: DeliveryZone,
  config: DeliveryConfig = DEFAULT_DELIVERY_CONFIG,
): number {
  if (subtotal >= config.freeThreshold) return 0;
  return zone === "COLOMBO" ? config.colombo : config.other;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/checkout-config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/checkout-config.ts app/_lib/__tests__/checkout-config.test.ts
git commit -m "refactor(checkout): calculateDelivery takes an explicit DeliveryConfig"
```

---

## Task 3: `store-settings.ts` accessor + tests

**Files:** Create `app/_lib/store-settings.ts`; Test `app/_lib/__tests__/store-settings.test.ts`

Intentionally **uncached** — read once per request in the root layout and threaded down. A single indexed singleton lookup per request is negligible, and skipping `unstable_cache`/`react.cache` avoids stale reads after an edit and keeps the unit tests simple.

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/store-settings.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { findUnique, create } = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: { storeSettings: { findUnique, create } },
}));

import { getStoreSettings, getDeliveryConfig, DEFAULT_STORE_SETTINGS, STORE_SETTINGS_ID } from "../store-settings";

const ROW = {
  id: STORE_SETTINGS_ID,
  ...DEFAULT_STORE_SETTINGS,
  colomboDeliveryCost: 350,
  otherDeliveryCost: 450,
  freeDeliveryThreshold: 5000,
  updatedAt: new Date(0),
};

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
});

describe("getStoreSettings", () => {
  it("returns the existing row without creating", async () => {
    findUnique.mockResolvedValueOnce(ROW);
    const s = await getStoreSettings();
    expect(s.storeName).toBe("Dressing Bear");
    expect(create).not.toHaveBeenCalled();
  });

  it("seeds defaults when the row is missing", async () => {
    findUnique.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce(ROW);
    await getStoreSettings();
    expect(create).toHaveBeenCalledWith({
      data: { id: STORE_SETTINGS_ID, ...DEFAULT_STORE_SETTINGS },
    });
  });

  it("recovers from a create race by re-reading", async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(ROW);
    create.mockRejectedValueOnce(new Error("unique violation"));
    const s = await getStoreSettings();
    expect(s.storeName).toBe("Dressing Bear");
  });
});

describe("getDeliveryConfig", () => {
  it("maps the row to a DeliveryConfig", async () => {
    findUnique.mockResolvedValueOnce({ ...ROW, colomboDeliveryCost: 400, otherDeliveryCost: 600, freeDeliveryThreshold: 7000 });
    const cfg = await getDeliveryConfig();
    expect(cfg).toEqual({ colombo: 400, other: 600, freeThreshold: 7000 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/store-settings.test.ts`
Expected: FAIL — `../store-settings` does not exist.

- [ ] **Step 3: Implement the accessor**

Create `app/_lib/store-settings.ts`:

```ts
// app/_lib/store-settings.ts
// Singleton StoreSettings accessor. One row (id = "singleton"), seeded lazily
// from DEFAULT_STORE_SETTINGS on first read so prod is byte-identical at rollout.
import { prisma } from "@/app/_lib/prisma";
import {
  COLOMBO_DELIVERY_COST,
  OTHER_DELIVERY_COST,
  FREE_DELIVERY_THRESHOLD,
  type DeliveryConfig,
} from "@/app/_lib/checkout-config";

export const STORE_SETTINGS_ID = "singleton";

// Seed values mirror today's site identity + checkout-config constants.
export const DEFAULT_STORE_SETTINGS = {
  storeName: "Dressing Bear",
  supportEmail: "dressingbear@gmail.com",
  supportPhone: "+94 74 054 5536",
  businessAddress: "Colombo, Sri Lanka",
  colomboDeliveryCost: COLOMBO_DELIVERY_COST,
  otherDeliveryCost: OTHER_DELIVERY_COST,
  freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD,
};

export async function getStoreSettings() {
  const existing = await prisma.storeSettings.findUnique({ where: { id: STORE_SETTINGS_ID } });
  if (existing) return existing;
  try {
    return await prisma.storeSettings.create({
      data: { id: STORE_SETTINGS_ID, ...DEFAULT_STORE_SETTINGS },
    });
  } catch {
    // Concurrent first-read race: another request created it — re-read.
    const row = await prisma.storeSettings.findUnique({ where: { id: STORE_SETTINGS_ID } });
    if (row) return row;
    throw new Error("Failed to initialize store settings");
  }
}

export async function getDeliveryConfig(): Promise<DeliveryConfig> {
  const s = await getStoreSettings();
  return {
    colombo: s.colomboDeliveryCost,
    other: s.otherDeliveryCost,
    freeThreshold: s.freeDeliveryThreshold,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/store-settings.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/store-settings.ts app/_lib/__tests__/store-settings.test.ts
git commit -m "feat(settings): StoreSettings accessor + getDeliveryConfig"
```

---

## Task 4: `payments/diagnostics.ts` + tests (no-secrets invariant)

**Files:** Create `app/_lib/payments/diagnostics.ts`; Test `app/_lib/payments/__tests__/diagnostics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/payments/__tests__/diagnostics.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getPaymentDiagnostics, getSystemDiagnostics } from "../diagnostics";

const SECRET = "super-secret-key-value-1234567890";

beforeEach(() => {
  // Reset the env this suite touches.
  for (const k of [
    "KOKO_ENABLED", "MINTPAY_ENABLED",
    "PAYHERE_MODE", "KOKO_MODE", "MINTPAY_MODE",
    "PAYHERE_MERCHANT_ID", "PAYHERE_MERCHANT_SECRET",
    "KOKO_MERCHANT_ID", "KOKO_API_KEY", "KOKO_PRIVATE_KEY",
    "MINTPAY_MERCHANT_ID", "MINTPAY_MERCHANT_SECRET",
  ]) delete process.env[k];
});

describe("getPaymentDiagnostics", () => {
  it("always lists COD and PayHere as enabled", () => {
    const d = getPaymentDiagnostics();
    expect(d.find((x) => x.method === "COD")?.enabled).toBe(true);
    expect(d.find((x) => x.method === "PAYHERE")?.enabled).toBe(true);
  });

  it("reflects the KOKO_ENABLED / MINTPAY_ENABLED flags", () => {
    process.env.KOKO_ENABLED = "true";
    const d = getPaymentDiagnostics();
    expect(d.find((x) => x.method === "KOKO")?.enabled).toBe(true);
    expect(d.find((x) => x.method === "MINTPAY")?.enabled).toBe(false);
  });

  it("reports mode from *_MODE and configured from key presence", () => {
    process.env.KOKO_MODE = "live";
    process.env.KOKO_MERCHANT_ID = "m";
    process.env.KOKO_API_KEY = "k";
    process.env.KOKO_PRIVATE_KEY = SECRET;
    const koko = getPaymentDiagnostics().find((x) => x.method === "KOKO")!;
    expect(koko.mode).toBe("live");
    expect(koko.configured).toBe(true);
  });

  it("NEVER leaks secret values", () => {
    process.env.KOKO_PRIVATE_KEY = SECRET;
    process.env.PAYHERE_MERCHANT_SECRET = SECRET;
    process.env.MINTPAY_MERCHANT_SECRET = SECRET;
    const serialized = JSON.stringify(getPaymentDiagnostics()) + JSON.stringify(getSystemDiagnostics());
    expect(serialized).not.toContain(SECRET);
  });
});

describe("getSystemDiagnostics", () => {
  it("returns non-secret environment summary", () => {
    const s = getSystemDiagnostics();
    expect(typeof s.nodeEnv).toBe("string");
    expect(typeof s.appUrl).toBe("string");
    expect(s.providers.map((p) => p.method).sort()).toEqual(["COD", "KOKO", "MINTPAY", "PAYHERE"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/payments/__tests__/diagnostics.test.ts`
Expected: FAIL — `../diagnostics` does not exist.

- [ ] **Step 3: Implement the diagnostics**

Create `app/_lib/payments/diagnostics.ts`:

```ts
// app/_lib/payments/diagnostics.ts
// Read-only provider/system diagnostics for the admin Settings page.
// HARD CONSTRAINT: returns presence/mode booleans only — NEVER key material.
import { envFlag } from "./config";

export type PaymentDiagnostic = {
  method: "COD" | "PAYHERE" | "KOKO" | "MINTPAY";
  label: string;
  enabled: boolean;
  mode: "test" | "live" | null; // null for COD (no provider mode)
  configured: boolean; // required env keys present — never the keys themselves
};

function providerMode(envName: string): "test" | "live" {
  return process.env[envName]?.trim().toLowerCase() === "live" ? "live" : "test";
}

function hasAll(...names: string[]): boolean {
  return names.every((n) => Boolean(process.env[n]));
}

export function getPaymentDiagnostics(): PaymentDiagnostic[] {
  return [
    { method: "COD", label: "Cash on Delivery", enabled: true, mode: null, configured: true },
    {
      method: "PAYHERE",
      label: "Credit / Debit Card (PayHere)",
      enabled: true,
      mode: providerMode("PAYHERE_MODE"),
      configured: hasAll("PAYHERE_MERCHANT_ID", "PAYHERE_MERCHANT_SECRET"),
    },
    {
      method: "KOKO",
      label: "Koko — Pay in 3",
      enabled: envFlag("KOKO_ENABLED"),
      mode: providerMode("KOKO_MODE"),
      configured: hasAll("KOKO_MERCHANT_ID", "KOKO_API_KEY", "KOKO_PRIVATE_KEY"),
    },
    {
      method: "MINTPAY",
      label: "Mintpay",
      enabled: envFlag("MINTPAY_ENABLED"),
      mode: providerMode("MINTPAY_MODE"),
      configured: hasAll("MINTPAY_MERCHANT_ID", "MINTPAY_MERCHANT_SECRET"),
    },
  ];
}

export type SystemDiagnostics = {
  nodeEnv: string;
  appUrl: string;
  providers: { method: string; mode: "test" | "live" | null; configured: boolean }[];
};

export function getSystemDiagnostics(): SystemDiagnostics {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    providers: getPaymentDiagnostics().map(({ method, mode, configured }) => ({ method, mode, configured })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/payments/__tests__/diagnostics.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/payments/diagnostics.ts app/_lib/payments/__tests__/diagnostics.test.ts
git commit -m "feat(settings): read-only payment + system diagnostics (no secrets)"
```

---

## Task 5: Settings Server Actions + tests

**Files:** Create `app/admin/settings/actions.ts`; Test `app/admin/settings/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/admin/settings/__tests__/actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => ({ prisma: { storeSettings: { upsert } } }));

import { updateStoreInfo, updateDeliveryPricing } from "../actions";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { id: "admin1" } });
  upsert.mockReset().mockResolvedValue({});
});

describe("updateStoreInfo", () => {
  it("rejects a blank store name", async () => {
    const res = await updateStoreInfo(fd({ storeName: "", supportEmail: "a@b.test", supportPhone: "x", businessAddress: "y" }));
    expect(res).toEqual({ success: false, error: "Store name is required" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const res = await updateStoreInfo(fd({ storeName: "Shop", supportEmail: "nope", supportPhone: "x", businessAddress: "y" }));
    expect(res).toEqual({ success: false, error: "Enter a valid email" });
  });

  it("upserts valid store info", async () => {
    const res = await updateStoreInfo(fd({ storeName: "Shop", supportEmail: "a@b.test", supportPhone: "077", businessAddress: "Colombo" }));
    expect(res).toEqual({ success: true });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "singleton" },
      update: { storeName: "Shop", supportEmail: "a@b.test", supportPhone: "077", businessAddress: "Colombo" },
    }));
  });
});

describe("updateDeliveryPricing", () => {
  it("rejects a negative cost", async () => {
    const res = await updateDeliveryPricing(fd({ colomboDeliveryCost: "-1", otherDeliveryCost: "450", freeDeliveryThreshold: "5000" }));
    expect(res).toEqual({ success: false, error: "Must be ≥ 0" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts coerced integer pricing", async () => {
    const res = await updateDeliveryPricing(fd({ colomboDeliveryCost: "400", otherDeliveryCost: "600", freeDeliveryThreshold: "7000" }));
    expect(res).toEqual({ success: true });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "singleton" },
      update: { colomboDeliveryCost: 400, otherDeliveryCost: 600, freeDeliveryThreshold: 7000 },
    }));
  });

  it("returns a generic error when the upsert throws", async () => {
    upsert.mockRejectedValueOnce(new Error("db down"));
    const res = await updateDeliveryPricing(fd({ colomboDeliveryCost: "400", otherDeliveryCost: "600", freeDeliveryThreshold: "7000" }));
    expect(res).toEqual({ success: false, error: "Something went wrong. Please try again." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/settings/__tests__/actions.test.ts`
Expected: FAIL — `../actions` does not exist.

- [ ] **Step 3: Implement the actions**

Create `app/admin/settings/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { STORE_SETTINGS_ID, DEFAULT_STORE_SETTINGS } from "@/app/_lib/store-settings";

export type ActionResult = { success: true } | { success: false; error: string };

const StoreInfoSchema = z.object({
  storeName: z.string().trim().min(1, "Store name is required"),
  supportEmail: z.string().trim().email("Enter a valid email"),
  supportPhone: z.string().trim().min(1, "Support phone is required"),
  businessAddress: z.string().trim().min(1, "Business address is required"),
});

const DeliveryPricingSchema = z.object({
  colomboDeliveryCost: z.coerce.number().int().min(0, "Must be ≥ 0"),
  otherDeliveryCost: z.coerce.number().int().min(0, "Must be ≥ 0"),
  freeDeliveryThreshold: z.coerce.number().int().min(0, "Must be ≥ 0"),
});

// Delivery config feeds the global layout (announcement bar, cart, product copy),
// so revalidate the whole layout tree plus the settings page itself.
function revalidate() {
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

async function save(data: Record<string, unknown>): Promise<ActionResult> {
  try {
    await prisma.storeSettings.upsert({
      where: { id: STORE_SETTINGS_ID },
      update: data,
      create: { id: STORE_SETTINGS_ID, ...DEFAULT_STORE_SETTINGS, ...data },
    });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate();
  return { success: true };
}

export async function updateStoreInfo(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = StoreInfoSchema.safeParse({
    storeName: formData.get("storeName"),
    supportEmail: formData.get("supportEmail"),
    supportPhone: formData.get("supportPhone"),
    businessAddress: formData.get("businessAddress"),
  });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return save(parsed.data);
}

export async function updateDeliveryPricing(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = DeliveryPricingSchema.safeParse({
    colomboDeliveryCost: formData.get("colomboDeliveryCost"),
    otherDeliveryCost: formData.get("otherDeliveryCost"),
    freeDeliveryThreshold: formData.get("freeDeliveryThreshold"),
  });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return save(parsed.data);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/settings/__tests__/actions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add app/admin/settings/actions.ts app/admin/settings/__tests__/actions.test.ts
git commit -m "feat(settings): updateStoreInfo + updateDeliveryPricing actions"
```

---

## Task 6: `DeliveryConfigProvider` + wire layout + migrate the 5 consumers

**Files:** Create `app/_components/delivery/delivery-config-provider.tsx`; Modify `app/layout.tsx`, `app/_components/shared/announcement-bar.tsx`, `app/_components/cart/cart-summary.tsx`, `app/_components/cart/free-shipping-progress.tsx`, `app/_components/product/buy-box-client.tsx`, `app/checkout/checkout-client.tsx`

No new unit test — wiring is covered by `npm run build` here and by the Task 10 e2e.

- [ ] **Step 1: Create the provider + hook**

Create `app/_components/delivery/delivery-config-provider.tsx`:

```tsx
"use client";

import { createContext, useContext } from "react";
import { DEFAULT_DELIVERY_CONFIG, type DeliveryConfig } from "@/app/_lib/checkout-config";

const DeliveryConfigContext = createContext<DeliveryConfig>(DEFAULT_DELIVERY_CONFIG);

export function DeliveryConfigProvider({
  value,
  children,
}: {
  value: DeliveryConfig;
  children: React.ReactNode;
}) {
  return <DeliveryConfigContext.Provider value={value}>{children}</DeliveryConfigContext.Provider>;
}

export function useDeliveryConfig(): DeliveryConfig {
  return useContext(DeliveryConfigContext);
}
```

(Defaulting the context to `DEFAULT_DELIVERY_CONFIG` keeps any consumer rendered outside the provider safe rather than throwing.)

- [ ] **Step 2: Wire the root layout**

In `app/layout.tsx`: import the provider + `getDeliveryConfig`, make `RootLayout` async, fetch the config, pass it to `AnnouncementBar` and wrap the provider tree.

Add imports near the existing ones:

```tsx
import { DeliveryConfigProvider } from "@/app/_components/delivery/delivery-config-provider";
import { getDeliveryConfig } from "@/app/_lib/store-settings";
```

Replace the `RootLayout` function with:

```tsx
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const deliveryConfig = await getDeliveryConfig();

  return (
    <html
      lang="en"
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AnnouncementBar freeThreshold={deliveryConfig.freeThreshold} />
        <DeliveryConfigProvider value={deliveryConfig}>
          <SessionProvider>
            <WishlistProvider>
              <CartProvider>{children}</CartProvider>
            </WishlistProvider>
          </SessionProvider>
        </DeliveryConfigProvider>
        <WhatsAppFloatButton />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Migrate `announcement-bar.tsx` (server component → prop)**

Replace `app/_components/shared/announcement-bar.tsx` with:

```tsx
// app/_components/shared/announcement-bar.tsx
import { formatPrice } from "@/app/_lib/format";

// Site-wide promo strip: free-shipping threshold + "pay in 3".
// Scrolls away above the sticky header. Static (not dismissible) by design.
// Rendered in the layout above the DeliveryConfigProvider, so it takes the live
// threshold as a prop (the layout already fetched the config) rather than a hook.
// Koko is gated behind NEXT_PUBLIC_KOKO_ENABLED so we only advertise it once
// it's actually offered at checkout (mirrors the server-side KOKO_ENABLED flag).
export function AnnouncementBar({ freeThreshold }: { freeThreshold: number }) {
  const kokoEnabled = process.env.NEXT_PUBLIC_KOKO_ENABLED === "true";
  return (
    <div className="bg-primary text-primary-foreground">
      <p className="mx-auto max-w-7xl px-4 py-2 text-center text-xs tracking-wide sm:px-6 lg:px-8">
        Free shipping over{" "}
        <span className="font-medium">{formatPrice(freeThreshold)}</span>
        {"  ·  "}Pay in 3 interest-free with{" "}
        {kokoEnabled && (
          <>
            <span className="font-medium">Koko</span> &amp;{" "}
          </>
        )}
        <span className="font-medium">Mintpay</span>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Migrate `cart-summary.tsx`**

In `app/_components/cart/cart-summary.tsx`, replace the checkout-config import line:

```tsx
import { calculateDelivery } from "@/app/_lib/checkout-config";
```

with:

```tsx
import { calculateDelivery } from "@/app/_lib/checkout-config";
import { useDeliveryConfig } from "@/app/_components/delivery/delivery-config-provider";
```

Then inside `CartSummary`, replace:

```tsx
  const { subtotal, totalItems } = useCart();

  const shipping = calculateDelivery(subtotal, "COLOMBO");
```

with:

```tsx
  const { subtotal, totalItems } = useCart();
  const deliveryConfig = useDeliveryConfig();

  const shipping = calculateDelivery(subtotal, "COLOMBO", deliveryConfig);
```

- [ ] **Step 5: Migrate `free-shipping-progress.tsx`**

In `app/_components/cart/free-shipping-progress.tsx`, replace the import:

```tsx
import { FREE_DELIVERY_THRESHOLD } from "@/app/_lib/checkout-config";
```

with:

```tsx
import { useDeliveryConfig } from "@/app/_components/delivery/delivery-config-provider";
```

Then at the top of `FreeShippingProgress`, after the early return, derive the threshold from the hook and keep the rest unchanged:

```tsx
export function FreeShippingProgress({ subtotal }: Props) {
  const { freeThreshold: FREE_DELIVERY_THRESHOLD } = useDeliveryConfig();

  // Empty cart — no progress bar (a 0% strip would feel like a bug).
  if (subtotal <= 0) return null;
```

(Aliasing to the existing local name `FREE_DELIVERY_THRESHOLD` means the rest of the component body needs no edits. Note hooks must run before the early `return null`, so the hook line goes first.)

- [ ] **Step 6: Migrate `buy-box-client.tsx`**

In `app/_components/product/buy-box-client.tsx`, replace the import:

```tsx
import { FREE_DELIVERY_THRESHOLD } from "@/app/_lib/checkout-config";
```

with:

```tsx
import { useDeliveryConfig } from "@/app/_components/delivery/delivery-config-provider";
```

Then near the top of the `BuyBoxClient` component body (with the other hooks), add:

```tsx
  const { freeThreshold: FREE_DELIVERY_THRESHOLD } = useDeliveryConfig();
```

The JSX at line ~247 (`Free shipping over {formatPrice(FREE_DELIVERY_THRESHOLD)}`) then resolves to the live value with no further edits.

- [ ] **Step 7: Migrate `checkout-client.tsx`**

In `app/checkout/checkout-client.tsx`, replace the import:

```tsx
import { calculateDelivery, FREE_DELIVERY_THRESHOLD } from "@/app/_lib/checkout-config";
```

with:

```tsx
import { calculateDelivery } from "@/app/_lib/checkout-config";
import { useDeliveryConfig } from "@/app/_components/delivery/delivery-config-provider";
```

Then where `subtotal`/`shipping` are computed (around line 76), introduce the hook and alias the threshold:

```tsx
  const deliveryConfig = useDeliveryConfig();
  const { freeThreshold: FREE_DELIVERY_THRESHOLD } = deliveryConfig;
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = calculateDelivery(subtotal, zoneForCity(address.city ?? ""), deliveryConfig);
```

The later `subtotal >= FREE_DELIVERY_THRESHOLD` check (line ~507) then uses the live value unchanged. Ensure these hook lines sit with the other hooks, above the `if (orderId)` early return.

- [ ] **Step 8: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds. No unused-import errors for the removed `FREE_DELIVERY_THRESHOLD`/`calculateDelivery` imports.

- [ ] **Step 9: Commit**

```bash
git add app/_components/delivery app/layout.tsx app/_components/shared/announcement-bar.tsx app/_components/cart/cart-summary.tsx app/_components/cart/free-shipping-progress.tsx app/_components/product/buy-box-client.tsx app/checkout/checkout-client.tsx
git commit -m "feat(settings): thread live DeliveryConfig to customer-facing surfaces"
```

---

## Task 7: Wire server consumers to the live delivery config

**Files:** Modify `app/checkout/actions.ts`, `app/_lib/admin-orders.ts`, `app/admin/orders/actions.ts`; Modify tests `app/checkout/__tests__/actions.test.ts`, `app/admin/orders/__tests__/actions.test.ts`

Both delivery callers currently rely on `calculateDelivery`'s `DEFAULT_DELIVERY_CONFIG` fallback. Thread the live config through so server-computed totals match the edited prices. `recomputeTotals` stays a **sync** helper — it takes the config as an optional parameter (default = `DEFAULT_DELIVERY_CONFIG`), and its two async callers in `app/admin/orders/actions.ts` fetch the config and pass it in.

- [ ] **Step 1: Update `app/checkout/actions.ts`**

Add the import (with the other `@/app/_lib` imports):

```ts
import { getDeliveryConfig } from "@/app/_lib/store-settings";
```

Replace the totals block (currently lines 181–183):

```ts
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingCost = calculateDelivery(subtotal, zoneForCity(shippingAddress.city));
  const total = subtotal + shippingCost;
```

with:

```ts
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryConfig = await getDeliveryConfig();
  const shippingCost = calculateDelivery(subtotal, zoneForCity(shippingAddress.city), deliveryConfig);
  const total = subtotal + shippingCost;
```

- [ ] **Step 2: Update `recomputeTotals` in `app/_lib/admin-orders.ts`**

Add `DeliveryConfig` + `DEFAULT_DELIVERY_CONFIG` to the existing `checkout-config` import:

```ts
import { calculateDelivery, DEFAULT_DELIVERY_CONFIG, type DeliveryConfig } from "@/app/_lib/checkout-config";
```

Replace `recomputeTotals` (lines 62–69) with the config-aware version:

```ts
export function recomputeTotals(
  items: { price: number; quantity: number }[],
  city: string,
  config: DeliveryConfig = DEFAULT_DELIVERY_CONFIG,
): { subtotal: number; shippingCost: number; total: number } {
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const shippingCost = calculateDelivery(subtotal, zoneForCity(city), config);
  return { subtotal, shippingCost, total: subtotal + shippingCost };
}
```

- [ ] **Step 3: Pass the live config from `app/admin/orders/actions.ts`**

Add the import:

```ts
import { getDeliveryConfig } from "@/app/_lib/store-settings";
```

At the two call sites (currently lines 118 and 157), fetch the config and pass it as the third argument:

```ts
  // line ~118
  const totals = recomputeTotals(order.items, parsed.data.city, await getDeliveryConfig());
```

```ts
  // line ~157
  const totals = recomputeTotals(next.nextItems, order.shippingCity, await getDeliveryConfig());
```

- [ ] **Step 4: Mock `getDeliveryConfig` in the two affected test files**

Both action tests now reach `getDeliveryConfig`, which would hit Prisma. Add this mock to the `vi.mock(...)` block at the top of **both** `app/checkout/__tests__/actions.test.ts` and `app/admin/orders/__tests__/actions.test.ts`:

```ts
vi.mock("@/app/_lib/store-settings", () => ({
  getDeliveryConfig: vi.fn().mockResolvedValue({ colombo: 350, other: 450, freeThreshold: 5000 }),
}));
```

The mocked values equal the defaults, so the existing shipping assertions (350 / 450 / 0) stay correct.

- [ ] **Step 5: Run the affected tests + build**

Run: `npx vitest run app/checkout/__tests__/actions.test.ts app/admin/orders/__tests__/actions.test.ts`
Expected: PASS — shipping totals unchanged (mock returns the default config).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add app/checkout/actions.ts app/_lib/admin-orders.ts app/admin/orders/actions.ts app/checkout/__tests__/actions.test.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(settings): server checkout + admin-orders use live DeliveryConfig"
```

---

## Task 8: Settings UI components

**Files:** Create `app/_components/admin/settings/store-info-form.tsx`, `delivery-pricing-form.tsx`, `payment-methods-table.tsx`, `system-diagnostics.tsx`

- [ ] **Step 1: Create the store-info form**

Create `app/_components/admin/settings/store-info-form.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStoreInfo } from "@/app/admin/settings/actions";

type StoreInfo = { storeName: string; supportEmail: string; supportPhone: string; businessAddress: string };

const FIELDS: { name: keyof StoreInfo; label: string; type?: string }[] = [
  { name: "storeName", label: "Store name" },
  { name: "supportEmail", label: "Support email", type: "email" },
  { name: "supportPhone", label: "Support phone" },
  { name: "businessAddress", label: "Business address" },
];

export function StoreInfoForm({ initial }: { initial: StoreInfo }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      className="space-y-4"
      action={(formData) =>
        start(async () => {
          const r = await updateStoreInfo(formData);
          setMsg(r.success ? "Saved" : r.error);
          if (r.success) router.refresh();
        })
      }
    >
      {FIELDS.map((f) => (
        <div key={f.name} className="grid gap-1.5">
          <label htmlFor={f.name} className="text-sm font-medium">{f.label}</label>
          <input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            defaultValue={initial[f.name]}
            className="rounded-md border px-3 py-2 text-sm"
          />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {pending ? "Saving…" : "Save store info"}
        </button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create the delivery-pricing form**

Create `app/_components/admin/settings/delivery-pricing-form.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDeliveryPricing } from "@/app/admin/settings/actions";

type Pricing = { colomboDeliveryCost: number; otherDeliveryCost: number; freeDeliveryThreshold: number };

const FIELDS: { name: keyof Pricing; label: string }[] = [
  { name: "colomboDeliveryCost", label: "Colombo delivery (Rs.)" },
  { name: "otherDeliveryCost", label: "Other zone delivery (Rs.)" },
  { name: "freeDeliveryThreshold", label: "Free delivery over (Rs.)" },
];

export function DeliveryPricingForm({ initial }: { initial: Pricing }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      className="space-y-4"
      action={(formData) =>
        start(async () => {
          const r = await updateDeliveryPricing(formData);
          setMsg(r.success ? "Saved" : r.error);
          if (r.success) router.refresh();
        })
      }
    >
      <p className="text-sm text-muted-foreground">
        Price changes apply to new orders only — existing orders keep the delivery cost recorded at checkout.
      </p>
      {FIELDS.map((f) => (
        <div key={f.name} className="grid gap-1.5">
          <label htmlFor={f.name} className="text-sm font-medium">{f.label}</label>
          <input
            id={f.name}
            name={f.name}
            type="number"
            min={0}
            step={1}
            defaultValue={initial[f.name]}
            className="rounded-md border px-3 py-2 text-sm"
          />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {pending ? "Saving…" : "Save delivery pricing"}
        </button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create the read-only payment table**

Create `app/_components/admin/settings/payment-methods-table.tsx`:

```tsx
import type { PaymentDiagnostic } from "@/app/_lib/payments/diagnostics";

function Badge({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
      {ok ? yes : no}
    </span>
  );
}

export function PaymentMethodsTable({ rows }: { rows: PaymentDiagnostic[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Method</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Mode</th>
            <th className="px-4 py-2">Configured</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.method} className="border-t">
              <td className="px-4 py-2 font-medium">{r.label}</td>
              <td className="px-4 py-2"><Badge ok={r.enabled} yes="Enabled" no="Disabled" /></td>
              <td className="px-4 py-2">{r.mode ? <span className="uppercase">{r.mode}</span> : <span className="text-muted-foreground">—</span>}</td>
              <td className="px-4 py-2"><Badge ok={r.configured} yes="Yes" no="No" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        Read-only. Toggle providers via environment variables — credentials are never shown here.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Create the read-only system panel**

Create `app/_components/admin/settings/system-diagnostics.tsx`:

```tsx
import type { SystemDiagnostics } from "@/app/_lib/payments/diagnostics";

export function SystemDiagnosticsPanel({ data }: { data: SystemDiagnostics }) {
  return (
    <dl className="grid grid-cols-1 gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs uppercase text-muted-foreground">Environment</dt>
        <dd className="font-medium">{data.nodeEnv}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase text-muted-foreground">App URL</dt>
        <dd className="font-medium break-all">{data.appUrl}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="mb-1 text-xs uppercase text-muted-foreground">Providers</dt>
        <dd className="flex flex-wrap gap-2">
          {data.providers.map((p) => (
            <span key={p.method} className="rounded-md border px-2 py-1 text-xs">
              {p.method}: {p.mode ?? "—"} · {p.configured ? "configured" : "not configured"}
            </span>
          ))}
        </dd>
      </div>
    </dl>
  );
}
```

- [ ] **Step 5: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds (the new components are not yet imported by a page — they will be in Task 9; build still type-checks them).

- [ ] **Step 6: Commit**

```bash
git add app/_components/admin/settings
git commit -m "feat(settings): store-info + delivery-pricing forms, read-only payment/system panels"
```

---

## Task 9: Settings page

**Files:** Create `app/admin/settings/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/admin/settings/page.tsx`:

```tsx
import { getStoreSettings } from "@/app/_lib/store-settings";
import { getPaymentDiagnostics, getSystemDiagnostics } from "@/app/_lib/payments/diagnostics";
import { StoreInfoForm } from "@/app/_components/admin/settings/store-info-form";
import { DeliveryPricingForm } from "@/app/_components/admin/settings/delivery-pricing-form";
import { PaymentMethodsTable } from "@/app/_components/admin/settings/payment-methods-table";
import { SystemDiagnosticsPanel } from "@/app/_components/admin/settings/system-diagnostics";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-5 sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function AdminSettingsPage() {
  const settings = await getStoreSettings();
  const payments = getPaymentDiagnostics();
  const system = getSystemDiagnostics();

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Section title="Store info" description="Used across the storefront, emails, and order documents.">
        <StoreInfoForm
          initial={{
            storeName: settings.storeName,
            supportEmail: settings.supportEmail,
            supportPhone: settings.supportPhone,
            businessAddress: settings.businessAddress,
          }}
        />
      </Section>

      <Section title="Delivery pricing" description="Zone rates and the free-delivery threshold.">
        <DeliveryPricingForm
          initial={{
            colomboDeliveryCost: settings.colomboDeliveryCost,
            otherDeliveryCost: settings.otherDeliveryCost,
            freeDeliveryThreshold: settings.freeDeliveryThreshold,
          }}
        />
      </Section>

      <Section title="Payment methods" description="Read-only. Configured via environment variables.">
        <PaymentMethodsTable rows={payments} />
      </Section>

      <Section title="System" description="Read-only environment diagnostics.">
        <SystemDiagnosticsPanel data={system} />
      </Section>
    </section>
  );
}
```

- [ ] **Step 2: Verify the build + route**

Run: `npm run build`
Expected: build succeeds and lists `/admin/settings` among the routes.

- [ ] **Step 3: Commit**

```bash
git add app/admin/settings/page.tsx
git commit -m "feat(settings): /admin/settings page composing all four sections"
```

---

## Task 10: e2e — `admin-settings.spec.ts`

**Files:** Create `tests/e2e/admin-settings.spec.ts`

- [ ] **Step 1: Write the e2e spec**

Create `tests/e2e/admin-settings.spec.ts` (mirrors the `admin-customers` login helper + fixtures):

```ts
import { test, expect } from "@playwright/test";
import { ADMIN, CUSTOMER, seedTestUsers, deleteTestUsers } from "./fixtures/users";

test.beforeAll(async () => {
  await seedTestUsers();
});

test.afterAll(async () => {
  await deleteTestUsers();
});

async function login(page: import("@playwright/test").Page, who: { email: string; password: string }) {
  await page.goto("/login?callbackUrl=/about");
  await page.fill("#email", who.email);
  await page.fill("#password", who.password);
  await Promise.all([page.waitForURL("/about"), page.click('button[type="submit"]')]);
}

test("non-admin is redirected away from settings", async ({ page }) => {
  await login(page, CUSTOMER);
  await page.goto("/admin/settings");
  await expect(page).not.toHaveURL(/\/admin\/settings/);
});

test("settings renders all four sections; payment table is read-only with no secrets", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  for (const t of ["Store info", "Delivery pricing", "Payment methods", "System"]) {
    await expect(page.getByRole("heading", { name: t })).toBeVisible();
  }
  // Payment table shows status, not credentials.
  await expect(page.getByText("Read-only. Toggle providers")).toBeVisible();
});

test("editing the free-delivery threshold updates customer-facing copy", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/admin/settings");

  await page.fill("#freeDeliveryThreshold", "9000");
  await page.getByRole("button", { name: /Save delivery pricing/ }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  // The announcement bar (every page) now advertises the new threshold.
  await page.goto("/");
  await expect(page.getByText(/Free shipping over/)).toContainText("9,000");

  // Restore the default so the suite is idempotent.
  await page.goto("/admin/settings");
  await page.fill("#freeDeliveryThreshold", "5000");
  await page.getByRole("button", { name: /Save delivery pricing/ }).click();
  await expect(page.getByText("Saved")).toBeVisible();
});
```

> Check `tests/e2e/fixtures/users.ts` exports a `CUSTOMER` fixture; the `admin-customers` suite imports `ADMIN`. If `CUSTOMER` is absent, add a non-admin seeded user there (mirroring `ADMIN`) as a one-line fixture addition, or reuse an existing non-admin fixture name.

- [ ] **Step 2: Run the e2e spec**

Run: `npx playwright test tests/e2e/admin-settings.spec.ts`
Expected: PASS (3 tests). Requires the dev server / Playwright webServer per `playwright.config`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/admin-settings.spec.ts tests/e2e/fixtures/users.ts
git commit -m "test(settings): e2e for directory render, read-only payments, live threshold edit"
```

---

## Final Verification

- [ ] **Run the full unit suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Run the build**

Run: `npm run build`
Expected: succeeds; `/admin/settings` listed.

- [ ] **Manual smoke (optional)**: visit `/admin/settings`, edit a delivery price, confirm the cart estimate + announcement bar reflect it; confirm the payment table shows status only.

---

## Notes for the Implementer

- **Secrets:** the no-secrets invariant in `diagnostics.ts` is a hard requirement — the Task 4 test asserts it. Never add a field that echoes an env value verbatim.
- **Forward-only pricing:** never backfill or recompute existing orders on a price change.
- **Capability vs. visibility:** payment enablement stays env-driven in this version; the Settings page only *reports* it. Editable toggles are a deliberate fast-follow.
- **Hook ordering:** `useDeliveryConfig()` must be called before any early `return` in the components it's added to (React rules-of-hooks).
