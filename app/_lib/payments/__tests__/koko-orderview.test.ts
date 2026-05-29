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

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ orderId: "ORD-1", trnId: "T1", status: "SUCCESS" }),
    });
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

  it("extracts status from wrapped response { data: { status } }", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: "FAILED" } }),
    }));

    const { fetchKokoOrderStatus } = await import("../koko");
    expect(await fetchKokoOrderStatus("ORD-2")).toBe("FAILED");
  });

  it("extracts status from flat response { status }", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "PENDING" }),
    }));

    const { fetchKokoOrderStatus } = await import("../koko");
    expect(await fetchKokoOrderStatus("ORD-3")).toBe("PENDING");
  });

  it("defaults to PENDING when no status field present", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }));

    const { fetchKokoOrderStatus } = await import("../koko");
    expect(await fetchKokoOrderStatus("ORD-4")).toBe("PENDING");
  });
});

describe("fetchKokoOrderStatus — resilience", () => {
  beforeEach(() => {
    setupKokoEnv();
  });

  it("returns PENDING when orderView responds non-OK", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    }));

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

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        orderId: "ORD-1",
        trnId: "T1",
        status: "SUCCESS",
        signature: responseSignature,
      }),
    }));

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

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        orderId: "ORD-1",
        trnId: "T1",
        status: "SUCCESS",
        signature: "AAAA", // bogus signature
      }),
    }));

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

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        orderId: "ORD-1",
        trnId: "T1",
        status: "SUCCESS",
        signature: "bogus-but-ignored",
      }),
    }));

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
