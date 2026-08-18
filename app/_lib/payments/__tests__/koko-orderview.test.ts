import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign, verify } from "crypto";

// ---------------------------------------------------------------------------
// Generate a test RSA keypair (used across multiple tests)
// ---------------------------------------------------------------------------
const { privateKey: testPrivateKey, publicKey: testPublicKey } = generateKeyPairSync("rsa", {
  modulusLength: 1024,
});
const TEST_PRIVATE_KEY_PEM = testPrivateKey.export({ type: "pkcs1", format: "pem" }).toString();
const TEST_PUBLIC_KEY_PEM = testPublicKey.export({ type: "pkcs1", format: "pem" }).toString();

const MERCHANT_ID = "merchant-1";
const API_KEY = "api-key-1";
const PLUGIN_NAME = "customapi";
const PLUGIN_VERSION = "1";
const ORDER_VIEW_URL = "https://qaapi.paykoko.com/api/merchants/orderView";

// A faithful `Response` stand-in. `fetchKokoOrderStatus` reads the body with
// `.text()` and parses it itself (so a non-JSON Koko error page is logged rather
// than swallowed by a throwing `.json()`), so a mock that only stubs `.json()`
// does not exercise the real code path.
function mockResponse(
  payload: unknown,
  init: { ok?: boolean; status?: number; contentType?: string } = {},
) {
  const body = JSON.stringify(payload);
  return {
    ok: init.ok ?? true,
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { get: () => init.contentType ?? "application/json" },
    text: async () => body,
    json: async () => payload,
  };
}


function setupKokoEnv(extraEnv: Record<string, string> = {}) {
  process.env.KOKO_MERCHANT_ID = MERCHANT_ID;
  process.env.KOKO_API_KEY = API_KEY;
  process.env.KOKO_PRIVATE_KEY = TEST_PRIVATE_KEY_PEM;
  process.env.KOKO_PLUGIN_NAME = PLUGIN_NAME;
  process.env.KOKO_PLUGIN_VERSION = PLUGIN_VERSION;
  delete process.env.KOKO_MODE; // ensures test/QA mode
  delete process.env.KOKO_PUBLIC_KEY;
  for (const [k, v] of Object.entries(extraEnv)) {
    process.env[k] = v;
  }
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("signKokoOrderViewString", () => {
  it("signs merchantId+pluginName+pluginVersion+orderId+apiKey (dataString order verification)", async () => {
    setupKokoEnv();
    const { signKokoOrderViewString } = await import("../koko");

    const sig = signKokoOrderViewString({
      merchantId: MERCHANT_ID,
      pluginName: PLUGIN_NAME,
      pluginVersion: PLUGIN_VERSION,
      orderId: "ORD-1",
      apiKey: API_KEY,
      privateKey: TEST_PRIVATE_KEY_PEM,
    });

    const expectedDataString = MERCHANT_ID + PLUGIN_NAME + PLUGIN_VERSION + "ORD-1" + API_KEY;
    const sigBytes = Buffer.from(sig, "base64");

    // Verify with the matching public key — confirms dataString order is correct
    expect(verify("RSA-SHA256", Buffer.from(expectedDataString), testPublicKey, sigBytes)).toBe(true);

    // Must NOT verify against a differently-ordered dataString
    const wrongOrder = MERCHANT_ID + "ORD-1" + PLUGIN_NAME + PLUGIN_VERSION + API_KEY;
    expect(verify("RSA-SHA256", Buffer.from(wrongOrder), testPublicKey, sigBytes)).toBe(false);
  });
});

describe("fetchKokoOrderStatus — request shape", () => {
  it("POSTs to orderViewUrl with correct headers, body fields, and returns SUCCESS", async () => {
    setupKokoEnv();

    const mockFetch = vi.fn().mockResolvedValue(mockResponse({ status: "OK", statusCode: 200, content: { orderId: "ORD-1", trnId: "T1", status: "SUCCESS" } }, { ok: true }));
    vi.stubGlobal("fetch", mockFetch);

    const { fetchKokoOrderStatus } = await import("../koko");
    const status = await fetchKokoOrderStatus("ORD-1");

    expect(status).toBe("SUCCESS");
    expect(mockFetch).toHaveBeenCalledOnce();

    const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(ORDER_VIEW_URL);
    expect(calledInit.method).toBe("POST");
    expect((calledInit.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );

    // Parse the posted body
    const bodyString = calledInit.body?.toString() ?? "";
    const params = new URLSearchParams(bodyString);

    expect(params.get("_mId")).toBe(MERCHANT_ID);
    expect(params.get("_orderId")).toBe("ORD-1");
    expect(params.get("_pluginName")).toBe(PLUGIN_NAME);
    expect(params.get("_pluginVersion")).toBe(PLUGIN_VERSION);
    expect(params.get("api_key")).toBe(API_KEY);
    expect(params.get("signature")).toBeTruthy();

    // Verify the posted signature is correct RSA-SHA256 over the right dataString order
    const signatureBytes = Buffer.from(params.get("signature")!, "base64");
    const expectedDataString = MERCHANT_ID + PLUGIN_NAME + PLUGIN_VERSION + "ORD-1" + API_KEY;
    expect(verify("RSA-SHA256", Buffer.from(expectedDataString), testPublicKey, signatureBytes)).toBe(true);
  });
});

describe("fetchKokoOrderStatus — status extraction", () => {
  beforeEach(() => {
    setupKokoEnv();
  });

  // VERIFIED CONTRACT. Captured from prodapi.paykoko.com/api/merchants/orderView
  // on 2026-08-18 against four real, genuinely-paid production orders:
  //
  //   {"status":"OK","statusCode":200,
  //    "content":{"trnId":"…","orderId":"…","status":"SUCCESS","desc":null,"signature":"…"}}
  //
  // Two separate `status` fields exist and they mean different things:
  //   - the ENVELOPE's `status` is the API-CALL result ("OK")
  //   - `content.status` is the PAYMENT status ("SUCCESS" / "FAILED" / "PENDING")
  // Reading the envelope's `status` is what stranded every Koko order at
  // "awaiting payment": "OK" is not a recognized payment token, so it defaulted
  // to PENDING and finalization never ran.
  function kokoEnvelope(paymentStatus: string, extra: Record<string, unknown> = {}) {
    return {
      status: "OK",
      statusCode: 200,
      content: {
        trnId: "35a8f41f6bd948be67e2aba024db1058",
        orderId: "ORD-1",
        status: paymentStatus,
        desc: null,
        ...extra,
      },
    };
  }

  it("reads the PAYMENT status from content.status, not the envelope status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(kokoEnvelope("SUCCESS"), { ok: true })));

    const { fetchKokoOrderStatus } = await import("../koko");
    expect(await fetchKokoOrderStatus("ORD-1")).toBe("SUCCESS");
  });

  it("reads FAILED from content.status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(kokoEnvelope("FAILED"), { ok: true })));

    const { fetchKokoOrderStatus } = await import("../koko");
    expect(await fetchKokoOrderStatus("ORD-1")).toBe("FAILED");
  });

  it("reads PENDING from content.status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(kokoEnvelope("PENDING"), { ok: true })));

    const { fetchKokoOrderStatus } = await import("../koko");
    expect(await fetchKokoOrderStatus("ORD-1")).toBe("PENDING");
  });

  it("NEVER treats the envelope's own status as the payment status", async () => {
    // The API-call result and the payment result are independent. An envelope
    // reporting a successful CALL for an unpaid order must not finalize it —
    // that would mark unpaid orders as PAID.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockResponse({ status: "SUCCESS", statusCode: 200, content: { status: "PENDING" } }, { ok: true }),
    ));

    const { fetchKokoOrderStatus } = await import("../koko");
    expect(await fetchKokoOrderStatus("ORD-1")).toBe("PENDING");
  });

  it("returns PENDING when the envelope carries no content object", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockResponse({ status: "OK", statusCode: 200 }, { ok: true }),
    ));

    const { fetchKokoOrderStatus } = await import("../koko");
    expect(await fetchKokoOrderStatus("ORD-4")).toBe("PENDING");
  });

  it("still reads a `data`-wrapped envelope (older documented shape)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({ data: { status: "FAILED" } }, { ok: true })));

    const { fetchKokoOrderStatus } = await import("../koko");
    expect(await fetchKokoOrderStatus("ORD-2")).toBe("FAILED");
  });
});

