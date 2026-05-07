import path from "node:path";
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Defining prisma.config.ts disables Prisma CLI's default .env autoloading.
// Re-load Next.js-convention env files so DATABASE_URL reaches `prisma
// generate`, `prisma migrate`, and `tsx prisma/seed.ts`.
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
});
