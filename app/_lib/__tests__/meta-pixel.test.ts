import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type FbqCall = unknown[];

function installWindow(withFbq: boolean) {
  const calls: FbqCall[] = [];
  const store = new Map<string, string>();
  const fbq = withFbq ? vi.fn((...args: FbqCall) => calls.push(args)) : undefined;
  (globalThis as Record<string, unknown>).window = {
    fbq,
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
  return { calls };
}

describe("meta-pixel", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it("pixelId returns undefined when env is empty", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "");
    const m = await import("@/app/_lib/meta-pixel");
    expect(m.pixelId()).toBeUndefined();
    expect(m.isPixelConfigured()).toBe(false);
  });

  it("pixelId returns the id and isPixelConfigured is true when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "123456");
    const m = await import("@/app/_lib/meta-pixel");
    expect(m.pixelId()).toBe("123456");
    expect(m.isPixelConfigured()).toBe(true);
  });

  it("track no-ops when window.fbq is absent", async () => {
    installWindow(false);
    const m = await import("@/app/_lib/meta-pixel");
    expect(() => m.track("ViewContent", { value: 1 })).not.toThrow();
  });

  it("track calls fbq with event and payload when fbq exists", async () => {
    const { calls } = installWindow(true);
    const m = await import("@/app/_lib/meta-pixel");
    m.trackViewContent("p1", 1990);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("track");
    expect(calls[0][1]).toBe("ViewContent");
    expect(calls[0][2]).toMatchObject({
      content_ids: ["p1"],
      content_type: "product",
      value: 1990,
      currency: "LKR",
    });
  });

  it("trackAddToCart sends value, num_items and content_ids", async () => {
    const { calls } = installWindow(true);
    const m = await import("@/app/_lib/meta-pixel");
    m.trackAddToCart("p2", 3980, 2);
    expect(calls[0][1]).toBe("AddToCart");
    expect(calls[0][2]).toMatchObject({ content_ids: ["p2"], value: 3980, num_items: 2 });
  });

  it("trackPurchaseOnce fires once per order id and passes eventID", async () => {
    const { calls } = installWindow(true);
    const m = await import("@/app/_lib/meta-pixel");
    m.trackPurchaseOnce("order-1", 5000, ["p1", "p2"]);
    m.trackPurchaseOnce("order-1", 5000, ["p1", "p2"]); // duplicate — must be skipped
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe("Purchase");
    expect(calls[0][2]).toMatchObject({ content_ids: ["p1", "p2"], value: 5000, currency: "LKR" });
    expect(calls[0][3]).toMatchObject({ eventID: "order-1" });
  });

  it("trackPurchaseOnce no-ops entirely when fbq is absent (no throw)", async () => {
    installWindow(false);
    const m = await import("@/app/_lib/meta-pixel");
    expect(() => m.trackPurchaseOnce("order-2", 1, ["p1"])).not.toThrow();
  });
});
