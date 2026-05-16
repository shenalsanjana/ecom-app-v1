# Curfox Courier + Dispatch Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the checkout COD path through a Curfox-powered Royal Express courier booking, capture the airwaybill PDF, and email it to fulfilment via Brevo SMTP — with non-blocking failure handling so customers always see success.

**Architecture:** Thin orchestrator (`actions.ts`) calls focused modules — a typed Curfox HTTP client with token caching, a DB-backed city lookup, and three new mailer helpers — each with isolated failure handling that emits admin alerts but never throws back to the customer. Prepaid orders skip courier entirely and leave a marked hook point for future payment-webhook integration.

**Tech Stack:** Next.js 16 (Server Actions, App Router), Prisma 6 + Postgres, Zod 4 (single source of truth), nodemailer 7 (Brevo SMTP), vitest (added in Task 1), TypeScript 5, PowerShell-friendly commands.

**Source spec:** `docs/superpowers/specs/2026-05-16-curfox-courier-email-design.md`

---

## Task 0: Pre-flight — branch + env baseline

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: Create a feature branch off develop**

```powershell
git fetch origin
git checkout develop
git pull --ff-only
git checkout -b feat/curfox-courier-dispatch
```

Expected: new branch `feat/curfox-courier-dispatch` based on `origin/develop`.

- [ ] **Step 2: Update `.env.local.example` with the new vars**

Append the following block to `.env.local.example` (keep existing content):

```
# Curfox courier (Royal Express) — endpoint configuration. All have
# safe defaults so checkout still works when ROYAL_EXPRESS_ENABLED="false".
CURFOX_BASE_URL="https://v2-operations.api.curfox.com"
CURFOX_LOGIN_BASE_URL="https://v1.api.curfox.com"
CURFOX_ORDER_CREATE_PATH="/api/merchant/order"
CURFOX_WAYBILL_PDF_PATH_TEMPLATE="/api/merchant/order/{id}/waybill"
CURFOX_CITIES_PATH="/api/merchant/city"
CURFOX_ORIGIN_CITY_ID="1500"
CURFOX_ORIGIN_WAREHOUSE_ID="78"
CURFOX_DEFAULT_WEIGHT_KG="1"

# Tenant added in addition to the existing ROYAL_EXPRESS_* block above.
ROYAL_EXPRESS_TENANT="royalexpress"
```

Also ensure `ROYAL_EXPRESS_TENANT="royalexpress"` appears with the existing `ROYAL_EXPRESS_*` block. If it is already present elsewhere, remove the duplicate at the bottom.

- [ ] **Step 3: Commit**

```powershell
git add .env.local.example
git commit -m "chore(env): document Curfox endpoint configuration vars"
```

---

## Task 1: Install vitest + scaffold test runner

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `app/_lib/__tests__/sanity.test.ts`

- [ ] **Step 1: Install vitest as a dev dependency**

```powershell
npm install --save-dev vitest @vitest/coverage-v8
```

Expected: `vitest` and `@vitest/coverage-v8` appear in `devDependencies` in `package.json`.

- [ ] **Step 2: Add npm scripts**

Edit `package.json` `scripts` block to add:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

Place them between `"lint"` and `"check:contrast"` so the block stays alphabetically loose but logical.

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["app/**/__tests__/**/*.test.ts", "app/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["app/**/*.ts"],
      exclude: ["app/**/__tests__/**", "**/*.test.ts", "**/*.tsx"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 4: Write a sanity test**

Create `app/_lib/__tests__/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it to confirm setup**

```powershell
npm test
```

Expected: 1 passed test. If the runner can't resolve `@/` aliases, fix `vitest.config.ts`.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts app/_lib/__tests__/sanity.test.ts
git commit -m "chore(test): set up vitest with node env and @/ alias"
```

---

## Task 2: Prisma migration — Order columns + CurfoxCity model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev`

- [ ] **Step 1: Add columns to the `Order` model**

Edit `prisma/schema.prisma` — inside `model Order { ... }`, after `emailSent`, add:

```prisma
  // Curfox booking lifecycle
  courierWaybillNumber  String?
  courierBookedAt       DateTime?
  courierLastError      String?
  courierLastErrorAt    DateTime?
  dispatchPdfFetchedAt  DateTime?
  dispatchEmailSentAt   DateTime?
  adminAlertSentAt      DateTime?
```

(Postgres treats `String?` as `text` by default — no `@db.Text` needed in Prisma 6.)

- [ ] **Step 2: Add the `CurfoxCity` model**

Append to `prisma/schema.prisma` (after `PasswordResetToken`):

```prisma
model CurfoxCity {
  id                  Int      @id
  name                String
  defaultWarehouseId  Int?
  updatedAt           DateTime @updatedAt

  @@index([name])
}
```

- [ ] **Step 3: Run the migration**

```powershell
npx prisma migrate dev --name curfox-courier-fields
```

Expected: migration file created in `prisma/migrations/<timestamp>_curfox_courier_fields/`, and `npx prisma generate` runs automatically.

- [ ] **Step 4: Confirm Prisma client picks up the new types**

```powershell
npx tsc --noEmit
```

Expected: zero errors. If type errors appear referencing existing files that touch `prisma.order.update`, they should still compile — the new fields are optional.

- [ ] **Step 5: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add Curfox courier lifecycle columns + CurfoxCity model"
```

---

## Task 3: Curfox types & Zod schemas

**Files:**
- Create: `app/_lib/courier/curfox-types.ts`
- Create: `app/_lib/courier/__tests__/curfox-types.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `app/_lib/courier/__tests__/curfox-types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CurfoxLoginResponseSchema,
  CurfoxOrderResponseSchema,
  CurfoxCityListResponseSchema,
  CurfoxCreateOrderInputSchema,
} from "../curfox-types";

describe("CurfoxLoginResponseSchema", () => {
  it("accepts { token }", () => {
    expect(CurfoxLoginResponseSchema.parse({ token: "abc" })).toEqual({ token: "abc" });
  });
  it("accepts { access_token }", () => {
    expect(CurfoxLoginResponseSchema.parse({ access_token: "abc" })).toEqual({ access_token: "abc" });
  });
  it("accepts { data: { token } }", () => {
    expect(CurfoxLoginResponseSchema.parse({ data: { token: "abc" } })).toEqual({ data: { token: "abc" } });
  });
  it("rejects empty token", () => {
    expect(() => CurfoxLoginResponseSchema.parse({ token: "" })).toThrow();
  });
});

describe("CurfoxOrderResponseSchema", () => {
  it("parses the sample order create response", () => {
    const sample = {
      data: {
        id: 9249611,
        waybill_number: "RA03870247",
        order_no: "116",
        customer_name: "Oshini Yapa",
        cod: 2440,
        delivery_charge: 450,
      },
    };
    const parsed = CurfoxOrderResponseSchema.parse(sample);
    expect(parsed.data.waybill_number).toBe("RA03870247");
    expect(parsed.data.id).toBe(9249611);
  });
  it("rejects missing waybill_number", () => {
    expect(() =>
      CurfoxOrderResponseSchema.parse({
        data: { id: 1, order_no: "1", customer_name: "X", cod: 0 },
      }),
    ).toThrow();
  });
});

describe("CurfoxCityListResponseSchema", () => {
  it("parses a list with one city", () => {
    const out = CurfoxCityListResponseSchema.parse({
      data: [{ id: 1500, name: "Kotte", default_warehouse_id: 78 }],
    });
    expect(out.data[0].id).toBe(1500);
  });
});

describe("CurfoxCreateOrderInputSchema", () => {
  it("accepts a valid minimal payload", () => {
    const ok = CurfoxCreateOrderInputSchema.parse({
      order_no: "ORD-1",
      customer_name: "Jane Doe",
      customer_address: "1 Walls Lane, Colombo 15",
      customer_phone: "+94778207539",
      weight: 1,
      origin_city_id: 1500,
      origin_warehouse_id: 78,
      destination_city_id: 419,
      cod: 2440,
      description: "Clothes",
    });
    expect(ok.cod).toBe(2440);
  });
  it("rejects negative cod", () => {
    expect(() =>
      CurfoxCreateOrderInputSchema.parse({
        order_no: "ORD-1",
        customer_name: "Jane",
        customer_address: "addr",
        customer_phone: "+94770000000",
        weight: 1,
        origin_city_id: 1500,
        origin_warehouse_id: 78,
        destination_city_id: 419,
        cod: -1,
        description: "X",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests — confirm they fail**

```powershell
npm test -- app/_lib/courier/__tests__/curfox-types.test.ts
```

Expected: FAIL — cannot resolve `../curfox-types`.

- [ ] **Step 3: Implement the types module**

Create `app/_lib/courier/curfox-types.ts`:

```ts
// app/_lib/courier/curfox-types.ts
import { z } from "zod";

// ── inbound: login response (3 observed shapes) ──────────────────────────
export const CurfoxLoginResponseSchema = z.union([
  z.object({ token: z.string().min(1) }).passthrough(),
  z.object({ access_token: z.string().min(1) }).passthrough(),
  z.object({ data: z.object({ token: z.string().min(1) }).passthrough() }).passthrough(),
]);

// ── inbound: create-order response (matches sample data) ─────────────────
export const CurfoxOrderResponseSchema = z.object({
  data: z.object({
    id: z.number().int(),
    waybill_number: z.string().min(1),
    order_no: z.string(),
    customer_name: z.string(),
    cod: z.number(),
    delivery_charge: z.number().nullable().optional(),
    order_current_status: z
      .object({ key: z.string(), name: z.string() })
      .passthrough()
      .optional(),
  }).passthrough(),
});

// ── inbound: city list ──────────────────────────────────────────────────
export const CurfoxCitySchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  default_warehouse_id: z.number().int().nullable().optional(),
}).passthrough();

export const CurfoxCityListResponseSchema = z.object({
  data: z.array(CurfoxCitySchema),
}).passthrough();

// ── outbound: create-order payload ──────────────────────────────────────
export const CurfoxCreateOrderInputSchema = z.object({
  order_no: z.string().min(1),
  customer_name: z.string().min(1).max(100),
  customer_address: z.string().min(1).max(500),
  customer_phone: z.string().min(10),
  customer_secondary_phone: z.string().nullable().optional(),
  customer_email: z.string().email().nullable().optional(),
  weight: z.number().positive(),
  origin_city_id: z.number().int().positive(),
  origin_warehouse_id: z.number().int().positive(),
  destination_city_id: z.number().int().positive(),
  destination_warehouse_id: z.number().int().positive().nullable().optional(),
  cod: z.number().nonnegative(),
  description: z.string().min(1).max(200),
  // TODO(curfox-verify): field name may be `note` / `merchant_remark` instead
  remark: z.string().max(500).nullable().optional(),
});

