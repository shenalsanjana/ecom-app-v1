import { describe, it, expect, beforeEach, vi } from "vitest";

const { findUnique, create } = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: { storeSettings: { findUnique, create } },
}));

import { getStoreSettings, getDeliveryConfig, DEFAULT_STORE_SETTINGS, STORE_SETTINGS_ID } from "../store-settings";

const ROW = {
  id: STORE_SETTINGS_ID,
  ...DEFAULT_STORE_SETTINGS,
  colomboDeliveryCost: 350,
  otherDeliveryCost: 450,
  freeDeliveryThreshold: 5000,
  updatedAt: new Date(0),
};

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
});

describe("getStoreSettings", () => {
  it("returns the existing row without creating", async () => {
    findUnique.mockResolvedValueOnce(ROW);
    const s = await getStoreSettings();
    expect(s.storeName).toBe("Dressing Bear");
    expect(create).not.toHaveBeenCalled();
  });

  it("seeds defaults when the row is missing", async () => {
    findUnique.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce(ROW);
    await getStoreSettings();
    expect(create).toHaveBeenCalledWith({
      data: { id: STORE_SETTINGS_ID, ...DEFAULT_STORE_SETTINGS },
    });
  });

  it("recovers from a create race by re-reading", async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(ROW);
    create.mockRejectedValueOnce(new Error("unique violation"));
    const s = await getStoreSettings();
    expect(s.storeName).toBe("Dressing Bear");
  });
});

describe("getDeliveryConfig", () => {
  it("maps the row to a DeliveryConfig", async () => {
    findUnique.mockResolvedValueOnce({ ...ROW, colomboDeliveryCost: 400, otherDeliveryCost: 600, freeDeliveryThreshold: 7000 });
    const cfg = await getDeliveryConfig();
    expect(cfg).toEqual({ colombo: 400, other: 600, freeThreshold: 7000 });
  });
});
