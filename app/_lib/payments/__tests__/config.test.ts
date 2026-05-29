import { afterEach, describe, expect, it } from "vitest";
import {
  getKokoConfig,
  getMintpayConfig,
  isPaymentConfigError,
} from "../config";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("payment provider config", () => {
  it("defaults Koko to QA mode URLs", () => {
    process.env.KOKO_MERCHANT_ID = "merchant";
    process.env.KOKO_API_KEY = "api-key";
    process.env.KOKO_PRIVATE_KEY = "private-key";

    expect(getKokoConfig()).toMatchObject({
      mode: "test",
      orderCreateUrl: "https://qaapi.paykoko.com/api/merchants/orderCreate",
      orderViewUrl: "https://qaapi.paykoko.com/api/merchants/orderView",
      pluginName: "customapi",
      pluginVersion: "1",
    });
  });

  it("selects Koko live order-create and order-view URLs", () => {
    process.env.KOKO_MODE = "live";
    process.env.KOKO_MERCHANT_ID = "merchant";
    process.env.KOKO_API_KEY = "api-key";
    process.env.KOKO_PRIVATE_KEY = "private-key";

    expect(getKokoConfig().orderCreateUrl).toBe(
      "https://prodapi.paykoko.com/api/merchants/orderCreate",
    );
    expect(getKokoConfig().orderViewUrl).toBe(
      "https://prodapi.paykoko.com/api/merchants/orderView",
    );
  });

  it("defaults Mintpay to dev URLs", () => {
    process.env.MINTPAY_MERCHANT_ID = "mp0001";
    process.env.MINTPAY_MERCHANT_SECRET = "secret";

    expect(getMintpayConfig()).toMatchObject({
      mode: "test",
      apiUrl: "https://dev.mintpay.lk/user-order/api/",
      loginUrl: "https://dev.mintpay.lk/user-order/login/",
    });
  });

  it("selects Mintpay live URLs", () => {
    process.env.MINTPAY_MODE = "live";
    process.env.MINTPAY_MERCHANT_ID = "mp0001";
    process.env.MINTPAY_MERCHANT_SECRET = "secret";

    expect(getMintpayConfig()).toMatchObject({
      apiUrl: "https://app.mintpay.lk/user-order/api/",
      loginUrl: "https://app.mintpay.lk/user-order/login/",
    });
  });

  it("identifies safe config errors", () => {
    expect(isPaymentConfigError(new Error("KOKO_PRIVATE_KEY must be set"))).toBe(true);
    expect(isPaymentConfigError(new Error("database down"))).toBe(false);
  });
});
