import { existsSync } from "node:fs";

for (const file of [".env", ".env.local"]) if (existsSync(file)) process.loadEnvFile(file);

async function main() {
  const secret = process.env.RECONCILIATION_SECRET;
  if (!secret) throw new Error("RECONCILIATION_SECRET must be configured in both the app and this job.");
  const response = await fetch(new URL("/api/internal/reconcile-unpaid", process.env.APP_URL || "http://127.0.0.1:3000"), {
    method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(600_000),
  });
  if (!response.ok) throw new Error(`Reconciliation request failed (${response.status}).`);
  const results = await response.json() as { orderId: string; status: string }[];
  for (const result of results) console.log(JSON.stringify(result));
  if (results.some((result) => result.status === "retry_required")) process.exitCode = 1;
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Reconciliation failed"); process.exitCode = 1; });
