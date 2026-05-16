import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
