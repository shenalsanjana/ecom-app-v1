import { afterEach, describe, expect, it } from "vitest";
import {
  assertPaymentMethod,
  checkoutPaymentOptions,
  isOnlinePaymentMethod,
} from "../registry";

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

describe("assertPaymentMethod", () => {
  it("does not throw for known payment methods", () => {
    expect(() => assertPaymentMethod("COD")).not.toThrow();
    expect(() => assertPaymentMethod("PAYHERE")).not.toThrow();
    expect(() => assertPaymentMethod("KOKO")).not.toThrow();
    expect(() => assertPaymentMethod("MINTPAY")).not.toThrow();
  });

  it("throws for an unknown payment method", () => {
    expect(() => assertPaymentMethod("VENMO")).toThrow();
  });
});
