// app/_lib/web-number.ts
// Sequence-backed generator for the customer-facing order reference `WEB####`.
// Atomic, race-free, never resets.

import type { Prisma } from "@prisma/client";

/**
 * Returns the next WEB-prefixed order number, e.g. "WEB0042".
 *
 * Backed by the Postgres sequence `web_number_seq`. nextval() is atomic, so
 * concurrent inserts cannot collide. 4-digit zero-padded for values 1..9999;
 * naturally grows to 5+ digits past that (WEB10000, WEB10001, …).
 *
 * If the surrounding transaction rolls back, the consumed number is burned
 * (gap in sequence) — that's acceptable.
 *
 * Pass the transaction client (`tx`) when called inside `prisma.$transaction`
 * so the read participates in the same statement timeout / isolation.
 */
export async function nextWebNumber(
  client: Prisma.TransactionClient,
): Promise<string> {
  const rows = await client.$queryRaw<Array<{ next: bigint }>>`
    SELECT nextval('web_number_seq') AS next
  `;
  return `WEB${String(rows[0].next).padStart(4, "0")}`;
}
