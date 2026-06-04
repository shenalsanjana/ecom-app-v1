import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => ({ prisma: { storeSettings: { upsert } } }));

import { updateStoreInfo, updateDeliveryPricing } from "../actions";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { id: "admin1" } });
  upsert.mockReset().mockResolvedValue({});
});

describe("updateStoreInfo", () => {
  it("rejects a blank store name", async () => {
    const res = await updateStoreInfo(fd({ storeName: "", supportEmail: "a@b.test", supportPhone: "x", businessAddress: "y" }));
    expect(res).toEqual({ success: false, error: "Store name is required" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const res = await updateStoreInfo(fd({ storeName: "Shop", supportEmail: "nope", supportPhone: "x", businessAddress: "y" }));
    expect(res).toEqual({ success: false, error: "Enter a valid email" });
  });

  it("upserts valid store info", async () => {
    const res = await updateStoreInfo(fd({ storeName: "Shop", supportEmail: "a@b.test", supportPhone: "077", businessAddress: "Colombo" }));
    expect(res).toEqual({ success: true });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "singleton" },
      update: { storeName: "Shop", supportEmail: "a@b.test", supportPhone: "077", businessAddress: "Colombo" },
    }));
  });
});

describe("updateDeliveryPricing", () => {
  it("rejects a negative cost", async () => {
    const res = await updateDeliveryPricing(fd({ colomboDeliveryCost: "-1", otherDeliveryCost: "450", freeDeliveryThreshold: "5000" }));
    expect(res).toEqual({ success: false, error: "Must be ≥ 0" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts coerced integer pricing", async () => {
    const res = await updateDeliveryPricing(fd({ colomboDeliveryCost: "400", otherDeliveryCost: "600", freeDeliveryThreshold: "7000" }));
    expect(res).toEqual({ success: true });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "singleton" },
      update: { colomboDeliveryCost: 400, otherDeliveryCost: 600, freeDeliveryThreshold: 7000 },
    }));
  });

  it("returns a generic error when the upsert throws", async () => {
    upsert.mockRejectedValueOnce(new Error("db down"));
    const res = await updateDeliveryPricing(fd({ colomboDeliveryCost: "400", otherDeliveryCost: "600", freeDeliveryThreshold: "7000" }));
    expect(res).toEqual({ success: false, error: "Something went wrong. Please try again." });
  });
});
