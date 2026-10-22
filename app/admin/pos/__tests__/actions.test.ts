import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const mock = vi.hoisted(() => ({ admin: vi.fn(), save: vi.fn(), products: vi.fn(), invalidate: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin: mock.admin }));
vi.mock("@/app/_lib/pos-service", () => ({ savePosSale: mock.save, getPosProducts: mock.products }));
vi.mock("@/app/_lib/invalidate-stock", () => ({ invalidateStock: mock.invalidate }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { completePosSale, searchPosProducts } from "../actions";
import { InsufficientStockError } from "@/app/_lib/inventory-pools";

const sale = () => ({ operationKey: randomUUID(), items: [{ sizeStockId: "size-1", quantity: 1, expectedPrice: 10000 }],
  paymentMethod: "CASH" as const, tendered: 10000 });

beforeEach(() => {
  vi.resetAllMocks();
  mock.admin.mockResolvedValue({ user: { id: "cashier-1" } });
  mock.save.mockResolvedValue({ orderId: "order-1", posNumber: "POS0001" });
});

describe("POS admin actions", () => {
  it("checks authorization before searching or accepting an invalid sale", async () => {
    mock.admin.mockRejectedValue(new Error("Forbidden"));
    await expect(searchPosProducts("shirt")).rejects.toThrow("Forbidden");
    await expect(completePosSale({ ...sale(), items: [] })).rejects.toThrow("Forbidden");
    expect(mock.products).not.toHaveBeenCalled();
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("rejects invalid input before touching stock", async () => {
    expect(await completePosSale({ ...sale(), tendered: -100 })).toMatchObject({ success: false });
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("uses the authenticated cashier and refreshes shared inventory and orders", async () => {
    expect(await completePosSale(sale())).toEqual({ success: true, orderId: "order-1", posNumber: "POS0001" });
    expect(mock.save.mock.calls[0][1]).toBe("cashier-1");
    expect(mock.invalidate).toHaveBeenCalled();
    expect(mock.revalidate).toHaveBeenCalledWith("/admin/orders");
  });
  it("returns stock failures without leaking internal errors", async () => {
    mock.save.mockRejectedValueOnce(new InsufficientStockError("Shirt"));
    expect(await completePosSale(sale())).toEqual({ success: false, error: 'Insufficient stock for "Shirt"' });
    mock.save.mockRejectedValueOnce(new Error("sensitive database details"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await completePosSale(sale());
    expect(result).toMatchObject({ success: false, uncertain: true });
    expect(JSON.stringify(result)).not.toContain("sensitive");
    log.mockRestore();
  });
  it("keeps a committed sale successful if invalidation fails", async () => {
    mock.invalidate.mockImplementationOnce(() => { throw new Error("Cache unavailable"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await completePosSale(sale())).toMatchObject({ success: true, posNumber: "POS0001" });
    log.mockRestore();
  });
});