describe("fetchKokoOrderStatus — resilience", () => {
  beforeEach(() => {
    setupKokoEnv();
  });

  it("returns PENDING when orderView responds non-OK", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({}, { ok: false, status: 502 })));

    const { fetchKokoOrderStatus } = await import("../koko");
    await expect(fetchKokoOrderStatus("ORD-1")).resolves.toBe("PENDING");
  });

  it("returns PENDING when the orderView request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const { fetchKokoOrderStatus } = await import("../koko");
    await expect(fetchKokoOrderStatus("ORD-1")).resolves.toBe("PENDING");
  });
});

describe("fetchKokoOrderStatus — A3 response signature verification", () => {
  it("does NOT call console.warn when response signature is valid", async () => {
    setupKokoEnv({ KOKO_PUBLIC_KEY: TEST_PUBLIC_KEY_PEM });

    // Build a valid response signature: RSA-SHA256 over "ORD-1T1SUCCESS"
    const responseDataString = "ORD-1T1SUCCESS";
    const responseSignature = sign("RSA-SHA256", Buffer.from(responseDataString), testPrivateKey).toString("base64");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({
        status: "OK",
        statusCode: 200,
        content: { orderId: "ORD-1", trnId: "T1", status: "SUCCESS", signature: responseSignature },
      }, { ok: true })));

    const warnSpy = vi.spyOn(console, "warn");
    const { fetchKokoOrderStatus } = await import("../koko");
    const result = await fetchKokoOrderStatus("ORD-1");

    expect(result).toBe("SUCCESS");
    // warn should NOT have been called with a signature-mismatch message
    const sigMismatchCalls = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes("signature mismatch"),
    );
    expect(sigMismatchCalls).toHaveLength(0);
  });

  it("warns on signature mismatch but still returns the server status (A3 never fail-closed)", async () => {
    setupKokoEnv({ KOKO_PUBLIC_KEY: TEST_PUBLIC_KEY_PEM });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({
        status: "OK",
        statusCode: 200,
        content: { orderId: "ORD-1", trnId: "T1", status: "SUCCESS", signature: "AAAA" /* bogus */ },
      }, { ok: true })));

    const warnSpy = vi.spyOn(console, "warn");
    const { fetchKokoOrderStatus } = await import("../koko");
    const result = await fetchKokoOrderStatus("ORD-1");

    expect(result).toBe("SUCCESS"); // status still honored
    const sigMismatchCalls = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes("signature mismatch"),
    );
    expect(sigMismatchCalls.length).toBeGreaterThan(0);
  });

  it("skips verification entirely when publicKey is not configured", async () => {
    setupKokoEnv(); // no KOKO_PUBLIC_KEY
    delete process.env.KOKO_PUBLIC_KEY;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({
        status: "OK",
        statusCode: 200,
        content: { orderId: "ORD-1", trnId: "T1", status: "SUCCESS", signature: "bogus-but-ignored" },
      }, { ok: true })));

    const warnSpy = vi.spyOn(console, "warn");
    const { fetchKokoOrderStatus } = await import("../koko");
    const result = await fetchKokoOrderStatus("ORD-1");

    expect(result).toBe("SUCCESS");
    const sigMismatchCalls = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes("signature mismatch"),
    );
    expect(sigMismatchCalls).toHaveLength(0);
  });
});