// ── inferred types ──────────────────────────────────────────────────────
export type CurfoxCreateOrderInput = z.infer<typeof CurfoxCreateOrderInputSchema>;
export type CurfoxCreatedOrder = z.infer<typeof CurfoxOrderResponseSchema>["data"];
export type CurfoxCity = z.infer<typeof CurfoxCitySchema>;
```

- [ ] **Step 4: Re-run tests — confirm they pass**

```powershell
npm test -- app/_lib/courier/__tests__/curfox-types.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add app/_lib/courier/curfox-types.ts app/_lib/courier/__tests__/curfox-types.test.ts
git commit -m "feat(curfox): add Zod schemas for login/order/city payloads"
```

---

## Task 4: Curfox client — login, token cache, authedFetch

**Files:**
- Create: `app/_lib/courier/curfox-client.ts`
- Create: `app/_lib/courier/__tests__/curfox-client-auth.test.ts`

This task only covers auth + token caching. Order create, PDF fetch, and city list come in subsequent tasks (separate commits keep each diff reviewable).

- [ ] **Step 1: Write failing tests for token caching and 401 retry**

Create `app/_lib/courier/__tests__/curfox-client-auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// __test_only_resetTokenCache lets each test start fresh
import {
  CurfoxError,
  __test_only_getToken,
  __test_only_resetTokenCache,
  __test_only_authedFetch,
} from "../curfox-client";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  __test_only_resetTokenCache();
  process.env.ROYAL_EXPRESS_USER = "test@example.com";
  process.env.ROYAL_EXPRESS_PASS = "secret";
  process.env.ROYAL_EXPRESS_TENANT = "royalexpress";
  process.env.CURFOX_LOGIN_BASE_URL = "https://login.example.com";
  process.env.CURFOX_BASE_URL = "https://api.example.com";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

function mockFetch(responses: Array<{ status: number; body: unknown; contentType?: string }>) {
  let i = 0;
  globalThis.fetch = vi.fn(async () => {
    const r = responses[i++];
    if (!r) throw new Error("fetch called more times than expected");
    const ct = r.contentType ?? "application/json";
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": ct },
    });
  }) as typeof fetch;
}

