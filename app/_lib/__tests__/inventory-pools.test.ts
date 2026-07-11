import { describe, it, expect, vi, beforeEach } from "vitest";
import { restoreItemPools, acquireItemPools } from "../inventory-pools";

function makeTx() {
  return {
    plainTshirtStock: { updateMany: vi.fn(async () => ({ count: 1 })) },
    dtfDesign: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
}

describe("restoreItemPools", () => {
  let tx: ReturnType<typeof makeTx>;
  beforeEach(() => { tx = makeTx(); });

  it("increments both pools when both ids are present", async () => {
    await restoreItemPools(tx as never, { plainTshirtStockId: "p1", dtfDesignId: "d1", quantity: 2 });
    expect(tx.plainTshirtStock.updateMany).toHaveBeenCalledWith({
      where: { id: "p1" }, data: { quantity: { increment: 2 } },
    });
    expect(tx.dtfDesign.updateMany).toHaveBeenCalledWith({
      where: { id: "d1" }, data: { quantity: { increment: 2 } },
    });
  });

  it("skips the plain pool when plainTshirtStockId is null", async () => {
    await restoreItemPools(tx as never, { plainTshirtStockId: null, dtfDesignId: "d1", quantity: 1 });
    expect(tx.plainTshirtStock.updateMany).not.toHaveBeenCalled();
    expect(tx.dtfDesign.updateMany).toHaveBeenCalledOnce();
  });

  it("skips the design pool when dtfDesignId is null", async () => {
    await restoreItemPools(tx as never, { plainTshirtStockId: "p1", dtfDesignId: null, quantity: 1 });
    expect(tx.plainTshirtStock.updateMany).toHaveBeenCalledOnce();
    expect(tx.dtfDesign.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing when both ids are null (sizeless or pre-migration order item)", async () => {
    await restoreItemPools(tx as never, { plainTshirtStockId: null, dtfDesignId: null, quantity: 1 });
    expect(tx.plainTshirtStock.updateMany).not.toHaveBeenCalled();
    expect(tx.dtfDesign.updateMany).not.toHaveBeenCalled();
  });
});

describe("acquireItemPools", () => {
  let tx: ReturnType<typeof makeTx>;
  beforeEach(() => { tx = makeTx(); });

  it("guarded-decrements both pools when both ids are present", async () => {
    await acquireItemPools(tx as never, { plainTshirtStockId: "p1", dtfDesignId: "d1", quantity: 2, name: "Cat Tee" });
    expect(tx.plainTshirtStock.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", quantity: { gte: 2 } }, data: { quantity: { decrement: 2 } },
    });
    expect(tx.dtfDesign.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", quantity: { gte: 2 } }, data: { quantity: { decrement: 2 } },
    });
  });

  it("throws with the item name when the plain pool has insufficient stock", async () => {
    tx.plainTshirtStock.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      acquireItemPools(tx as never, { plainTshirtStockId: "p1", dtfDesignId: "d1", quantity: 5, name: "Cat Tee" }),
    ).rejects.toThrow('Insufficient stock for "Cat Tee"');
    expect(tx.dtfDesign.updateMany).not.toHaveBeenCalled();
  });

  it("throws with the item name when the design pool has insufficient stock", async () => {
    tx.dtfDesign.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      acquireItemPools(tx as never, { plainTshirtStockId: "p1", dtfDesignId: "d1", quantity: 5, name: "Cat Tee" }),
    ).rejects.toThrow('Insufficient stock for "Cat Tee"');
  });

  it("skips a pool whose id is null without throwing", async () => {
    await acquireItemPools(tx as never, { plainTshirtStockId: null, dtfDesignId: "d1", quantity: 1, name: "Gift Card" });
    expect(tx.plainTshirtStock.updateMany).not.toHaveBeenCalled();
    expect(tx.dtfDesign.updateMany).toHaveBeenCalledOnce();
  });
});
