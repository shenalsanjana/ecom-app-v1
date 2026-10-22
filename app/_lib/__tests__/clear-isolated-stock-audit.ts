import type { PrismaClient } from "@prisma/client";

/** Fixture teardown only. Never imported by production code. */
export async function clearIsolatedStockAudit(client: PrismaClient, databaseUrl?: string) {
  if (!databaseUrl) throw new Error("Explicit isolated database URL required for fixture teardown");
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "postgres"].includes(url.hostname) || !url.pathname.endsWith("_test")) throw new Error("Fixture teardown requires a local *_test database");
  // Truncation is limited to the explicitly isolated test database. Production
  // audit rows reject UPDATE/DELETE and have no application deletion endpoint.
  await client.$executeRawUnsafe('TRUNCATE TABLE "StockMovement", "StockOperation"');
}
