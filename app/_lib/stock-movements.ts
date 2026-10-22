import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";

export class StockWriteError extends Error {}
export type StockWriteIntent = { operationKey?: string; reason?: string };

export async function setStockMovementContext(tx: Prisma.TransactionClient, context: {
  actorType: "ADMIN" | "CUSTOMER" | "SYSTEM"; actorId?: string | null;
  reason: string; orderId?: string; operationKey?: string;
}): Promise<void> {
  const value = JSON.stringify({ ...context, operationKey: context.operationKey ?? randomUUID() });
  await tx.$queryRaw`SELECT set_config('app.stock_context', ${value}, true)`;
}

/** One staff intent, its available-balance writes and audit events commit together. */
export async function writeStaffStock(actorId: string, reason: string, payload: unknown,
  operationKey: string | undefined, write: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  const key = operationKey ?? randomUUID();
  if (!z.string().uuid().safeParse(key).success) throw new StockWriteError("Refresh inventory before submitting this stock change.");
  if (!actorId) throw new StockWriteError("Sign in again before changing stock.");
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  for (let attempt = 0; attempt < 3; attempt++) {
  try {
    await prisma.$transaction(async tx => {
      await tx.stockOperation.create({ data: { key, actorId, payloadHash } });
      await setStockMovementContext(tx, { actorType: "ADMIN", actorId, reason, operationKey: key });
      await write(tx);
    }, { isolationLevel: "Serializable" });
    return;
  } catch (error) {
    if ((error as { code?: string }).code === "P2034" && attempt < 2) continue;
    if ((error as { code?: string }).code === "P2002") {
      const previous = await prisma.stockOperation.findUnique({ where: { key } });
      if (previous?.actorId === actorId && previous.payloadHash === payloadHash) return;
      if (previous) throw new StockWriteError("This stock reference was already used for different details. Refresh and start a new change.");
    }
    throw error;
  }
  }
}

export function countReason(reason?: string): string {
  const value = reason?.trim();
  if (!value || value.length < 3 || value.length > 250) throw new StockWriteError("Enter a reason for this count adjustment (3–250 characters).");
  return value;
}
