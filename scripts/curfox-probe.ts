/* eslint-disable no-console */
// Lightweight Curfox diagnostic. Tries just the login step — does NOT
// create a real (billable) order. If login succeeds, the credentials and
// network path to Curfox are working; the silent dispatch-email failure is
// happening downstream (city lookup, order create, or PDF fetch). If login
// fails, you'll see the exact HTTP status + response body from Curfox.
import { existsSync } from "node:fs";
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

async function main() {
  const user = process.env.ROYAL_EXPRESS_USER;
  const pass = process.env.ROYAL_EXPRESS_PASS;
  const tenant = process.env.ROYAL_EXPRESS_TENANT ?? "royalexpress";
  const loginBase = process.env.CURFOX_LOGIN_BASE_URL ?? "https://v1.api.curfox.com";
  const opsBase = process.env.CURFOX_BASE_URL ?? "https://v2-operations.api.curfox.com";
  const enabled = process.env.ROYAL_EXPRESS_ENABLED;

  console.log("=== env (sensitive masked) ===");
  console.log("ROYAL_EXPRESS_ENABLED:", enabled);
  console.log("ROYAL_EXPRESS_USER:", user);
  console.log("ROYAL_EXPRESS_PASS:", pass ? `***(len=${pass.length})` : "(unset)");
  console.log("ROYAL_EXPRESS_TENANT:", tenant);
  console.log("CURFOX_LOGIN_BASE_URL:", loginBase);
  console.log("CURFOX_BASE_URL:", opsBase);
  console.log();

  if (!user || !pass) {
    console.error("✗ Credentials missing in .env.local — aborting.");
    process.exit(2);
  }

  const url = `${loginBase}/api/public/merchant/login`;
  console.log("=== POST", url, "===");
  console.log("X-Tenant:", tenant);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Tenant": tenant,
      },
      body: JSON.stringify({ email: user, password: pass }),
    });
  } catch (err: any) {
    console.error("✗ Network error reaching Curfox login endpoint:");
    console.error("  ", err.message ?? err);
    process.exit(3);
  }

  console.log("HTTP status:", res.status, res.statusText);
  const bodyText = await res.text();
  console.log("Response body (first 500 chars):");
  console.log(bodyText.slice(0, 500));
  console.log();

  if (!res.ok) {
    console.error("✗ Curfox login REJECTED.");
    console.error(
      "Most common causes: wrong ROYAL_EXPRESS_USER/PASS, wrong tenant,",
      "credentials revoked, or account locked.",
    );
    process.exit(1);
  }

  let token = "";
  try {
    const json = JSON.parse(bodyText);
    token =
      (json.token as string | undefined) ??
      (json.access_token as string | undefined) ??
      (json.data?.token as string | undefined) ??
      "";
  } catch {
    /* fall through */
  }

  if (!token) {
    console.error("✗ Login HTTP 2xx but no token field in response.");
    process.exit(1);
  }

  console.log("✓ Login OK — token received (length:", token.length, ").");
  console.log(
    "Next bottleneck candidates if dispatch emails still don't fire:",
    "\n  - CurfoxCity lookup (resolveCurfoxCity in book-courier.ts)",
    "\n  - Order-create call (createCurfoxOrder)",
    "\n  - PDF fetch (getCurfoxWaybillPdf)",
    "\nCheck the dev-server log for [curfox] and [mailer] lines on the next real order.",
  );
}

main().catch((e) => {
  console.error("unexpected:", e);
  process.exit(99);
});
