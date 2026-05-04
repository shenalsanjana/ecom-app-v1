import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// Prisma still validates schema.prisma's `url = env("DATABASE_URL")` when a
// driver adapter is supplied, so we satisfy it with a placeholder when the
// libSQL adapter will own the real connection. Mirrors prisma.config.ts so
// this also works during `next build` (which never loads prisma.config.ts).
if (process.env.TURSO_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./placeholder.db";
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  const log: Prisma.LogLevel[] =
    process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

  if (process.env.TURSO_DATABASE_URL) {
    const adapter = new PrismaLibSQL({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter, log });
  }

  return new PrismaClient({ log });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
