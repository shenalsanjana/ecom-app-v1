// app/_lib/courier/curfox-client.ts
import {
  CurfoxLoginResponseSchema,
  CurfoxCreateOrderInputSchema,
  CurfoxOrderResponseSchema,
  CurfoxCityListResponseSchema,
} from "./curfox-types";
import type { CurfoxCreateOrderInput, CurfoxCreatedOrder, CurfoxCity } from "./curfox-types";

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
export const __test_only_resetTokenCache = (): void => {
  cachedToken = null;
};
export const __test_only_getToken = getToken;
export const __test_only_authedFetch = authedFetch;

// Internal exports used by sibling functions in later tasks
export { getToken as _getToken, authedFetch as _authedFetch, baseUrl as _baseUrl };

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
