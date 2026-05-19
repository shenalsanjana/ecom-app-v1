// app/_lib/rb-number.ts
//
// Legacy sequence-backed generator. Superseded by `app/_lib/web-number.ts`
// for new orders (which produce `WEB####` references). This file is retained
// because old `Order` rows still carry `rbNumber` values; the helper itself
// is no longer called from `processOrder`.

import type { Prisma } from "@prisma/client";

/**
 * Returns the next RB-prefixed order number, e.g. "RB1001".
 *
 * Backed by the Postgres sequence `rb_number_seq` (created in the migration
 * that introduces Order.rbNumber). nextval() is atomic, so concurrent inserts
 * cannot collide.
 *
 * If the surrounding transaction rolls back, the consumed number is burned
 * (gap in sequence) — that's acceptable.
 *
 * Pass the transaction client (`tx`) when called inside `prisma.$transaction`
 * so the read participates in the same statement timeout / isolation.
 */
export async function nextRbNumber(
  client: Prisma.TransactionClient,
): Promise<string> {
  const rows = await client.$queryRaw<Array<{ next: bigint }>>`
    SELECT nextval('rb_number_seq') AS next
  `;
  return `RB${rows[0].next}`;
}
