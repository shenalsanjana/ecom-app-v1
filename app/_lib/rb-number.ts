// app/_lib/rb-number.ts
// Sequence-backed generator for the customer-facing order reference
// `RB####`. Atomic, race-free, never resets.

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
