import path from "node:path";
import { defineConfig } from "prisma/config";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// When TURSO_DATABASE_URL is set (Netlify production + previews) Prisma's
// CLI runs migrations through the libSQL adapter against Turso. Without it
// (local dev), Prisma falls back to the classic SQLite engine and reads
// the file URL from prisma/schema.prisma's datasource block.
const tursoUrl = process.env.TURSO_DATABASE_URL;

export default defineConfig(
  tursoUrl
    ? {
        schema: path.join("prisma", "schema.prisma"),
        engine: "js",
        adapter: async () =>
          new PrismaLibSQL({
            url: tursoUrl,
            authToken: process.env.TURSO_AUTH_TOKEN,
          }),
      }
    : {
        schema: path.join("prisma", "schema.prisma"),
      },
);
