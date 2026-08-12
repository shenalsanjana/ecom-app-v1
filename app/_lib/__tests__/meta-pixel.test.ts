import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type FbqCall = unknown[];

function installWindow(withFbq: boolean) {
  const calls: FbqCall[] = [];
  const fbq = withFbq ? vi.fn((...args: FbqCall) => calls.push(args)) : undefined;
  (globalThis as Record<string, unknown>).window = { fbq };
  return { calls };
}

describe("meta-pixel", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    vi.unstubAllGlobals();
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

  it("trackViewCategory fires a custom ViewCategory event with the category name", async () => {
    const { calls } = installWindow(true);
    const m = await import("@/app/_lib/meta-pixel");
    m.trackViewCategory("Dresses");
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("trackCustom");
    expect(calls[0][1]).toBe("ViewCategory");
    expect(calls[0][2]).toMatchObject({
      content_category: "Dresses",
      content_name: "Dresses",
    });
  });

  it("trackViewCategory no-ops when fbq is absent (no throw)", async () => {
    installWindow(false);
    const m = await import("@/app/_lib/meta-pixel");
    expect(() => m.trackViewCategory("Dresses")).not.toThrow();
  });

  it("trackPurchaseOnce fires when the server claim succeeds, with eventID set", async () => {
    const { calls } = installWindow(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ claimed: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const m = await import("@/app/_lib/meta-pixel");

    await m.trackPurchaseOnce("order-1", 5000, ["p1", "p2"]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/orders/order-1/claim-purchase-tracking",
      { method: "POST" },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe("Purchase");
    expect(calls[0][2]).toMatchObject({ content_ids: ["p1", "p2"], value: 5000, currency: "LKR" });
    expect(calls[0][3]).toMatchObject({ eventID: "order-1" });
  });

  it("trackPurchaseOnce skips firing when the server claim is already taken (duplicate)", async () => {
    const { calls } = installWindow(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ claimed: false }) }));
    const m = await import("@/app/_lib/meta-pixel");

    await m.trackPurchaseOnce("order-1", 5000, ["p1", "p2"]);

    expect(calls).toHaveLength(0);
  });

  it("trackPurchaseOnce skips firing when the claim request fails (avoids risking a duplicate)", async () => {
    const { calls } = installWindow(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const m = await import("@/app/_lib/meta-pixel");

    await m.trackPurchaseOnce("order-1", 5000, ["p1", "p2"]);

    expect(calls).toHaveLength(0);
  });

  it("trackPurchaseOnce no-ops entirely when fbq is absent (no throw, no fetch)", async () => {
    installWindow(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const m = await import("@/app/_lib/meta-pixel");
    await expect(m.trackPurchaseOnce("order-2", 1, ["p1"])).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
