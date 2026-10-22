import type { Prisma } from "@prisma/client";

export class SaleIdentityError extends Error {}

export async function reconcileSizeStocks(
  tx: Prisma.TransactionClient,
  variantId: string,
  cells: { id?: string; size: string; plainTshirtStockId?: string | null }[],
) {
  const existing = await tx.variantSizeStock.findMany({ where: { variantId }, select: { id: true, size: true } });
  for (const cell of cells) {
    if (cell.id && !existing.some(old => old.id === cell.id && old.size === cell.size)) {
      throw new SaleIdentityError("A size changed or belongs to another colour. Reload the product and try again.");
    }
  }
  await tx.variantSizeStock.updateMany({
    where: { variantId, archived: false, size: { notIn: cells.map(cell => cell.size) } },
    data: { archived: true },
  });
  for (const cell of cells) {
    const binding = cell.plainTshirtStockId !== undefined ? { plainTshirtStockId: cell.plainTshirtStockId } : {};
    await tx.variantSizeStock.upsert({
      where: { variantId_size: { variantId, size: cell.size } },
      update: { archived: false, ...binding },
      create: { variantId, size: cell.size, ...binding },
    });
  }
}
