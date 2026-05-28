// scripts/create-admin.ts
// Thin CLI wrapper around createAdminUser. Run as:
//
//   npm run admin:create -- --email founder@dressingbear.com \
//     --password 'StrongPass1' --name 'Founder' [--promote]
//
// On Vercel/CI, DATABASE_URL is already in process.env. For local runs
// we load .env / .env.local the same way prisma/seed.ts does.
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { createAdminUser } from "@/app/_lib/admin-seed";

for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      password: { type: "string" },
      name: { type: "string" },
      promote: { type: "boolean", default: false },
      help: { type: "boolean", default: false, short: "h" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(
      "Usage: npm run admin:create -- --email <email> --password <pw> --name <name> [--promote]\n\n" +
        "  --email     required\n" +
        "  --password  required, min 8 chars with a letter and a number\n" +
        "  --name      required, min 2 chars\n" +
        "  --promote   if the email is an existing CUSTOMER, flip them to ADMIN\n" +
        "              (password is NOT changed by promotion)\n",
    );
    process.exit(0);
  }

  if (!values.email || !values.password || !values.name) {
    fail("Missing required flag. Run with --help for usage.");
  }

  const result = await createAdminUser({
    email: values.email,
    password: values.password,
    name: values.name,
    promote: values.promote ?? false,
  });

  if (!result.ok) {
    fail(result.message);
  }

  if (result.action === "created") {
    console.log(`✓ Admin created: ${values.email} (id: ${result.userId})`);
  } else {
    console.log(`✓ User promoted to admin: ${values.email} (id: ${result.userId})`);
  }
}

main().catch((err) => {
  console.error("✗ Unexpected error:", err);
  process.exit(1);
});
