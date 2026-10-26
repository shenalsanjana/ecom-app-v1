import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type FbqCall = unknown[];
const PRIMARY_ID = "1767244997622143";
const SECONDARY_ID = "1770550114263259";

function installWindow(withFbq: boolean) {
  const calls: FbqCall[] = [];
  const fbq = withFbq ? vi.fn((...args: FbqCall) => calls.push(args)) : undefined;
  (globalThis as Record<string, unknown>).window = { fbq };
  return { calls };
}

describe("meta-pixel", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", PRIMARY_ID);
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", "");
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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

  it("returns both configured IDs in order", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", SECONDARY_ID);
    const m = await import("@/app/_lib/meta-pixel");
    expect(m.pixelIds()).toEqual([PRIMARY_ID, SECONDARY_ID]);
  });

  it("normalizes whitespace and removes duplicate IDs", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", ` ${PRIMARY_ID} `);
    const m = await import("@/app/_lib/meta-pixel");
    expect(m.pixelIds()).toEqual([PRIMARY_ID]);
  });

  it("supports the secondary Pixel alone and rejects malformed IDs", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "invalid-id");
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", SECONDARY_ID);
    const m = await import("@/app/_lib/meta-pixel");
    expect(m.pixelId()).toBeUndefined();
    expect(m.pixelIds()).toEqual([SECONDARY_ID]);
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
    expect(calls[0].slice(0, 3)).toEqual(["trackSingle", PRIMARY_ID, "ViewContent"]);
    expect(calls[0][3]).toMatchObject({
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
    expect(calls[0][2]).toBe("AddToCart");
    expect(calls[0][3]).toMatchObject({ content_ids: ["p2"], value: 3980, num_items: 2 });
  });

  it("trackViewCategory fires a custom ViewCategory event with the category name", async () => {
    const { calls } = installWindow(true);
    const m = await import("@/app/_lib/meta-pixel");
    m.trackViewCategory("Dresses");
    expect(calls).toHaveLength(1);
    expect(calls[0].slice(0, 3)).toEqual(["trackSingleCustom", PRIMARY_ID, "ViewCategory"]);
    expect(calls[0][3]).toMatchObject({
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
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", SECONDARY_ID);
    const { calls } = installWindow(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ claimed: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const m = await import("@/app/_lib/meta-pixel");

    await m.trackPurchaseOnce("order-1", 5000, ["p1", "p2"]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/orders/order-1/claim-purchase-tracking",
      { method: "POST" },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([PRIMARY_ID, SECONDARY_ID].map((id) => [
      "trackSingle", id, "Purchase",
      { content_ids: ["p1", "p2"], content_type: "product", value: 5000, currency: "LKR" },
      { eventID: "order-1" },
    ]));
  });

  it("trackPurchaseOnce skips firing when the server claim is already taken (duplicate)", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", SECONDARY_ID);
    const { calls } = installWindow(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ claimed: false }) }));
    const m = await import("@/app/_lib/meta-pixel");

    await m.trackPurchaseOnce("order-1", 5000, ["p1", "p2"]);

    expect(calls).toHaveLength(0);
  });

  it("a repeated Purchase attempt never resends to either Pixel after the order is claimed", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", SECONDARY_ID);
    const { calls } = installWindow(true);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ claimed: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ claimed: false }) });
    vi.stubGlobal("fetch", fetchMock);
    const m = await import("@/app/_lib/meta-pixel");
    await m.trackPurchaseOnce("order-1", 5000, ["p1"]);
    await m.trackPurchaseOnce("order-1", 5000, ["p1"]);
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call[1])).toEqual([PRIMARY_ID, SECONDARY_ID]);
    expect(calls.every((call) => (call[4] as { eventID: string }).eventID === "order-1")).toBe(true);
  });

  it("trackPurchaseOnce skips firing when the claim request fails (avoids risking a duplicate)", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", SECONDARY_ID);
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

  it.each(["PageView", "ViewContent", "AddToCart", "InitiateCheckout"] as const)(
    "%s is sent exactly once to each Pixel with the same parameters",
    async (event) => {
      vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", SECONDARY_ID);
      const { calls } = installWindow(true);
      const m = await import("@/app/_lib/meta-pixel");
      const payload = { content_ids: ["p1"], value: 1990, currency: "LKR", num_items: 1 };
      m.track(event, payload);
      expect(calls).toEqual([PRIMARY_ID, SECONDARY_ID].map((id) => ["trackSingle", id, event, payload]));
    },
  );

  it("preserves InitiateCheckout cart parameters for both Pixels", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", SECONDARY_ID);
    const { calls } = installWindow(true);
    const m = await import("@/app/_lib/meta-pixel");
    m.trackInitiateCheckout(["p1", "p2"], 5970, 3);
    expect(calls).toEqual([PRIMARY_ID, SECONDARY_ID].map((id) => [
      "trackSingle", id, "InitiateCheckout",
      { content_ids: ["p1", "p2"], content_type: "product", value: 5970, currency: "LKR", num_items: 3 },
    ]));
  });

  it("preserves the custom category event for both Pixels", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", SECONDARY_ID);
    const { calls } = installWindow(true);
    const m = await import("@/app/_lib/meta-pixel");
    m.trackViewCategory("Dresses");
    expect(calls).toEqual([PRIMARY_ID, SECONDARY_ID].map((id) => [
      "trackSingleCustom", id, "ViewCategory", { content_category: "Dresses", content_name: "Dresses" },
    ]));
  });

  it("does not dispatch the same event twice when the IDs are identical", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", PRIMARY_ID);
    const { calls } = installWindow(true);
    const m = await import("@/app/_lib/meta-pixel");
    m.track("PageView");
    expect(calls).toEqual([["trackSingle", PRIMARY_ID, "PageView", {}]]);
  });

  it("still dispatches to the secondary Pixel if the primary throws", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", SECONDARY_ID);
    const { calls } = installWindow(true);
    const original = window.fbq!;
    window.fbq = (...args: unknown[]) => {
      if (args[1] === PRIMARY_ID) throw new Error("Pixel failure");
      original(...args);
    };
    const m = await import("@/app/_lib/meta-pixel");
    expect(() => m.track("PageView")).not.toThrow();
    expect(calls).toEqual([["trackSingle", SECONDARY_ID, "PageView", {}]]);
  });

  it("does not consume a Purchase claim when no Pixel is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "");
    const { calls } = installWindow(true);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const m = await import("@/app/_lib/meta-pixel");
    await m.trackPurchaseOnce("order-1", 5000, ["p1"]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});
