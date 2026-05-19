import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Ensures DATABASE_URL has a conservative pool size before Prisma reads it.
 *
 * Hosted PostgreSQL with low per-role connection caps (e.g., Prisma Postgres)
 * runs out of connections during `next build`: each spawned page-render
 * process creates its own PrismaClient with the default pool size of
 * `num_cpus * 2 + 1` (5 on a 2-core build VM). With sequential static
 * generation across many pages, the role's connection cap is exhausted and
 * the build fails with `P2037: too many connections`.
 *
 * Defaulting to `connection_limit=2` keeps each client lean while leaving
 * room for the runtime workload. Operator-provided values in the URL win.
 */
export function withPoolDefaults(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", "2");
    }
    if (!u.searchParams.has("pool_timeout")) {
      u.searchParams.set("pool_timeout", "20");
    }
    return u.toString();
  } catch {
    return url;
  }
}

function createPrisma(): PrismaClient {
  const log: Prisma.LogLevel[] =
    process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];
  const datasourceUrl = withPoolDefaults(process.env.DATABASE_URL);
  return new PrismaClient({ log, datasourceUrl });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
