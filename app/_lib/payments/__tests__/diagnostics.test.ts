import { describe, it, expect, beforeEach } from "vitest";
import { getPaymentDiagnostics, getSystemDiagnostics } from "../diagnostics";

const SECRET = "super-secret-key-value-1234567890";

beforeEach(() => {
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
