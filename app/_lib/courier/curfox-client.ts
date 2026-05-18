// app/_lib/courier/curfox-client.ts
import {
  CurfoxLoginResponseSchema,
  CurfoxCreateOrderInputSchema,
  CurfoxOrderResponseSchema,
} from "./curfox-types";
import type { CurfoxCreateOrderInput } from "./curfox-types";

export class CurfoxError extends Error {
  readonly step: "login" | "create-order" | "fetch-pdf";
  readonly status?: number;
  readonly responseBody?: string;
  constructor(
    message: string,
    step: "login" | "create-order" | "fetch-pdf",
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
  if ("token" in parsed && typeof parsed.token === "string") return parsed.token;
  if ("access_token" in parsed && typeof parsed.access_token === "string") return parsed.access_token;
  if (
    "data" in parsed &&
    parsed.data &&
    typeof parsed.data === "object" &&
    "token" in parsed.data &&
    typeof parsed.data.token === "string"
  ) {
    return parsed.data.token;
  }
  throw new CurfoxError("Curfox login: token missing from response", "login");
}

async function login(): Promise<string> {
  const user = process.env.ROYAL_EXPRESS_USER;
  const pass = process.env.ROYAL_EXPRESS_PASS;
  if (!user || !pass) {
    throw new CurfoxError("ROYAL_EXPRESS_USER / ROYAL_EXPRESS_PASS not set", "login");
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
    throw new CurfoxError(`Curfox login failed: HTTP ${res.status}`, "login", res.status, body);
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
export const __test_only_resetTokenCache = (): void => {
  cachedToken = null;
};
export const __test_only_getToken = getToken;
export const __test_only_authedFetch = authedFetch;

// Internal exports used by sibling functions in later tasks
export { getToken as _getToken, authedFetch as _authedFetch, baseUrl as _baseUrl };

// ── Curfox API operations ──────────────────────────────────────────────────

function orderCreatePath(): string {
  // Verified working endpoint per 2026-05-16 staging probe.
  return process.env.CURFOX_ORDER_CREATE_PATH ?? "/api/merchant/order/single";
}
function redactPhone(phone: string): string {
  if (phone.length <= 4) return "****";
  return phone.slice(0, -4) + "****";
}

function redactEnvelopeForLog(envelope: CurfoxCreateOrderInput): CurfoxCreateOrderInput {
  return {
    ...envelope,
    order_data: envelope.order_data.map((it) => ({
      ...it,
      customer_phone: redactPhone(it.customer_phone),
      customer_secondary_phone: it.customer_secondary_phone
        ? redactPhone(it.customer_secondary_phone)
        : it.customer_secondary_phone,
    })),
  };
}

/**
 * Submits an order to Curfox. The input is the exact wire envelope Curfox
 * expects — a `general_data` object plus an `order_data` array. The response
 * is a flat array of waybill strings; we surface the FIRST one to the caller
 * (single-order flows are the only use today). On any non-2xx the request
 * payload is logged with the phone numbers redacted, then re-thrown as a
 * CurfoxError with the response body preserved for the admin alert pipeline.
 */
export async function createCurfoxOrder(
  input: CurfoxCreateOrderInput,
): Promise<string> {
  const envelope = CurfoxCreateOrderInputSchema.parse(input);
  const url = `${baseUrl()}${orderCreatePath()}`;
  let res: Response;
  try {
    res = await authedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
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
      payload: redactEnvelopeForLog(envelope),
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
  const waybill = parsed.data[0];
  if (!waybill) {
    throw new CurfoxError("Curfox create-order: waybill missing from response", "create-order");
  }
  return waybill;
}

// fetchCurfoxWaybillPdf removed: Curfox does not expose a server-side PDF
// endpoint. The waybill is rendered client-side inside the merchant portal
// (using a layout JSON + the order JSON). The dispatch email now links to
// the portal instead of attempting to attach a PDF. The "fetch-pdf" step
// in CurfoxError stays as a recognised value for older lifecycle rows.
