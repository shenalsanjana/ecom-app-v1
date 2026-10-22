import type { Prisma } from "@prisma/client";

export class OrderConflictError extends Error {
  constructor() {
    super("This order changed while you were working. Refresh and try again.");
    this.name = "OrderConflictError";
  }
}

// Claim BEFORE changing line items or stock. Every financial/order mutation
// participates, so a stale editor cannot overwrite a callback or cancellation.
export async function claimOrderMutation(
  tx: Prisma.TransactionClient,
  order: { id: string; version: number; status: string; paymentStatus: string | null },
): Promise<void> {
  const result = await tx.order.updateMany({
    where: { id: order.id, version: order.version, status: order.status, paymentStatus: order.paymentStatus },
    data: { version: { increment: 1 } },
  });
  if (result.count !== 1) throw new OrderConflictError();
}