describe("fetchKokoOrderStatus — PENDING diagnostics", () => {
  // Every one of these paths returns the same value (PENDING) and therefore leaves
  // the order at "awaiting payment". The ONLY way to tell them apart in production
  // is the logged `reason`, so each one is pinned here.
  function pendingWarn(warnSpy: ReturnType<typeof vi.spyOn>) {
    return (warnSpy.mock.calls as unknown[][]).find(
      (args) => String(args[0]) === "[koko] orderView -> PENDING",
    )?.[1] as Record<string, unknown> | undefined;
  }

  it("reports reason 'config-error' when required Koko env vars are missing", async () => {
    setupKokoEnv();
    delete process.env.KOKO_MERCHANT_ID;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetchKokoOrderStatus } = await import("../koko");

    expect(await fetchKokoOrderStatus("ORD-1")).toBe("PENDING");
    expect(pendingWarn(warnSpy)?.reason).toBe("config-error");
  });

  it("reports reason 'http-not-ok' with the response body", async () => {
    setupKokoEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockResponse({ status: "CLIENT_ERROR", statusCode: 400 }, { ok: false, status: 400 }),
    ));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetchKokoOrderStatus } = await import("../koko");

    expect(await fetchKokoOrderStatus("ORD-1")).toBe("PENDING");
    const detail = pendingWarn(warnSpy);
    expect(detail?.reason).toBe("http-not-ok");
    expect(detail?.httpStatus).toBe(400);
    expect(String(detail?.body)).toContain("CLIENT_ERROR");
  });

  it("reports reason 'non-json-body' instead of letting a HTML error page throw", async () => {
    setupKokoEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      text: async () => "<html><body>Server Error</body></html>",
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetchKokoOrderStatus } = await import("../koko");

    expect(await fetchKokoOrderStatus("ORD-1")).toBe("PENDING");
    const detail = pendingWarn(warnSpy);
    expect(detail?.reason).toBe("non-json-body");
    expect(String(detail?.body)).toContain("Server Error");
  });

  it("reports reason 'status-field-absent' with the envelope shape when no status key exists", async () => {
    setupKokoEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockResponse({ status: "OK", statusCode: 200, content: { orderId: "ORD-1", orderStatus: "SUCCESS" } }, { ok: true }),
    ));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetchKokoOrderStatus } = await import("../koko");

    expect(await fetchKokoOrderStatus("ORD-1")).toBe("PENDING");
    const detail = pendingWarn(warnSpy);
    expect(detail?.reason).toBe("status-field-absent");
    expect(detail?.payloadSource).toBe("json.content");
    // The shape is what identifies a wrong-field-name bug from the logs alone.
    expect(detail?.payloadKeys).toEqual(["orderId", "orderStatus"]);
  });

  it("reports reason 'status-not-terminal' with the unrecognized token", async () => {
    setupKokoEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockResponse({ status: "OK", statusCode: 200, content: { status: "COMPLETED" } }, { ok: true }),
    ));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetchKokoOrderStatus } = await import("../koko");

    expect(await fetchKokoOrderStatus("ORD-1")).toBe("PENDING");
    const detail = pendingWarn(warnSpy);
    expect(detail?.reason).toBe("status-not-terminal");
    expect(detail?.rawStatus).toBe("COMPLETED");
  });
});
