import { afterEach, describe, expect, it } from "vitest";
import { checkoutPaymentOptions, isOnlinePaymentMethod } from "../registry";

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
