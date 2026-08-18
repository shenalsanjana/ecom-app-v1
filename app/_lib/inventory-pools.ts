// Shared raw-material pool restore/acquire helpers used by every path that
// creates, cancels, edits, or fails an order: checkout, admin cancel/edit,
// and the payment-failure webhook all call these two functions so stock
// math never diverges between paths. Both skip a pool whose id is null —
// a sizeless line, an order predating this feature, or a pool row since
// deleted (OrderItem.plainTshirtStockId/dtfDesignId is onDelete: SetNull).
import type { Prisma } from "@prisma/client";

export type PoolItem = {
  plainTshirtStockId: string | null;
  dtfDesignId: string | null;
  quantity: number;
};

export type AcquireItem = PoolItem & { name: string };

export async function restoreItemPools(tx: Prisma.TransactionClient, item: PoolItem): Promise<void> {
  if (item.plainTshirtStockId) {
    await tx.plainTshirtStock.updateMany({
      where: { id: item.plainTshirtStockId },
      data: { quantity: { increment: item.quantity } },
    });
  }
  if (item.dtfDesignId) {
    await tx.dtfDesign.updateMany({
      where: { id: item.dtfDesignId },
      data: { quantity: { increment: item.quantity } },
    });
  }
}

// Raised when a pool cannot satisfy a line. Distinct from an internal failure:
// this message is written FOR the shopper and is safe to show them, whereas a
// Prisma/connection error is not. Callers surface it directly and genericise
// everything else. Extends Error, so existing `e instanceof Error ? e.message`
// handlers (admin order edits) are unaffected.
export class InsufficientStockError extends Error {
  constructor(itemName: string) {
    super(`Insufficient stock for "${itemName}"`);
    this.name = "InsufficientStockError";
  }
}

// Guarded-decrements both pools. Throws if either has insufficient quantity,
// so the caller's transaction rolls back any prior work in the same batch.
export async function acquireItemPools(tx: Prisma.TransactionClient, item: AcquireItem): Promise<void> {
  if (item.plainTshirtStockId) {
    const r = await tx.plainTshirtStock.updateMany({
      where: { id: item.plainTshirtStockId, quantity: { gte: item.quantity } },
      data: { quantity: { decrement: item.quantity } },
    });
    if (r.count === 0) throw new InsufficientStockError(item.name);
  }
  if (item.dtfDesignId) {
    const r = await tx.dtfDesign.updateMany({
      where: { id: item.dtfDesignId, quantity: { gte: item.quantity } },
      data: { quantity: { decrement: item.quantity } },
    });
    if (r.count === 0) throw new InsufficientStockError(item.name);
  }
}
