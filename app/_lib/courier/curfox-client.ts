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
export const __test_only_resetTokenCache = (): void => {
  cachedToken = null;
};
export const __test_only_getToken = getToken;
export const __test_only_authedFetch = authedFetch;

// Internal exports used by sibling functions in later tasks
export { getToken as _getToken, authedFetch as _authedFetch, baseUrl as _baseUrl };
