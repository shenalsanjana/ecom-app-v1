// scripts/ensure-admin.ts
//
// Idempotent admin bootstrap. Runs automatically during `vercel build` via
// the buildCommand in vercel.json, ensuring the default admin user exists
// in production immediately after each deploy. Also runnable locally via
// `npm run admin:ensure`.
//
// Behaviour:
//   • admin user does not exist          → creates it (bcrypt-hashed password,
//                                            role = "ADMIN") and logs "Sample
//                                            admin created"
//   • admin user exists, role = ADMIN    → logs "Admin already exists" (no-op)
//   • admin user exists, role = CUSTOMER → logs a warning; does NOT auto-
//                                            promote (use `npm run admin:create
//                                            --promote` for that)
//   • any unexpected error               → logs and exits 0 (does NOT break the
//                                            build; admin can be created
//                                            manually via `npm run admin:create`)
//
// Credentials default to the public values committed in README.md. Override per
// environment via SAMPLE_ADMIN_EMAIL / SAMPLE_ADMIN_PASSWORD / SAMPLE_ADMIN_NAME
// (set in Vercel Project Settings → Environment Variables for prod overrides).

import { existsSync } from "node:fs";
import { createAdminUser } from "@/app/_lib/admin-seed";

// Local runs (npm run admin:ensure) need .env / .env.local loaded so prisma
// sees DATABASE_URL. On Vercel the env is already in process.env and these
// files are absent — the loop is a no-op there.
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const DEFAULT_EMAIL = "dressingbear@gmail.com";
const DEFAULT_PASSWORD = "1996@Abc";
const DEFAULT_NAME = "Dressing Bear";

async function main(): Promise<void> {
  const email = process.env.SAMPLE_ADMIN_EMAIL ?? DEFAULT_EMAIL;
  const password = process.env.SAMPLE_ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
  const name = process.env.SAMPLE_ADMIN_NAME ?? DEFAULT_NAME;

  console.log(`[ensure-admin] Checking sample admin: ${email}`);

  const result = await createAdminUser({ email, password, name, promote: false });

  if (result.ok) {
    // createAdminUser only returns ok:true for "created" or "promoted". With
    // promote=false we never promote, so action will always be "created" here.
    console.log(`[ensure-admin] ✓ Sample admin created: ${email}`);
    return;
  }

  if (result.reason === "already_admin") {
    console.log(`[ensure-admin] ✓ Admin already exists: ${email}`);
    return;
  }

  if (result.reason === "needs_promote_flag") {
    console.warn(
      `[ensure-admin] ! Email ${email} is registered as a CUSTOMER. ` +
        `Not auto-promoting. Run 'npm run admin:create -- --email "${email}" ` +
        `--password "<new-strong-pw>" --name "${name}" --promote' if intended.`,
    );
    return;
  }

  // invalid_input — shouldn't happen with the defaults, but surface it loudly
  // if someone misconfigured the SAMPLE_ADMIN_* env vars.
  console.warn(
    `[ensure-admin] ! Sample admin not created (${result.reason}): ${result.message}`,
  );
}

main()
  .catch((err) => {
    // Soft-fail: don't break the build for admin seeding. The admin can still
    // be created manually via `npm run admin:create`. Log loudly so the issue
    // is visible in build output.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[ensure-admin] ! Sample admin seed failed (non-fatal): ${message}`);
  })
  .finally(() => {
    // Force exit 0 so Vercel's buildCommand chain continues to next build.
    // Prisma's connection pool is reaped by process exit.
    process.exit(0);
  });
