import { describe, it, expect } from "vitest";
import {
  calculateDelivery,
  COLOMBO_DELIVERY_COST,
  OTHER_DELIVERY_COST,
  FREE_DELIVERY_THRESHOLD,
} from "@/app/_lib/checkout-config";

describe("calculateDelivery", () => {
  it("charges Rs.350 for Colombo below the free threshold", () => {
    expect(calculateDelivery(1000, "COLOMBO")).toBe(350);
    expect(calculateDelivery(4999, "COLOMBO")).toBe(350);
  });

  it("charges Rs.450 for Other below the free threshold", () => {
    expect(calculateDelivery(1000, "OTHER")).toBe(450);
    expect(calculateDelivery(4999, "OTHER")).toBe(450);
  });

  it("is free at or above the free threshold for either zone", () => {
    expect(calculateDelivery(FREE_DELIVERY_THRESHOLD, "COLOMBO")).toBe(0);
    expect(calculateDelivery(FREE_DELIVERY_THRESHOLD, "OTHER")).toBe(0);
    expect(calculateDelivery(10_000, "COLOMBO")).toBe(0);
    expect(calculateDelivery(10_000, "OTHER")).toBe(0);
  });

  it("exposes the documented rate constants", () => {
    expect(COLOMBO_DELIVERY_COST).toBe(350);
    expect(OTHER_DELIVERY_COST).toBe(450);
    expect(FREE_DELIVERY_THRESHOLD).toBe(5000);
  });
});