describe("getToken", () => {
  it("logs in and caches the token", async () => {
    mockFetch([{ status: 200, body: { token: "abc" } }]);
    const t1 = await __test_only_getToken();
    const t2 = await __test_only_getToken();
    expect(t1).toBe("abc");
    expect(t2).toBe("abc");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("supports { access_token } shape", async () => {
    mockFetch([{ status: 200, body: { access_token: "xyz" } }]);
    expect(await __test_only_getToken()).toBe("xyz");
  });

  it("supports nested { data: { token } } shape", async () => {
    mockFetch([{ status: 200, body: { data: { token: "nested" } } }]);
    expect(await __test_only_getToken()).toBe("nested");
  });

  it("throws CurfoxError(step=login) on non-2xx", async () => {
    mockFetch([{ status: 401, body: { message: "bad creds" } }]);
    await expect(__test_only_getToken()).rejects.toMatchObject({
      name: "CurfoxError",
      step: "login",
      status: 401,
    });
  });

  it("sends X-Tenant header on login", async () => {
    mockFetch([{ status: 200, body: { token: "abc" } }]);
    await __test_only_getToken();
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const init = call[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Tenant"]).toBe("royalexpress");
  });
});

describe("authedFetch", () => {
  it("retries once on 401 then propagates next failure", async () => {
    mockFetch([
      { status: 200, body: { token: "stale" } }, // initial login
      { status: 401, body: { message: "expired" } }, // first call: 401
      { status: 200, body: { token: "fresh" } }, // re-login
      { status: 500, body: { message: "boom" } }, // retry: 500
    ]);
    const res = await __test_only_authedFetch("https://api.example.com/anything", { method: "GET" });
    expect(res.status).toBe(500);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it("passes Bearer + X-Tenant on every call", async () => {
    mockFetch([
      { status: 200, body: { token: "abc" } },
      { status: 200, body: { ok: true } },
    ]);
    await __test_only_authedFetch("https://api.example.com/x", { method: "GET" });
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer abc");
    expect(headers["X-Tenant"]).toBe("royalexpress");
  });
});

describe("CurfoxError", () => {
  it("carries step + status + responseBody", () => {
    const e = new CurfoxError("nope", "create-order", 422, "{\"errors\":...}");
    expect(e.step).toBe("create-order");
    expect(e.status).toBe(422);
    expect(e.responseBody).toBe("{\"errors\":...}");
  });
});
```

- [ ] **Step 2: Run — confirm failure**

```powershell
npm test -- app/_lib/courier/__tests__/curfox-client-auth.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client (auth-only surface)**

Create `app/_lib/courier/curfox-client.ts`:

```ts
// app/_lib/courier/curfox-client.ts
import { CurfoxLoginResponseSchema } from "./curfox-types";

export class CurfoxError extends Error {
  readonly step: "login" | "create-order" | "fetch-pdf" | "list-cities";
  readonly status?: number;
  readonly responseBody?: string;
  constructor(
    message: string,
    step: "login" | "create-order" | "fetch-pdf" | "list-cities",
    status?: number,
    responseBody?: string,
  ) {
    super(message);
    this.name = "CurfoxError";
    this.step = step;
    this.status = status;
    this.responseBody = responseBody;
  }
}

const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes
let cachedToken: { value: string; expiresAt: number } | null = null;

function loginBaseUrl(): string {
  return process.env.CURFOX_LOGIN_BASE_URL ?? "https://v1.api.curfox.com";
}
function baseUrl(): string {
  return process.env.CURFOX_BASE_URL ?? "https://v2-operations.api.curfox.com";
}
function tenant(): string {
  return process.env.ROYAL_EXPRESS_TENANT ?? "royalexpress";
}

function parseTokenFromLoginResponse(body: unknown): string {
  const parsed = CurfoxLoginResponseSchema.parse(body);
  if ("token" in parsed) return parsed.token;
  if ("access_token" in parsed) return parsed.access_token;
  return parsed.data.token;
}

async function login(): Promise<string> {
  const user = process.env.ROYAL_EXPRESS_USER;
  const pass = process.env.ROYAL_EXPRESS_PASS;
  if (!user || !pass) {
    throw new CurfoxError(
      "ROYAL_EXPRESS_USER / ROYAL_EXPRESS_PASS not set",
      "login",
    );
  }
  const url = `${loginBaseUrl()}/api/public/merchant/login`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Tenant": tenant(),
      },
      body: JSON.stringify({ email: user, password: pass }),
    });
  } catch (err) {
    throw new CurfoxError(
      `Curfox login network error: ${err instanceof Error ? err.message : String(err)}`,
      "login",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CurfoxError(
      `Curfox login failed: HTTP ${res.status}`,
      "login",
      res.status,
      body,
    );
  }
  const json = await res.json();
  return parseTokenFromLoginResponse(json);
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }
  const value = await login();
  cachedToken = { value, expiresAt: Date.now() + TOKEN_TTL_MS };
  return value;
}

function withAuth(init: RequestInit | undefined, token: string): RequestInit {
  return {
    ...(init ?? {}),
    headers: {
      ...((init?.headers as Record<string, string>) ?? {}),
      Authorization: `Bearer ${token}`,
      "X-Tenant": tenant(),
      Accept: "application/json",
    },
  };
}

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  let token = await getToken();
  let res = await fetch(url, withAuth(init, token));
  if (res.status === 401) {
    cachedToken = null;
    token = await getToken();
    res = await fetch(url, withAuth(init, token));
  }
  return res;
}

// Internal helpers used by tests only — not part of the public surface.
// They are intentionally underscore-prefixed and excluded from re-exports.
export const __test_only_resetTokenCache = (): void => {
  cachedToken = null;
};
export const __test_only_getToken = getToken;
export const __test_only_authedFetch = authedFetch;

// Internal exports used by sibling functions in later tasks
export { getToken as _getToken, authedFetch as _authedFetch, baseUrl as _baseUrl };
```

- [ ] **Step 4: Run tests — confirm pass**

```powershell
npm test -- app/_lib/courier/__tests__/curfox-client-auth.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add app/_lib/courier/curfox-client.ts app/_lib/courier/__tests__/curfox-client-auth.test.ts
git commit -m "feat(curfox): add HTTP client with token cache + 401 retry"
```

---

## Task 5: Curfox client — createOrder + fetchWaybillPdf + listCities

**Files:**
- Modify: `app/_lib/courier/curfox-client.ts`
- Create: `app/_lib/courier/__tests__/curfox-client-ops.test.ts`

- [ ] **Step 1: Write failing tests for the three operations**

Create `app/_lib/courier/__tests__/curfox-client-ops.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createCurfoxOrder,
  fetchCurfoxWaybillPdf,
  listCurfoxCities,
  CurfoxError,
  __test_only_resetTokenCache,
} from "../curfox-client";
import type { CurfoxCreateOrderInput } from "../curfox-types";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

const VALID_INPUT: CurfoxCreateOrderInput = {
  order_no: "ORD-1",
  customer_name: "Jane Doe",
  customer_address: "1 Walls Lane, Colombo 15",
  customer_phone: "+94778207539",
  weight: 1,
  origin_city_id: 1500,
  origin_warehouse_id: 78,
  destination_city_id: 419,
  cod: 2440,
  description: "Clothes",
};

beforeEach(() => {
  __test_only_resetTokenCache();
  process.env.ROYAL_EXPRESS_USER = "test@example.com";
  process.env.ROYAL_EXPRESS_PASS = "secret";
  process.env.ROYAL_EXPRESS_TENANT = "royalexpress";
  process.env.CURFOX_LOGIN_BASE_URL = "https://login.example.com";
  process.env.CURFOX_BASE_URL = "https://api.example.com";
  process.env.CURFOX_ORDER_CREATE_PATH = "/api/merchant/order";
  process.env.CURFOX_WAYBILL_PDF_PATH_TEMPLATE = "/api/merchant/order/{id}/waybill";
  process.env.CURFOX_CITIES_PATH = "/api/merchant/city";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

function mockFetch(responses: Array<{ status: number; body: unknown | Uint8Array; contentType?: string }>) {
  let i = 0;
  globalThis.fetch = vi.fn(async () => {
    const r = responses[i++];
    if (!r) throw new Error("fetch called more times than expected");
    const ct = r.contentType ?? "application/json";
    const body =
      r.body instanceof Uint8Array
        ? r.body
        : typeof r.body === "string"
          ? r.body
          : JSON.stringify(r.body);
    return new Response(body, { status: r.status, headers: { "content-type": ct } });
  }) as typeof fetch;
}

describe("createCurfoxOrder", () => {
  it("posts to the configured path and returns the parsed data", async () => {
    mockFetch([
      { status: 200, body: { token: "abc" } },
      {
        status: 201,
        body: {
          data: {
            id: 9249611,
            waybill_number: "RA03870247",
            order_no: "ORD-1",
            customer_name: "Jane Doe",
            cod: 2440,
          },
        },
      },
    ]);
    const out = await createCurfoxOrder(VALID_INPUT);
    expect(out.waybill_number).toBe("RA03870247");
    expect(out.id).toBe(9249611);

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(call[0]).toBe("https://api.example.com/api/merchant/order");
  });

  it("throws CurfoxError(step=create-order) on 422 with full body", async () => {
    mockFetch([
      { status: 200, body: { token: "abc" } },
      { status: 422, body: { message: "address too long" } },
    ]);
    await expect(createCurfoxOrder(VALID_INPUT)).rejects.toMatchObject({
      name: "CurfoxError",
      step: "create-order",
      status: 422,
    });
  });
});

describe("fetchCurfoxWaybillPdf", () => {
  it("returns a Buffer when response is application/pdf", async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    mockFetch([
      { status: 200, body: { token: "abc" } },
      { status: 200, body: pdfBytes, contentType: "application/pdf" },
    ]);
    const buf = await fetchCurfoxWaybillPdf(9249611, "RA03870247");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("follows JSON-wrapped download url", async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    mockFetch([
      { status: 200, body: { token: "abc" } },
      { status: 200, body: { url: "https://files.example.com/waybill.pdf" } },
      { status: 200, body: pdfBytes, contentType: "application/pdf" },
    ]);
    const buf = await fetchCurfoxWaybillPdf(9249611, "RA03870247");
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("throws CurfoxError(step=fetch-pdf) on unexpected content-type", async () => {
    mockFetch([
      { status: 200, body: { token: "abc" } },
      { status: 200, body: "<html>nope</html>", contentType: "text/html" },
    ]);
    await expect(fetchCurfoxWaybillPdf(1, "X")).rejects.toMatchObject({
      name: "CurfoxError",
      step: "fetch-pdf",
    });
  });

  it("substitutes both {id} and {waybill_number} in the template", async () => {
    process.env.CURFOX_WAYBILL_PDF_PATH_TEMPLATE = "/print/{waybill_number}/order/{id}";
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    mockFetch([
      { status: 200, body: { token: "abc" } },
      { status: 200, body: pdfBytes, contentType: "application/pdf" },
    ]);
    await fetchCurfoxWaybillPdf(9249611, "RA03870247");
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(url).toBe("https://api.example.com/print/RA03870247/order/9249611");
  });
});

describe("listCurfoxCities", () => {
  it("returns the parsed array", async () => {
    mockFetch([
      { status: 200, body: { token: "abc" } },
      {
        status: 200,
        body: {
          data: [
            { id: 1500, name: "Kotte", default_warehouse_id: 78 },
            { id: 419, name: "Ettampitiya", default_warehouse_id: 7 },
          ],
        },
      },
    ]);
    const cities = await listCurfoxCities();
    expect(cities).toHaveLength(2);
    expect(cities[0].id).toBe(1500);
  });

  it("throws CurfoxError(step=list-cities) on 500", async () => {
    mockFetch([
      { status: 200, body: { token: "abc" } },
      { status: 500, body: { message: "boom" } },
    ]);
    await expect(listCurfoxCities()).rejects.toMatchObject({
      name: "CurfoxError",
      step: "list-cities",
    });
  });
});
```

- [ ] **Step 2: Run — confirm fail**

```powershell
npm test -- app/_lib/courier/__tests__/curfox-client-ops.test.ts
```

Expected: FAIL — functions not exported yet.

- [ ] **Step 3: Add the three operations to `curfox-client.ts`**

Two parts: extend the existing `import` line at the top of the file, then append the function bodies.

**Part A — replace the existing import** at the top of `app/_lib/courier/curfox-client.ts`:

```ts
import { CurfoxLoginResponseSchema } from "./curfox-types";
```

with the extended version:

```ts
import {
  CurfoxLoginResponseSchema,
  CurfoxCreateOrderInputSchema,
  CurfoxOrderResponseSchema,
  CurfoxCityListResponseSchema,
} from "./curfox-types";
import type { CurfoxCreateOrderInput, CurfoxCreatedOrder, CurfoxCity } from "./curfox-types";
```

**Part B — append the following to the bottom of the file** (after the test-only exports from Task 4):

```ts
function orderCreatePath(): string {
  return process.env.CURFOX_ORDER_CREATE_PATH ?? "/api/merchant/order";
}
function waybillPdfPathTemplate(): string {
  return process.env.CURFOX_WAYBILL_PDF_PATH_TEMPLATE ?? "/api/merchant/order/{id}/waybill";
}
function citiesPath(): string {
  return process.env.CURFOX_CITIES_PATH ?? "/api/merchant/city";
}

function redactPhone(phone: string): string {
  if (phone.length <= 4) return "****";
  return phone.slice(0, -4) + "****";
}

export async function createCurfoxOrder(input: CurfoxCreateOrderInput): Promise<CurfoxCreatedOrder> {
  const payload = CurfoxCreateOrderInputSchema.parse(input);
  const url = `${baseUrl()}${orderCreatePath()}`;
  let res: Response;
  try {
    res = await authedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new CurfoxError(
      `Curfox create-order network error: ${err instanceof Error ? err.message : String(err)}`,
      "create-order",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[curfox] create-order failed", {
      status: res.status,
      body,
      payload: { ...payload, customer_phone: redactPhone(payload.customer_phone) },
    });
    throw new CurfoxError(
      `Curfox create-order failed: HTTP ${res.status}`,
      "create-order",
      res.status,
      body,
    );
  }
  const json = await res.json();
  const parsed = CurfoxOrderResponseSchema.parse(json);
  return parsed.data;
}

export async function fetchCurfoxWaybillPdf(
  orderId: number,
  waybillNumber: string,
): Promise<Buffer> {
  const template = waybillPdfPathTemplate();
  const path = template
    .replace("{id}", String(orderId))
    .replace("{waybill_number}", waybillNumber);
  const url = `${baseUrl()}${path}`;

  let res: Response;
  try {
    res = await authedFetch(url, { method: "GET" });
  } catch (err) {
    throw new CurfoxError(
      `Curfox waybill PDF network error: ${err instanceof Error ? err.message : String(err)}`,
      "fetch-pdf",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CurfoxError(
      `Curfox waybill PDF failed: HTTP ${res.status}`,
      "fetch-pdf",
      res.status,
      body,
    );
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/pdf")) {
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }
  if (ct.includes("application/json")) {
    const j = await res.json();
    const downloadUrl =
      (j as { url?: string }).url ??
      (j as { data?: { url?: string } }).data?.url ??
      (j as { pdf_url?: string }).pdf_url;
    if (!downloadUrl) {
      throw new CurfoxError(
        "Waybill PDF: no url in JSON response",
        "fetch-pdf",
        res.status,
      );
    }
    const pdfRes = await fetch(downloadUrl);
    if (!pdfRes.ok) {
      throw new CurfoxError(
        `Waybill PDF download failed: HTTP ${pdfRes.status}`,
        "fetch-pdf",
        pdfRes.status,
      );
    }
    const ab = await pdfRes.arrayBuffer();
    return Buffer.from(ab);
  }
  throw new CurfoxError(
    `Waybill PDF: unexpected content-type ${ct}`,
    "fetch-pdf",
    res.status,
  );
}

export async function listCurfoxCities(): Promise<CurfoxCity[]> {
  const url = `${baseUrl()}${citiesPath()}`;
  let res: Response;
  try {
    res = await authedFetch(url, { method: "GET" });
  } catch (err) {
    throw new CurfoxError(
      `Curfox list-cities network error: ${err instanceof Error ? err.message : String(err)}`,
      "list-cities",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CurfoxError(
      `Curfox list-cities failed: HTTP ${res.status}`,
      "list-cities",
      res.status,
      body,
    );
  }
  const json = await res.json();
  const parsed = CurfoxCityListResponseSchema.parse(json);
  return parsed.data;
}
```

- [ ] **Step 4: Run tests**

```powershell
npm test -- app/_lib/courier/__tests__/curfox-client-ops.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add app/_lib/courier/curfox-client.ts app/_lib/courier/__tests__/curfox-client-ops.test.ts
git commit -m "feat(curfox): add createOrder, fetchWaybillPdf, listCities"
```

---

## Task 6: City map — DB-backed lookups + refresh

**Files:**
- Create: `app/_lib/courier/city-map.ts`
- Create: `app/_lib/courier/__tests__/city-map.test.ts`

The city-map uses Prisma. Tests use a small in-memory fake Prisma client (DI'd via the function signatures) to avoid needing a real DB in the test runner.

- [ ] **Step 1: Write failing tests**

Create `app/_lib/courier/__tests__/city-map.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  resolveCurfoxCity,
  refreshCurfoxCityMap,
  listAvailableCities,
  __test_only_setPrisma,
  __test_only_setCurfoxClient,
} from "../city-map";

function makePrismaMock(rows: Array<{ id: number; name: string; defaultWarehouseId: number | null }>) {
  let store = rows.slice();
  return {
    curfoxCity: {
      findFirst: vi.fn(async ({ where }: { where: { name: { equals: string; mode: string } } }) => {
        const target = where.name.equals.toLowerCase();
        return store.find((r) => r.name.toLowerCase() === target) ?? null;
      }),
      findMany: vi.fn(async () => store.slice().sort((a, b) => a.name.localeCompare(b.name))),
      deleteMany: vi.fn(async () => {
        const c = store.length;
        store = [];
        return { count: c };
      }),
      createMany: vi.fn(async ({ data }: { data: Array<{ id: number; name: string; defaultWarehouseId: number | null }> }) => {
        store.push(...data);
        return { count: data.length };
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      curfoxCity: {
        deleteMany: async () => ({ count: store.length }),
        createMany: async ({ data }: { data: Array<{ id: number; name: string; defaultWarehouseId: number | null }> }) => {
          store.length = 0;
          store.push(...data);
          return { count: data.length };
        },
      },
    })),
  };
}

describe("resolveCurfoxCity", () => {
  it("returns the destination ids for an exact match", async () => {
    __test_only_setPrisma(makePrismaMock([{ id: 1500, name: "Kotte", defaultWarehouseId: 78 }]) as unknown as never);
    const out = await resolveCurfoxCity("Kotte");
    expect(out).toEqual({ destinationCityId: 1500, destinationWarehouseId: 78 });
  });

  it("is case-insensitive", async () => {
    __test_only_setPrisma(makePrismaMock([{ id: 1500, name: "Kotte", defaultWarehouseId: 78 }]) as unknown as never);
    const out = await resolveCurfoxCity("kotte");
    expect(out?.destinationCityId).toBe(1500);
  });

  it("trims whitespace", async () => {
    __test_only_setPrisma(makePrismaMock([{ id: 1500, name: "Kotte", defaultWarehouseId: 78 }]) as unknown as never);
    const out = await resolveCurfoxCity("  Kotte  ");
    expect(out?.destinationCityId).toBe(1500);
  });

  it("returns null on miss", async () => {
    __test_only_setPrisma(makePrismaMock([{ id: 1500, name: "Kotte", defaultWarehouseId: 78 }]) as unknown as never);
    expect(await resolveCurfoxCity("Atlantis")).toBeNull();
  });
});

describe("refreshCurfoxCityMap", () => {
  it("wipes + repopulates from listCurfoxCities", async () => {
    const mock = makePrismaMock([{ id: 9999, name: "Stale", defaultWarehouseId: null }]);
    __test_only_setPrisma(mock as unknown as never);
    __test_only_setCurfoxClient({
      listCurfoxCities: async () => [
        { id: 1500, name: "Kotte", default_warehouse_id: 78 },
        { id: 419, name: "Ettampitiya", default_warehouse_id: 7 },
      ],
    });
    const out = await refreshCurfoxCityMap();
    expect(out.count).toBe(2);
    expect(mock.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("listAvailableCities", () => {
  it("returns id+name sorted by name", async () => {
    __test_only_setPrisma(
      makePrismaMock([
        { id: 419, name: "Ettampitiya", defaultWarehouseId: 7 },
        { id: 1500, name: "Kotte", defaultWarehouseId: 78 },
      ]) as unknown as never,
    );
    const out = await listAvailableCities();
    expect(out.map((c) => c.name)).toEqual(["Ettampitiya", "Kotte"]);
  });
});
```

- [ ] **Step 2: Run — confirm fail**

```powershell
npm test -- app/_lib/courier/__tests__/city-map.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `city-map.ts`**

Create `app/_lib/courier/city-map.ts`:

```ts
// app/_lib/courier/city-map.ts
import { prisma as defaultPrisma } from "@/app/_lib/prisma";
import { listCurfoxCities as defaultListCurfoxCities } from "./curfox-client";

// Dependency-injection seams (test-only). The default exports above are used
// in production; tests inject their own implementations via these setters.
type PrismaLike = typeof defaultPrisma;
type CurfoxClientLike = { listCurfoxCities: typeof defaultListCurfoxCities };

let prismaImpl: PrismaLike = defaultPrisma;
let curfoxImpl: CurfoxClientLike = { listCurfoxCities: defaultListCurfoxCities };

export const __test_only_setPrisma = (p: PrismaLike): void => {
  prismaImpl = p;
};
export const __test_only_setCurfoxClient = (c: CurfoxClientLike): void => {
  curfoxImpl = c;
};

export async function resolveCurfoxCity(
  cityName: string,
): Promise<{ destinationCityId: number; destinationWarehouseId: number | null } | null> {
  const trimmed = cityName.trim();
  if (!trimmed) return null;
  const row = await prismaImpl.curfoxCity.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (!row) return null;
  return {
    destinationCityId: row.id,
    destinationWarehouseId: row.defaultWarehouseId,
  };
}

export async function refreshCurfoxCityMap(): Promise<{ count: number }> {
  const fetched = await curfoxImpl.listCurfoxCities();
  await prismaImpl.$transaction(async (tx) => {
    await tx.curfoxCity.deleteMany({});
    await tx.curfoxCity.createMany({
      data: fetched.map((c) => ({
        id: c.id,
        name: c.name,
        defaultWarehouseId: c.default_warehouse_id ?? null,
      })),
    });
  });
  return { count: fetched.length };
}

export async function listAvailableCities(): Promise<Array<{ id: number; name: string }>> {
  const rows = await prismaImpl.curfoxCity.findMany({
    select: { id: true, name: true },
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run tests — confirm pass**

```powershell
npm test -- app/_lib/courier/__tests__/city-map.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add app/_lib/courier/city-map.ts app/_lib/courier/__tests__/city-map.test.ts
git commit -m "feat(curfox): add DB-backed city map with refresh + DI seams"
```

---

## Task 7: Mailer — test seam + dispatch / pending-prepaid / failure-alert helpers

**Files:**
- Modify: `app/_lib/mailer.ts`
- Create: `app/_lib/__tests__/mailer-dispatch.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/_lib/__tests__/mailer-dispatch.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nodemailer from "nodemailer";
import {
  sendDispatchNotificationEmail,
  sendPendingPrepaidNotificationEmail,
  sendAdminFailureAlertEmail,
  __setTestTransport,
} from "../mailer";
import type { OrderDetails } from "../mailer";

const originalEnv = { ...process.env };

const SAMPLE_ORDER: OrderDetails = {
  orderId: "ORD-TEST-1",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+94770000000",
  items: [{ name: "Cotton T-Shirt", size: "M", price: 1200, quantity: 2 }],
  subtotal: 2400,
  shipping: 40,
  total: 2440,
  shippingAddress: {
    line1: "1 Walls Lane",
    city: "Colombo",
    region: "Western Province",
    postalCode: "00100",
    country: "Sri Lanka",
  },
  paymentMethod: "COD",
  paymentMethodDisplay: "Cash on Delivery",
};

let captured: Array<{ message: string }>;
let transport: nodemailer.Transporter;

beforeEach(() => {
  captured = [];
  // jsonTransport captures the sent envelope to info.message as JSON
  transport = nodemailer.createTransport({ jsonTransport: true });
  __setTestTransport(transport);

  process.env.SMTP_HOST = "smtp.test";
  process.env.SMTP_USER = "u";
  process.env.SMTP_PASS = "p";
  process.env.SMTP_FROM = "Dressing Bear <a9e490001@smtp-brevo.com>";
  process.env.BRAND_EMAIL = "dressingbear@gmail.com";
  process.env.BRAND_NAME = "Dressing Bear";
});

afterEach(() => {
  __setTestTransport(null);
  process.env = { ...originalEnv };
});

async function send<T>(fn: () => Promise<T>): Promise<Record<string, unknown>> {
  // jsonTransport returns info.message as a JSON string of the envelope+headers+body
  const result = (await fn()) as unknown as { message?: string } | void;
  // mailer wraps sendMail; the easiest assertion path: spy on transport.sendMail
  // Instead, we attach a sendMail wrapper. See note in mailer.ts test seam.
  void result;
  return {};
}

describe("sendDispatchNotificationEmail", () => {
  it("sends to dressingbear@gmail.com from the Brevo address, with PDF attached", async () => {
    const sendMailSpy = vi_spy(transport, "sendMail");
    await sendDispatchNotificationEmail({
      order: SAMPLE_ORDER,
      waybillNumber: "RA03870247",
      pdfBuffer: Buffer.from("%PDF-fake"),
    });
    expect(sendMailSpy).toHaveBeenCalledOnce();
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.to).toBe("dressingbear@gmail.com");
    expect(opts.from).toBe("Dressing Bear <a9e490001@smtp-brevo.com>");
    expect(opts.replyTo).toBe("dressingbear@gmail.com");
    expect(opts.subject).toContain("RA03870247");
    expect(opts.subject).toContain("ORD-TEST-1");
    expect(opts.attachments).toEqual([
      { filename: "delivery-note.pdf", content: expect.any(Buffer) },
    ]);
  });

  it("omits attachment when pdfBuffer is undefined and notes it in the body", async () => {
    const sendMailSpy = vi_spy(transport, "sendMail");
    await sendDispatchNotificationEmail({
      order: SAMPLE_ORDER,
      waybillNumber: "RA03870247",
    });
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.attachments).toBeUndefined();
    expect(opts.text).toContain("PDF could not be fetched");
  });
});

describe("sendPendingPrepaidNotificationEmail", () => {
  it("uses [PENDING PAYMENT] subject prefix and never attaches a PDF", async () => {
    const sendMailSpy = vi_spy(transport, "sendMail");
    await sendPendingPrepaidNotificationEmail({
      order: { ...SAMPLE_ORDER, paymentMethod: "PAYHERE", paymentMethodDisplay: "PayHere" },
    });
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.subject).toMatch(/^\[PENDING PAYMENT\]/);
    expect(opts.attachments).toBeUndefined();
    expect(opts.text).toContain("Do NOT ship");
  });
});

describe("sendAdminFailureAlertEmail", () => {
  it("renders the failure template with step-specific next-action", async () => {
    const sendMailSpy = vi_spy(transport, "sendMail");
    await sendAdminFailureAlertEmail({
      orderId: "ORD-TEST-1",
      step: "curfox-create",
      reason: "HTTP 422 — address too long",
      errorDetail: '{"errors":{"customer_address":["max 500"]}}',
      order: SAMPLE_ORDER,
    });
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.subject).toContain("ORD-TEST-1");
    expect(opts.subject).toContain("curfox-create");
    expect(opts.text).toContain("HTTP 422 — address too long");
    expect(opts.text).toContain("customer_address");
    expect(opts.text).toContain("Book manually");
  });

  it("uses [URGENT] subject prefix for curfox-persist step", async () => {
    const sendMailSpy = vi_spy(transport, "sendMail");
    await sendAdminFailureAlertEmail({
      orderId: "ORD-TEST-1",
      step: "curfox-persist",
      reason: "DB write failed",
      order: SAMPLE_ORDER,
    });
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.subject).toContain("[URGENT]");
  });
});

// vitest spy helper inline to keep the test self-contained
import { vi } from "vitest";
function vi_spy<T extends object, K extends keyof T>(obj: T, key: K) {
  return vi.spyOn(obj, key as never) as unknown as ReturnType<typeof vi.fn>;
}
```

- [ ] **Step 2: Run — confirm fail**

```powershell
npm test -- app/_lib/__tests__/mailer-dispatch.test.ts
```

Expected: FAIL — new exports don't exist.

- [ ] **Step 3: Add the test transport seam at the top of `mailer.ts`**

In `app/_lib/mailer.ts`, modify `getTransport()` to honor an override, and export `__setTestTransport`. Find the existing block:

```ts
let cached: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter {
  if (cached) return cached;
  // ... existing implementation
}
```

Replace with:

```ts
let cached: nodemailer.Transporter | null = null;
let testTransport: nodemailer.Transporter | null = null;

export function __setTestTransport(t: nodemailer.Transporter | null): void {
  testTransport = t;
  // Clear cached so production code path is reachable again after a test that
  // sets and then clears the override.
  cached = null;
}

function getTransport(): nodemailer.Transporter {
  if (testTransport) return testTransport;
  if (cached) return cached;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local.",
    );
  }
  cached = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? Number(SMTP_PORT) : 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return cached;
}
```

- [ ] **Step 4: Add the three new email helpers at the bottom of `mailer.ts`**

```ts
// ── Dispatch / admin emails ─────────────────────────────────────────────

function formatItemsList(items: OrderItem[]): string {
  return items
    .map((it) => `  • ${it.name}${it.size ? ` (${it.size})` : ""} × ${it.quantity}`)
    .join("\n");
}

function formatAddress(addr: OrderDetails["shippingAddress"]): string {
  const lines = [
    addr.line1,
    addr.line2,
    `${addr.city}, ${addr.region} ${addr.postalCode}`,
    addr.country,
  ].filter(Boolean);
  return lines.join("\n  ");
}

export async function sendDispatchNotificationEmail(params: {
  order: OrderDetails;
  waybillNumber: string;
  pdfBuffer?: Buffer;
}): Promise<void> {
  const { order, waybillNumber, pdfBuffer } = params;
  const transport = getTransport();
  const brandEmail = requireBrandEmail();
  const from = requireFrom();

  const pdfNote = pdfBuffer
    ? "The printable airwaybill is attached as delivery-note.pdf."
    : "⚠ The PDF could not be fetched from Curfox — download it from the merchant portal at https://royalexpress.merchant.curfox.com/";

  const text = `A new COD order has been booked with Royal Express via Curfox.
${pdfNote}

ORDER:        ${order.orderId}
WAYBILL:      ${waybillNumber}
CUSTOMER:     ${order.customerName}
PHONE:        ${order.customerPhone ?? "n/a"}
COD AMOUNT:   LKR ${order.total.toFixed(2)}
DESTINATION:  ${order.shippingAddress.city}

ITEMS:
${formatItemsList(order.items)}

ADDRESS:
  ${formatAddress(order.shippingAddress)}

Print ${pdfBuffer ? "the attached delivery-note.pdf" : "the waybill from the Curfox portal"} and hand the parcel + label to the Royal Express pickup rider.

─────────────
Dressing Bear · automated dispatch
`.trim();

  await transport.sendMail({
    from,
    to: brandEmail,
    replyTo: brandReplyTo(),
    subject: `[Dispatch] Order ${order.orderId} — Waybill ${waybillNumber}`,
    text,
    attachments: pdfBuffer
      ? [{ filename: "delivery-note.pdf", content: pdfBuffer }]
      : undefined,
  });
}

export async function sendPendingPrepaidNotificationEmail(params: {
  order: OrderDetails;
}): Promise<void> {
  const { order } = params;
  const transport = getTransport();
  const brandEmail = requireBrandEmail();
  const from = requireFrom();
  const gateway = order.paymentMethodDisplay ?? order.paymentMethod;

  const text = `A new prepaid order has been placed. Courier booking is
DEFERRED until the payment gateway confirms the transaction.
Do NOT ship this order yet.

ORDER:        ${order.orderId}
CUSTOMER:     ${order.customerName}
PAYMENT:      ${gateway} (pending)
TOTAL:        LKR ${order.total.toFixed(2)}

ITEMS:
${formatItemsList(order.items)}

ADDRESS:
  ${formatAddress(order.shippingAddress)}

When the gateway confirms (or you confirm manually in the dashboard),
the courier booking will need to be triggered.

─────────────
Dressing Bear · automated dispatch
`.trim();

  await transport.sendMail({
    from,
    to: brandEmail,
    replyTo: brandReplyTo(),
    subject: `[PENDING PAYMENT] Order ${order.orderId} — LKR ${order.total.toFixed(2)} via ${gateway}`,
    text,
  });
}

const NEXT_ACTION_BY_STEP: Record<
  "city-lookup" | "curfox-login" | "curfox-create" | "curfox-persist" | "curfox-pdf",
  (orderId: string, ctx: { city?: string; waybillNumber?: string }) => string
> = {
  "city-lookup": (_o, c) =>
    `The city "${c.city ?? "<unknown>"}" is not in our Curfox city map. Either add it via the admin city-refresh route, or book this order manually in the Curfox portal.`,
  "curfox-login": () =>
    `Curfox login is failing. Verify ROYAL_EXPRESS_USER / ROYAL_EXPRESS_PASS in production env. Until fixed, all COD orders will need manual booking.`,
  "curfox-create": () =>
    `Curfox rejected the order payload. Review the response body above — likely an address-format or city-id mismatch. Book manually at https://royalexpress.merchant.curfox.com/`,
  "curfox-persist": (_o, c) =>
    `⚠ URGENT — Order was booked at Curfox (waybill ${c.waybillNumber ?? "<unknown>"}) but the local DB write failed. The order will not appear as "booked" in our system. Reconcile manually.`,
  "curfox-pdf": (_o, c) =>
    `The order was booked at Curfox (waybill ${c.waybillNumber ?? "<unknown>"}) but we could not fetch the printable PDF. Download it from https://royalexpress.merchant.curfox.com/`,
};

export async function sendAdminFailureAlertEmail(params: {
  orderId: string;
  step: "city-lookup" | "curfox-login" | "curfox-create" | "curfox-persist" | "curfox-pdf";
  reason: string;
  errorDetail?: string;
  order: OrderDetails;
  context?: { city?: string; waybillNumber?: string };
}): Promise<void> {
  const { orderId, step, reason, errorDetail, order, context } = params;
  const transport = getTransport();
  const brandEmail = requireBrandEmail();
  const from = requireFrom();

  const urgentPrefix = step === "curfox-persist" ? "[URGENT] " : "";
  const nextAction = NEXT_ACTION_BY_STEP[step](orderId, context ?? {});

  const text = `A Dressing Bear order saved successfully but the downstream
courier/dispatch step failed. The customer was NOT shown an
error. Manual action may be required.

ORDER DETAILS
─────────────
Order ID:      ${orderId}
Placed:        ${new Date().toISOString()}
Customer:      ${order.customerName}
Email:         ${order.customerEmail}
Phone:         ${order.customerPhone ?? "n/a"}
Payment:       ${order.paymentMethodDisplay ?? order.paymentMethod}
Total:         LKR ${order.total.toFixed(2)}

ITEMS:
${formatItemsList(order.items)}

SHIPPING ADDRESS
────────────────
  ${formatAddress(order.shippingAddress)}

FAILURE
───────
Step:          ${step}
Reason:        ${reason}
Server time:   ${new Date().toISOString()}

${errorDetail ? `DETAIL\n──────\n    ${errorDetail.split("\n").join("\n    ")}\n\n` : ""}NEXT ACTION
───────────
${nextAction}

─────────────
Dressing Bear · automated alert
`.trim();

  await transport.sendMail({
    from,
    to: brandEmail,
    replyTo: brandReplyTo(),
    subject: `${urgentPrefix}[Dressing Bear] Order ${orderId} — Curfox ${step} failed`,
    text,
  });
}
```

- [ ] **Step 5: Run tests — confirm pass**

```powershell
npm test -- app/_lib/__tests__/mailer-dispatch.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add app/_lib/mailer.ts app/_lib/__tests__/mailer-dispatch.test.ts
git commit -m "feat(mailer): add dispatch + pending-prepaid + failure-alert helpers with test seam"
```

---

## Task 8: Admin route — `POST /api/admin/curfox/refresh-cities`

**Files:**
- Create: `app/api/admin/curfox/refresh-cities/route.ts`
- Create: `app/api/admin/curfox/refresh-cities/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/admin/curfox/refresh-cities/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const refreshSpy = vi.fn();
vi.mock("@/app/_lib/courier/city-map", () => ({
  refreshCurfoxCityMap: refreshSpy,
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  refreshSpy.mockReset();
  process.env.AUTH_SECRET = "test-secret-value";
});
afterEach(() => {
  process.env = { ...originalEnv };
});

async function callRoute(headers: Record<string, string> = {}): Promise<Response> {
  const { POST } = await import("../route");
  return POST(new Request("http://localhost/api/admin/curfox/refresh-cities", {
    method: "POST",
    headers,
  }));
}

describe("POST /api/admin/curfox/refresh-cities", () => {
  it("rejects requests without Authorization header", async () => {
    const res = await callRoute();
    expect(res.status).toBe(401);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("rejects requests with wrong bearer", async () => {
    const res = await callRoute({ Authorization: "Bearer wrong" });
    expect(res.status).toBe(401);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("returns the count from refreshCurfoxCityMap on success", async () => {
    refreshSpy.mockResolvedValueOnce({ count: 42 });
    const res = await callRoute({ Authorization: "Bearer test-secret-value" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ count: 42 });
    expect(refreshSpy).toHaveBeenCalledOnce();
  });

  it("rejects when AUTH_SECRET env is unset", async () => {
    delete process.env.AUTH_SECRET;
    const res = await callRoute({ Authorization: "Bearer test-secret-value" });
    expect(res.status).toBe(401);
  });

  it("returns 500 when refresh throws", async () => {
    refreshSpy.mockRejectedValueOnce(new Error("curfox down"));
    const res = await callRoute({ Authorization: "Bearer test-secret-value" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("curfox down");
  });
});
```

- [ ] **Step 2: Run — confirm fail**

```powershell
npm test -- app/api/admin/curfox/refresh-cities/__tests__/route.test.ts
```

Expected: FAIL — route does not exist.

- [ ] **Step 3: Implement the route**

Create `app/api/admin/curfox/refresh-cities/route.ts`:

```ts
// app/api/admin/curfox/refresh-cities/route.ts
import { refreshCurfoxCityMap } from "@/app/_lib/courier/city-map";

// Uses Prisma → must run on the Node.js runtime (CLAUDE.md §3).
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.AUTH_SECRET;
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || provided !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { count } = await refreshCurfoxCityMap();
    return Response.json({ count });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    console.error("[curfox] city-refresh failed:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests — confirm pass**

```powershell
npm test -- app/api/admin/curfox/refresh-cities/__tests__/route.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add app/api/admin/curfox/refresh-cities/route.ts app/api/admin/curfox/refresh-cities/__tests__/route.test.ts
git commit -m "feat(api): add AUTH_SECRET-guarded Curfox city-refresh admin route"
```

---

## Task 9: `bookCourierAndNotify` orchestrator + unit tests

**Files:**
- Create: `app/checkout/book-courier.ts`
- Create: `app/checkout/__tests__/book-courier.test.ts`

This isolates the failure-cascade logic so `actions.ts` stays simple. The function returns `void` and never throws — the contract is "non-throwing".

- [ ] **Step 1: Write failing tests**

Create `app/checkout/__tests__/book-courier.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OrderDetails } from "@/app/_lib/mailer";

// Mock every dependency at the import boundary.
vi.mock("@/app/_lib/courier/curfox-client", () => ({
  createCurfoxOrder: vi.fn(),
  fetchCurfoxWaybillPdf: vi.fn(),
  CurfoxError: class CurfoxError extends Error {
    step: string;
    status?: number;
    responseBody?: string;
    constructor(message: string, step: string, status?: number, body?: string) {
      super(message);
      this.name = "CurfoxError";
      this.step = step;
      this.status = status;
      this.responseBody = body;
    }
  },
}));
vi.mock("@/app/_lib/courier/city-map", () => ({
  resolveCurfoxCity: vi.fn(),
}));
vi.mock("@/app/_lib/mailer", () => ({
  sendDispatchNotificationEmail: vi.fn(),
  sendAdminFailureAlertEmail: vi.fn(),
}));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: {
      update: vi.fn(),
    },
  },
}));

import {
  createCurfoxOrder,
  fetchCurfoxWaybillPdf,
  CurfoxError as MockedCurfoxError,
} from "@/app/_lib/courier/curfox-client";
import { resolveCurfoxCity } from "@/app/_lib/courier/city-map";
import {
  sendDispatchNotificationEmail,
  sendAdminFailureAlertEmail,
} from "@/app/_lib/mailer";
import { prisma } from "@/app/_lib/prisma";
import { bookCourierAndNotify } from "../book-courier";

const ORDER: OrderDetails = {
  orderId: "ORD-TEST-1",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+94770000000",
  items: [{ name: "T-Shirt", size: "M", price: 1200, quantity: 2 }],
  subtotal: 2400,
  shipping: 40,
  total: 2440,
  shippingAddress: {
    line1: "1 Walls Lane",
    city: "Colombo",
    region: "Western Province",
    postalCode: "00100",
    country: "Sri Lanka",
  },
  paymentMethod: "COD",
  paymentMethodDisplay: "Cash on Delivery",
};

beforeEach(() => {
  vi.mocked(createCurfoxOrder).mockReset();
  vi.mocked(fetchCurfoxWaybillPdf).mockReset();
  vi.mocked(resolveCurfoxCity).mockReset();
  vi.mocked(sendDispatchNotificationEmail).mockReset();
  vi.mocked(sendAdminFailureAlertEmail).mockReset();
  vi.mocked(prisma.order.update).mockReset();
  vi.mocked(prisma.order.update).mockResolvedValue({} as never);
});

describe("bookCourierAndNotify — happy path", () => {
  it("books, captures PDF, sends dispatch email, updates DB", async () => {
    vi.mocked(resolveCurfoxCity).mockResolvedValueOnce({
      destinationCityId: 1500,
      destinationWarehouseId: 78,
    });
    vi.mocked(createCurfoxOrder).mockResolvedValueOnce({
      id: 9249611,
      waybill_number: "RA03870247",
      order_no: "ORD-TEST-1",
      customer_name: "Jane Doe",
      cod: 2440,
    } as never);
    vi.mocked(fetchCurfoxWaybillPdf).mockResolvedValueOnce(Buffer.from("%PDF-x"));
    vi.mocked(sendDispatchNotificationEmail).mockResolvedValueOnce(undefined);

    await bookCourierAndNotify({ order: ORDER });

    expect(sendDispatchNotificationEmail).toHaveBeenCalledOnce();
    const dispatchCall = vi.mocked(sendDispatchNotificationEmail).mock.calls[0][0];
    expect(dispatchCall.waybillNumber).toBe("RA03870247");
    expect(dispatchCall.pdfBuffer).toBeInstanceOf(Buffer);

    // Updated twice: once for waybill/bookedAt, once for pdf+dispatchEmail flags.
    expect(prisma.order.update).toHaveBeenCalled();
    expect(sendAdminFailureAlertEmail).not.toHaveBeenCalled();
  });
});

describe("bookCourierAndNotify — failure cascade", () => {
  it("city miss → admin alert(city-lookup), no Curfox call, no throw", async () => {
    vi.mocked(resolveCurfoxCity).mockResolvedValueOnce(null);

    await bookCourierAndNotify({ order: ORDER });

    expect(createCurfoxOrder).not.toHaveBeenCalled();
    expect(sendAdminFailureAlertEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendAdminFailureAlertEmail).mock.calls[0][0].step).toBe("city-lookup");
  });

  it("create-order failure → admin alert(curfox-create) with response body", async () => {
    vi.mocked(resolveCurfoxCity).mockResolvedValueOnce({
      destinationCityId: 1500,
      destinationWarehouseId: 78,
    });
    vi.mocked(createCurfoxOrder).mockRejectedValueOnce(
      new MockedCurfoxError("HTTP 422", "create-order", 422, '{"errors":...}'),
    );

    await bookCourierAndNotify({ order: ORDER });

    expect(sendDispatchNotificationEmail).not.toHaveBeenCalled();
    expect(sendAdminFailureAlertEmail).toHaveBeenCalledOnce();
    const alert = vi.mocked(sendAdminFailureAlertEmail).mock.calls[0][0];
    expect(alert.step).toBe("curfox-create");
    expect(alert.errorDetail).toContain("errors");
  });

  it("PDF failure → still sends dispatch email without attachment + admin alert(curfox-pdf)", async () => {
    vi.mocked(resolveCurfoxCity).mockResolvedValueOnce({
      destinationCityId: 1500,
      destinationWarehouseId: 78,
    });
    vi.mocked(createCurfoxOrder).mockResolvedValueOnce({
      id: 9249611,
      waybill_number: "RA03870247",
      order_no: "ORD-TEST-1",
      customer_name: "Jane Doe",
      cod: 2440,
    } as never);
    vi.mocked(fetchCurfoxWaybillPdf).mockRejectedValueOnce(
      new MockedCurfoxError("HTTP 404", "fetch-pdf", 404),
    );

    await bookCourierAndNotify({ order: ORDER });

    expect(sendDispatchNotificationEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendDispatchNotificationEmail).mock.calls[0][0].pdfBuffer).toBeUndefined();
    expect(sendAdminFailureAlertEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendAdminFailureAlertEmail).mock.calls[0][0].step).toBe("curfox-pdf");
  });

  it("DB persist failure after Curfox booking → urgent admin alert(curfox-persist)", async () => {
    vi.mocked(resolveCurfoxCity).mockResolvedValueOnce({
      destinationCityId: 1500,
      destinationWarehouseId: 78,
    });
    vi.mocked(createCurfoxOrder).mockResolvedValueOnce({
      id: 9249611,
      waybill_number: "RA03870247",
      order_no: "ORD-TEST-1",
      customer_name: "Jane Doe",
      cod: 2440,
    } as never);
    vi.mocked(prisma.order.update).mockRejectedValueOnce(new Error("DB write failed"));

    await bookCourierAndNotify({ order: ORDER });

    expect(sendAdminFailureAlertEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendAdminFailureAlertEmail).mock.calls[0][0].step).toBe("curfox-persist");
  });

  it("never throws — even if every step fails", async () => {
    vi.mocked(resolveCurfoxCity).mockRejectedValueOnce(new Error("DB down"));
    vi.mocked(sendAdminFailureAlertEmail).mockRejectedValueOnce(new Error("SMTP down"));

    // Must not throw despite cascading failures
    await expect(bookCourierAndNotify({ order: ORDER })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — confirm fail**

```powershell
npm test -- app/checkout/__tests__/book-courier.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `book-courier.ts`**

Create `app/checkout/book-courier.ts`:

```ts
// app/checkout/book-courier.ts
import { prisma } from "@/app/_lib/prisma";
import {
  createCurfoxOrder,
  fetchCurfoxWaybillPdf,
  CurfoxError,
} from "@/app/_lib/courier/curfox-client";
import { resolveCurfoxCity } from "@/app/_lib/courier/city-map";
import {
  sendDispatchNotificationEmail,
  sendAdminFailureAlertEmail,
} from "@/app/_lib/mailer";
import type { OrderDetails } from "@/app/_lib/mailer";

const ORIGIN_CITY_ID = (): number =>
  Number(process.env.CURFOX_ORIGIN_CITY_ID ?? "1500");
const ORIGIN_WAREHOUSE_ID = (): number =>
  Number(process.env.CURFOX_ORIGIN_WAREHOUSE_ID ?? "78");
const DEFAULT_WEIGHT = (): number =>
  Number(process.env.CURFOX_DEFAULT_WEIGHT_KG ?? "1");

function buildAddressLine(addr: OrderDetails["shippingAddress"]): string {
  const parts = [addr.line1];
  if (addr.line2) parts.push(addr.line2);
  parts.push(addr.postalCode);
  return parts.join(", ");
}

function buildDescription(items: OrderDetails["items"]): string {
  if (items.length === 1) return items[0].name;
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  return `Clothes (${totalQty} items)`;
}

async function tryAlert(params: Parameters<typeof sendAdminFailureAlertEmail>[0]): Promise<void> {
  try {
    await sendAdminFailureAlertEmail(params);
  } catch (err) {
    console.error("[mailer] admin alert send failed (suppressed):", err);
  }
}

async function tryDispatchEmail(
  order: OrderDetails,
  waybillNumber: string,
  pdfBuffer: Buffer | undefined,
): Promise<void> {
  try {
    await sendDispatchNotificationEmail({ order, waybillNumber, pdfBuffer });
    await prisma.order
      .update({
        where: { id: order.orderId },
        data: { dispatchEmailSentAt: new Date() },
      })
      .catch((err) => {
        console.error("[checkout] dispatchEmailSentAt update failed:", err);
      });
  } catch (err) {
    console.error("[mailer] dispatch send failed:", err);
  }
}

/**
 * Books a courier shipment for the order and emails the dispatch notification
 * with the airwaybill PDF attached. Never throws — every failure is contained
 * and emits an admin alert via sendAdminFailureAlertEmail.
 */
export async function bookCourierAndNotify(params: { order: OrderDetails }): Promise<void> {
  const { order } = params;

  // ⑤ Resolve city ─────────────────────────────────────────────────────
  let cityIds: { destinationCityId: number; destinationWarehouseId: number | null };
  try {
    const resolved = await resolveCurfoxCity(order.shippingAddress.city);
    if (!resolved) {
      console.warn("[curfox] city-lookup failed", {
        orderId: order.orderId,
        city: order.shippingAddress.city,
      });
      await prisma.order
        .update({
          where: { id: order.orderId },
          data: {
            courierLastError: `city not in map: ${order.shippingAddress.city}`,
            courierLastErrorAt: new Date(),
          },
        })
        .catch(() => undefined);
      await tryAlert({
        orderId: order.orderId,
        step: "city-lookup",
        reason: `City "${order.shippingAddress.city}" is not in the Curfox city map`,
        order,
        context: { city: order.shippingAddress.city },
      });
      return;
    }
    cityIds = resolved;
  } catch (err) {
    console.error("[curfox] city-lookup error", err);
    await tryAlert({
      orderId: order.orderId,
      step: "city-lookup",
      reason: err instanceof Error ? err.message : String(err),
      order,
      context: { city: order.shippingAddress.city },
    });
    return;
  }

  // ⑥–⑧ Create order at Curfox ────────────────────────────────────────
  let curfoxOrder: { id: number; waybill_number: string };
  try {
    const created = await createCurfoxOrder({
      order_no: order.orderId,
      customer_name: order.customerName,
      customer_address: buildAddressLine(order.shippingAddress),
      customer_phone: order.customerPhone ?? "",
      customer_email: order.customerEmail ?? null,
      weight: DEFAULT_WEIGHT(),
      origin_city_id: ORIGIN_CITY_ID(),
      origin_warehouse_id: ORIGIN_WAREHOUSE_ID(),
      destination_city_id: cityIds.destinationCityId,
      destination_warehouse_id: cityIds.destinationWarehouseId ?? undefined,
      cod: order.paymentMethod === "COD" ? order.total : 0,
      description: buildDescription(order.items),
    });
    curfoxOrder = { id: created.id, waybill_number: created.waybill_number };
  } catch (err) {
    const isCurfoxErr = err instanceof CurfoxError;
    const reason =
      isCurfoxErr && err.status
        ? `Curfox HTTP ${err.status}`
        : err instanceof Error
          ? err.message
          : String(err);
    const detail = isCurfoxErr ? err.responseBody : err instanceof Error ? err.stack : undefined;
    const step: "curfox-login" | "curfox-create" =
      isCurfoxErr && err.step === "login" ? "curfox-login" : "curfox-create";
    await prisma.order
      .update({
        where: { id: order.orderId },
        data: {
          courierLastError: `${step}: ${reason}`,
          courierLastErrorAt: new Date(),
        },
      })
      .catch(() => undefined);
    await tryAlert({ orderId: order.orderId, step, reason, errorDetail: detail, order });
    return;
  }

  // ⑨ Persist waybill ─────────────────────────────────────────────────
  try {
    await prisma.order.update({
      where: { id: order.orderId },
      data: {
        courierWaybillNumber: curfoxOrder.waybill_number,
        courierBookedAt: new Date(),
        trackingCode: curfoxOrder.waybill_number,
        royalExpressSubmitted: true,
        courierLastError: null,
        courierLastErrorAt: null,
      },
    });
  } catch (err) {
    console.error("[curfox] WAYBILL LOST", {
      orderId: order.orderId,
      waybillNumber: curfoxOrder.waybill_number,
    });
    await tryAlert({
      orderId: order.orderId,
      step: "curfox-persist",
      reason: err instanceof Error ? err.message : String(err),
      order,
      context: { waybillNumber: curfoxOrder.waybill_number },
    });
    return;
  }

  // ⑩ Fetch PDF ───────────────────────────────────────────────────────
  let pdfBuffer: Buffer | undefined;
  try {
    pdfBuffer = await fetchCurfoxWaybillPdf(curfoxOrder.id, curfoxOrder.waybill_number);
    await prisma.order
      .update({
        where: { id: order.orderId },
        data: { dispatchPdfFetchedAt: new Date() },
      })
      .catch((err) => {
        console.error("[checkout] dispatchPdfFetchedAt update failed:", err);
      });
  } catch (err) {
    pdfBuffer = undefined;
    console.warn("[curfox] pdf-fetch failed", {
      orderId: order.orderId,
      waybillNumber: curfoxOrder.waybill_number,
      reason: err instanceof Error ? err.message : String(err),
    });
    await prisma.order
      .update({
        where: { id: order.orderId },
        data: {
          courierLastError: `pdf-fetch: ${err instanceof Error ? err.message : String(err)}`,
          courierLastErrorAt: new Date(),
        },
      })
      .catch(() => undefined);
    await tryAlert({
      orderId: order.orderId,
      step: "curfox-pdf",
      reason: err instanceof Error ? err.message : String(err),
      order,
      context: { waybillNumber: curfoxOrder.waybill_number },
    });
    // Fall through — dispatch email still sends without attachment
  }

  // ⑪ Send dispatch notification (always — with or without PDF) ───────
  await tryDispatchEmail(order, curfoxOrder.waybill_number, pdfBuffer);
}
```

- [ ] **Step 4: Run tests — confirm pass**

```powershell
npm test -- app/checkout/__tests__/book-courier.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add app/checkout/book-courier.ts app/checkout/__tests__/book-courier.test.ts
git commit -m "feat(checkout): bookCourierAndNotify with full failure cascade + admin alerts"
```

---

## Task 10: Refactor `processOrder` to use new helpers (Option B2 + D)

**Files:**
- Modify: `app/checkout/actions.ts`
- Create: `app/checkout/__tests__/actions.test.ts`

- [ ] **Step 1: Write integration tests for `processOrder`**

Create `app/checkout/__tests__/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/_lib/auth", () => ({
  auth: vi.fn(async () => null),
}));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(),
      update: vi.fn(async () => ({})),
    },
    product: {
      findMany: vi.fn(async () => [{ id: "P1", sizes: "S,M,L" }]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        product: {
          updateMany: async () => ({ count: 1 }),
        },
        order: {
          create: async () => ({}),
        },
      }),
    ),
  },
}));
vi.mock("@/app/checkout/book-courier", () => ({
  bookCourierAndNotify: vi.fn(async () => undefined),
}));
vi.mock("@/app/_lib/mailer", async (orig) => {
  const actual = await orig<typeof import("@/app/_lib/mailer")>();
  return {
    ...actual,
    sendOrderConfirmationEmail: vi.fn(async () => undefined),
    sendPendingPrepaidNotificationEmail: vi.fn(async () => undefined),
  };
});

import { bookCourierAndNotify } from "@/app/checkout/book-courier";
import {
  sendOrderConfirmationEmail,
  sendPendingPrepaidNotificationEmail,
} from "@/app/_lib/mailer";
import { processOrder } from "../actions";

const baseInput = {
  items: [{ productId: "P1", name: "T-Shirt", price: 1200, quantity: 2, size: "M" }],
  shippingAddress: {
    line1: "1 Walls Lane",
    line2: "Apt 5",
    city: "Colombo",
    region: "Western Province",
    postalCode: "00100",
    country: "Sri Lanka",
  },
  contactPhone: "+94770000000",
  guestInfo: { name: "Jane Doe", email: "jane@example.com", phone: "+94770000000" },
} as const;

beforeEach(() => {
  vi.mocked(bookCourierAndNotify).mockClear();
  vi.mocked(sendOrderConfirmationEmail).mockClear();
  vi.mocked(sendPendingPrepaidNotificationEmail).mockClear();
});

describe("processOrder — COD path", () => {
  it("calls bookCourierAndNotify and sends customer confirmation; returns success", async () => {
    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(result.success).toBe(true);
    expect(bookCourierAndNotify).toHaveBeenCalledOnce();
    expect(sendOrderConfirmationEmail).toHaveBeenCalledOnce();
    expect(sendPendingPrepaidNotificationEmail).not.toHaveBeenCalled();
  });
});

describe("processOrder — prepaid paths", () => {
  it.each(["PAYHERE", "KOKO", "MINITPAY"] as const)(
    "%s: skips courier, sends pending-prepaid email + customer confirmation",
    async (paymentMethod) => {
      const result = await processOrder({ ...baseInput, paymentMethod });
      expect(result.success).toBe(true);
      expect(bookCourierAndNotify).not.toHaveBeenCalled();
      expect(sendPendingPrepaidNotificationEmail).toHaveBeenCalledOnce();
      expect(sendOrderConfirmationEmail).toHaveBeenCalledOnce();
    },
  );
});

describe("processOrder — never throws downstream failures back to the customer", () => {
  it("returns success even if bookCourierAndNotify somehow throws", async () => {
    // The helper is contract-bound to never throw, but defense in depth:
    vi.mocked(bookCourierAndNotify).mockRejectedValueOnce(new Error("contract broken"));
    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(result.success).toBe(true);
  });

  it("returns success even if customer-confirmation email fails", async () => {
    vi.mocked(sendOrderConfirmationEmail).mockRejectedValueOnce(new Error("smtp down"));
    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run — confirm fail**

```powershell
npm test -- app/checkout/__tests__/actions.test.ts
```

Expected: FAIL — `processOrder` doesn't yet call the new helpers.

- [ ] **Step 3: Refactor `actions.ts`**

In `app/checkout/actions.ts`, **remove** the existing Royal Express try/catch block (lines covering `royalEnabled`, the `fetch(ROYAL_EXPRESS_API, ...)` block, and its surrounding logic — the entire section that starts with `// Submit to RoyalExpress (best-effort — failures here don't roll back the order).` and ends just before `// Send confirmation email to both customer and brand.`).

Replace it with:

```ts
  // ── Branch on payment method (Option B2) ────────────────────────────
  const royalEnabled = process.env.ROYAL_EXPRESS_ENABLED === "true";

  const orderDetailsForEmail: import("@/app/_lib/mailer").OrderDetails = {
    orderId,
    customerName,
    customerEmail,
    customerPhone: contactPhone,
    items: orderItems,
    subtotal,
    shipping: shippingCost,
    total,
    shippingAddress,
    paymentMethod,
    paymentMethodDisplay: PAYMENT_METHOD_DISPLAY[paymentMethod],
    notes: notes && notes.length > 0 ? notes : undefined,
  };

  if (paymentMethod === "COD") {
    if (royalEnabled) {
      try {
        const { bookCourierAndNotify } = await import("./book-courier");
        await bookCourierAndNotify({ order: orderDetailsForEmail });
      } catch (err) {
        // bookCourierAndNotify is contract-bound to never throw, but defense
        // in depth: if it ever does, log and continue. Customer always sees success.
        console.error("[checkout] bookCourierAndNotify threw (contract violated):", err);
      }
    } else {
      console.log(
        "[checkout] ROYAL_EXPRESS_ENABLED=false — skipping Curfox booking",
        { orderId },
      );
    }
  } else {
    console.log(
      "[checkout] Skipped courier automation: awaiting payment confirmation",
      { orderId, paymentMethod },
    );
    try {
      const { sendPendingPrepaidNotificationEmail } = await import("@/app/_lib/mailer");
      await sendPendingPrepaidNotificationEmail({ order: orderDetailsForEmail });
    } catch (err) {
      console.error("[mailer] pending-prepaid send failed:", err);
    }
    // TODO(curfox-hook): when PayHere/Koko/MinitPay webhook handlers are added,
    // they should call bookCourierAndNotify({ order: <reconstructed OrderDetails> })
    // here on payment success.
  }
```

Also move the `orderItems` declaration earlier so it can be used inside `orderDetailsForEmail`. Find the existing block:

```ts
  // Send confirmation email to both customer and brand.
  const orderItems: OrderItem[] = items.map((item) => ({ ... }));
```

Move that `const orderItems = ...` declaration to **just after** the stock TXN block (just after `} catch (error) {` block that surrounds the TXN, before the new branching code). The customer-confirmation email block at the bottom uses the same `orderItems`.

Update the `trackingCode` declaration. Replace the current `let trackingCode: string | undefined;` declaration (above the old Royal Express block) with a reload from the DB after the COD branch:

```ts
  let trackingCode: string | undefined;
  if (paymentMethod === "COD") {
    const updated = await prisma.order.findUnique({
      where: { id: orderId },
      select: { courierWaybillNumber: true },
    });
    trackingCode = updated?.courierWaybillNumber ?? undefined;
  }
```

Place this **after** the branching block, **before** the customer-confirmation email send.

- [ ] **Step 4: Run tests — confirm pass**

```powershell
npm test -- app/checkout/__tests__/actions.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run the full suite to catch regressions**

```powershell
npm test
```

Expected: all tests across all files pass.

- [ ] **Step 6: Commit**

```powershell
git add app/checkout/actions.ts app/checkout/__tests__/actions.test.ts
git commit -m "refactor(checkout): wire processOrder to bookCourierAndNotify (B2 + D)"
```

---

## Task 11: Checkout client — city `<select>` with seed fallback

**Files:**
- Modify: `app/checkout/page.tsx`
- Modify: `app/checkout/checkout-client.tsx`

This is a UI change. No new unit tests — verified via manual smoke in Task 13.

- [ ] **Step 1: Load cities in the server component**

Edit `app/checkout/page.tsx`. Replace the existing file contents with:

```tsx
// app/checkout/page.tsx
import { auth } from "@/app/_lib/auth";
import { CheckoutClient } from "./checkout-client";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { listAvailableCities } from "@/app/_lib/courier/city-map";

export default async function CheckoutPage() {
  const session = await auth();
  const user = session?.user
    ? {
        name: session.user.name ?? "",
        email: session.user.email ?? "",
      }
    : null;

  // Empty list is OK — the client falls back to a free-text input.
  let cities: Array<{ id: number; name: string }> = [];
  try {
    cities = await listAvailableCities();
  } catch (err) {
    console.error("[checkout] Failed to load city list, falling back to text input:", err);
  }

  return (
    <>
      <CheckoutClient user={user} cities={cities} />
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Add `cities` prop to checkout-client + swap input for `<select>`**

In `app/checkout/checkout-client.tsx`:

a) Update the `Props` type (around line 23):

```ts
type Props = {
  user: CheckoutUser;
  cities: Array<{ id: number; name: string }>;
};
```

b) Update the function signature (around line 46):

```ts
export function CheckoutClient({ user, cities }: Props) {
```

c) Replace the existing city `<Input>` block (lines 304–316 — the `<div>` containing the City label + input). Find:

```tsx
                      <div>
                        <label htmlFor="city" className="block text-sm font-medium mb-1">
                          City *
                        </label>
                        <Input
                          id="city"
                          value={address.city}
                          onChange={(e) => setAddress({ ...address, city: e.target.value })}
                          required
                          placeholder="Colombo"
                        />
                      </div>
```

Replace with:

```tsx
                      <div>
                        <label htmlFor="city" className="block text-sm font-medium mb-1">
                          City *
                        </label>
                        {cities.length > 0 ? (
                          <select
                            id="city"
                            value={address.city}
                            onChange={(e) => setAddress({ ...address, city: e.target.value })}
                            required
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="" disabled>
                              Select city
                            </option>
                            {cities.map((c) => (
                              <option key={c.id} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            id="city"
                            value={address.city}
                            onChange={(e) => setAddress({ ...address, city: e.target.value })}
                            required
                            placeholder="Colombo"
                          />
                        )}
                      </div>
```

- [ ] **Step 3: Verify the type-check still passes**

```powershell
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Build**

```powershell
npm run build
```

Expected: clean build.

- [ ] **Step 5: Commit**

```powershell
git add app/checkout/page.tsx app/checkout/checkout-client.tsx
git commit -m "feat(checkout): city dropdown driven by CurfoxCity, fallback to text input"
```

---

## Task 12: Full-suite verification + build

**Files:** none (verification only)

- [ ] **Step 1: Run all tests**

```powershell
npm test
```

Expected: every test across the suite passes (Tasks 1, 3, 4, 5, 6, 7, 8, 9, 10).

- [ ] **Step 2: Production build**

```powershell
npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 3: Lint**

```powershell
npm run lint
```

Expected: zero new errors. Warnings on pre-existing code are acceptable.

- [ ] **Step 4: Confirm no dangling TODOs that should have been resolved**

```powershell
# PowerShell — grep for unresolved markers added during this work
Select-String -Path "app/**/*.ts","app/**/*.tsx" -Pattern "TODO\(curfox-verify\)" |
  Select-Object -ExpandProperty Line | ForEach-Object { $_.Trim() }
```

Expected output (these are the deliberate TODOs flagged in the spec; they should remain):

```
// TODO(curfox-verify): field name may be `note` / `merchant_remark` instead
```

If any TODOs appear that aren't in the spec's open-questions list (§3), resolve them before proceeding.

- [ ] **Step 5: Commit (only if any file changes from steps 1–4)**

If lint or tsc surfaced fixes, stage and commit them. Otherwise skip.

```powershell
git status
# If clean, skip. Otherwise:
git add <files>
git commit -m "chore: lint/typecheck cleanup"
```

---

## Task 13: Manual staging smoke test

**Files:** none — operational checklist; results appended to the spec doc.

These steps require running the dev server with real env vars. Each step is independently reversible.

- [ ] **Step 1: Seed the city map (one-time)**

Start the dev server: `npm run dev` in one PowerShell terminal. In another:

```powershell
curl -X POST http://localhost:3000/api/admin/curfox/refresh-cities `
  -H "Authorization: Bearer $env:AUTH_SECRET"
```

Expected: `{"count": <N>}` with N > 0. If 401: confirm `AUTH_SECRET` matches `.env.local`. If 500: check server logs — likely Curfox login fails (review `ROYAL_EXPRESS_*` env vars).

- [ ] **Step 2: Verify city rows exist**

```powershell
npx prisma studio
```

Browse `CurfoxCity` table. Spot-check that `Colombo` and `Kotte` rows exist; note their ids.

- [ ] **Step 3: COD happy-path test order**

1. Open `http://localhost:3000` in browser.
2. Add an inexpensive product to cart.
3. Proceed to checkout. Select a city from the dropdown (e.g., `Colombo`).
4. Fill remaining fields with your **own** phone and a Colombo-area address. Payment: COD.
5. Submit. Verify: success page appears within ~8s.
6. Check inbox: `dressingbear@gmail.com` should have `[Dispatch] Order ORD-... — Waybill RA...` with `delivery-note.pdf` attached.
7. Verify the Curfox merchant portal (`https://royalexpress.merchant.curfox.com/`) shows the new order.
8. **Cancel the order in the Curfox portal** to prevent a real pickup.

- [ ] **Step 4: COD with unknown city test**

Temporarily insert a fake row, then remove it (or pick a city you know is not in Curfox). Place a COD order with that city. Verify:
- Customer sees success
- DB: `SELECT courier_last_error FROM "Order" WHERE id = '<your-order-id>'` contains `"city not in map"`
- Inbox: `[Dressing Bear] Order ORD-... — Curfox city-lookup failed` email arrives
- No Curfox portal order created

- [ ] **Step 5: Prepaid path**

Place an order with payment method `PayHere` (UI label).
- Success in <2s
- DB: no `courier*` fields set
- Inbox: `[PENDING PAYMENT] Order ORD-...` email arrives (no attachment)
- Server log: `[checkout] Skipped courier automation: awaiting payment confirmation`

- [ ] **Step 6: Simulated Curfox outage**

In `.env.local`, temporarily set `CURFOX_BASE_URL=https://example.invalid`. Restart `npm run dev`. Place a COD order. Verify:
- Customer sees success
- DB: `courier_last_error` contains the network error
- Inbox: `[Dressing Bear] Order ORD-... — Curfox curfox-login failed` alert email

Revert `CURFOX_BASE_URL` and restart.

- [ ] **Step 7: Append validation log to spec**

Edit `docs/superpowers/specs/2026-05-16-curfox-courier-email-design.md`. Add a section at the bottom:

```markdown
## Validation log: 2026-05-16

- City seed: count=<N>
- COD happy path: ✅ (waybill RA<...>; cancelled in portal)
- Unknown city: ✅ (alert email received)
- Prepaid: ✅
- Simulated outage: ✅
```

- [ ] **Step 8: Commit validation log**

```powershell
git add docs/superpowers/specs/2026-05-16-curfox-courier-email-design.md
git commit -m "docs(spec): add staging validation log for Curfox courier flow"
```

---

## Task 14: Open the PR

**Files:** none

- [ ] **Step 1: Push the branch**

```powershell
git push -u origin feat/curfox-courier-dispatch
```

- [ ] **Step 2: Open a draft PR to `develop`**

```powershell
gh pr create --base develop --draft `
  --title "feat(checkout): Curfox courier booking + Brevo dispatch email" `
  --body "$(@'
## Summary
- Books COD orders with Royal Express via Curfox (login → create → fetch PDF)
- Sends the printable airwaybill PDF to dressingbear@gmail.com via Brevo
- Prepaid (PayHere/Koko/MinitPay) orders skip the courier and trigger a pending-payment notification; future webhook hook is marked
- Every downstream failure is contained — customer always sees success; admin gets a step-specific alert email
- Adds a DB-backed Curfox city map with an AUTH_SECRET-guarded refresh endpoint
- Spec: docs/superpowers/specs/2026-05-16-curfox-courier-email-design.md
- Plan: docs/superpowers/plans/2026-05-16-curfox-courier-email.md

## Test plan
- [x] Unit tests: npm test (all green — Curfox types, client auth, client ops, city map, mailer, admin route, book-courier, processOrder)
- [x] npm run build clean
- [x] Manual smoke: COD happy path, unknown city, prepaid, simulated Curfox outage (see Validation log in spec doc)
- [ ] Production rollout: deploy with ROYAL_EXPRESS_ENABLED=false → seed cities → flip to true

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@)"
```

- [ ] **Step 3: Verify PR URL is returned**

The command prints the PR URL. Share it back to the user.

---

## Self-Review Notes

**Spec coverage** — each spec section has at least one task:

| Spec § | Task(s) |
|---|---|
| §4 Module layout | Tasks 3–10 |
| §4.1 Prisma schema | Task 2 |
| §5 Wire format | Tasks 3, 4, 5 |
| §6 Data flow | Tasks 9, 10 |
| §7 Error handling | Task 9 |
| §8 Email content | Task 7 |
| §9 Interfaces | Tasks 3, 4, 5, 6, 7, 8, 9 |
| §10 Env vars | Tasks 0, 5 (paths), 7 (mailer reads existing) |
| §11.1 Tiers | Task 1 (vitest), Task 13 (manual) |
| §11.2 Critical cases | Token cache (T4), PDF branch (T5), city miss (T9), 422 (T9), prepaid (T10), PDF 404 (T9) |
| §11.3 Test seams | DI in `city-map` (T6), `__setTestTransport` in mailer (T7), `vi.mock` import-boundary (T9, T10) |
| §11.4 Staging checklist | Task 13 |
| §11.5 Local execution | Task 1 + 13 |
| §12 Rollout plan | Task 0 (env doc), Task 14 (PR notes) |
| §13 Definition of done | Tasks 12 + 14 cover the checklist |

**Type consistency checks performed:**
- `bookCourierAndNotify({ order })` signature matches between Tasks 9 (definition) and 10 (call site)
- `sendDispatchNotificationEmail({ order, waybillNumber, pdfBuffer? })` signature matches between Tasks 7 (definition) and 9 (call site)
- `resolveCurfoxCity(cityName) → { destinationCityId, destinationWarehouseId } | null` matches between Tasks 6 (definition) and 9 (call site)
- `OrderDetails` reused from existing `mailer.ts` (no duplication)
- `CurfoxError.step` enum values are consistent across Tasks 4, 5, 9 (`"login" | "create-order" | "fetch-pdf" | "list-cities"`)
- Admin alert `step` enum is a different (narrower) set: `"city-lookup" | "curfox-login" | "curfox-create" | "curfox-persist" | "curfox-pdf"`. Mapping from `CurfoxError.step` → admin alert step is done explicitly in Task 9's create-order failure branch (login → curfox-login, others → curfox-create).

**Known intentional TODO marker that should remain:**
- `TODO(curfox-verify): field name may be 'note' / 'merchant_remark' instead` — `app/_lib/courier/curfox-types.ts`
- `TODO(curfox-hook): when PayHere/Koko/MinitPay webhook handlers are added...` — `app/checkout/actions.ts`
