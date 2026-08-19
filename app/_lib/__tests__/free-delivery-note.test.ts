import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("freeDeliveryExclusionNote", () => {
  it("names both methods when Koko is enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_KOKO_ENABLED", "true");
    const { freeDeliveryExclusionNote, excludedMethodNames } = await import("../free-delivery-note");

    expect(excludedMethodNames()).toBe("Koko & Mintpay");
    expect(freeDeliveryExclusionNote()).toBe("excludes Koko & Mintpay");
  });

  it("does not name Koko when it is not offered", async () => {
    // Mirrors the announcement bar: never advertise (or disclaim) a method the
    // store does not actually present at checkout.
    vi.stubEnv("NEXT_PUBLIC_KOKO_ENABLED", "false");
    const { freeDeliveryExclusionNote } = await import("../free-delivery-note");

    expect(freeDeliveryExclusionNote()).toBe("excludes Mintpay");
  });
});
