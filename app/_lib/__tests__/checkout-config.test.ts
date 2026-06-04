import { describe, it, expect } from "vitest";
import {
  calculateDelivery,
  DEFAULT_DELIVERY_CONFIG,
  COLOMBO_DELIVERY_COST,
  OTHER_DELIVERY_COST,
  FREE_DELIVERY_THRESHOLD,
  type DeliveryConfig,
} from "@/app/_lib/checkout-config";

describe("calculateDelivery", () => {
  it("uses DEFAULT_DELIVERY_CONFIG when no config is passed", () => {
    expect(calculateDelivery(1000, "COLOMBO")).toBe(350);
    expect(calculateDelivery(1000, "OTHER")).toBe(450);
    expect(calculateDelivery(4999, "COLOMBO")).toBe(350);
  });

  it("is free at or above the free threshold for either zone", () => {
    expect(calculateDelivery(FREE_DELIVERY_THRESHOLD, "COLOMBO")).toBe(0);
    expect(calculateDelivery(10_000, "OTHER")).toBe(0);
  });

  it("honours a custom config", () => {
    const cfg: DeliveryConfig = { colombo: 500, other: 700, freeThreshold: 8000 };
    expect(calculateDelivery(1000, "COLOMBO", cfg)).toBe(500);
    expect(calculateDelivery(1000, "OTHER", cfg)).toBe(700);
    expect(calculateDelivery(7999, "COLOMBO", cfg)).toBe(500);
    expect(calculateDelivery(8000, "COLOMBO", cfg)).toBe(0);
  });

  it("exposes the documented rate constants + default config", () => {
    expect(COLOMBO_DELIVERY_COST).toBe(350);
    expect(OTHER_DELIVERY_COST).toBe(450);
    expect(FREE_DELIVERY_THRESHOLD).toBe(5000);
    expect(DEFAULT_DELIVERY_CONFIG).toEqual({ colombo: 350, other: 450, freeThreshold: 5000 });
  });
});
