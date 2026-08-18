// Koko orderView diagnostic. READ-ONLY — calls Koko's `orderView` lookup for one
// or more order ids and dumps the RAW response. It never mutates an order, never
// calls orderCreate, and never writes to the database.
//
// Why this exists: `fetchKokoOrderStatus()` in app/_lib/payments/koko.ts collapses
// EVERY failure mode (network error, non-200, unexpected envelope shape, unknown
// status token) into the single value "PENDING". When Koko payments succeed at the
// gateway but orders stay at "awaiting payment", the DB alone cannot tell you which
// of those layers broke. This probe separates them.
//
// Usage:
//   npx tsx scripts/koko-probe.ts <orderId> [<orderId> ...]
//   npx tsx scripts/koko-probe.ts --recent 5     # pull recent KOKO orders from the DB
import { existsSync } from "node:fs";
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

import { getKokoConfig } from "../app/_lib/payments/config";
import { signKokoOrderViewString } from "../app/_lib/payments/koko";

function mask(value: string | undefined): string {
  if (!value) return "(unset)";
  if (value.length <= 8) return `***(len=${value.length})`;
  return `${value.slice(0, 4)}…${value.slice(-2)} (len=${value.length})`;
}

// On the VPS host shell, DATABASE_URL points at the docker-network hostname
// `postgres`, which does not resolve outside the compose network. Postgres is
// published on 127.0.0.1:5432, so rewrite the host for this read-only script.
function reachableDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.hostname === "postgres") {
      url.hostname = "127.0.0.1";
      console.log("(rewrote DATABASE_URL host postgres -> 127.0.0.1 for host-shell access)");
      return url.toString();
    }
  } catch {
    /* leave as-is; prisma will report the real problem */
  }
  return raw;
}

async function recentKokoOrderIds(limit: number): Promise<string[]> {
  const rewritten = reachableDatabaseUrl();
  if (rewritten) process.env.DATABASE_URL = rewritten;
  const { prisma } = await import("../app/_lib/prisma");
  const orders = await prisma.order.findMany({
    where: { paymentMethod: "KOKO" },
    select: { id: true, webNumber: true, paymentStatus: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  console.log("=== recent KOKO orders in the database ===");
  if (orders.length === 0) console.log("(none found)");
  for (const o of orders) {
    console.log(
      `  ${o.id}  web=${o.webNumber ?? "-"}  paymentStatus=${o.paymentStatus}  status=${o.status}  ${o.createdAt.toISOString()}`,
    );
  }
  console.log();
  return orders.map((o) => o.id);
}

async function probeOrder(orderId: string, cfg: ReturnType<typeof getKokoConfig>) {
  console.log(`=== orderView probe: ${orderId} ===`);

  const body = new URLSearchParams({
    _mId: cfg.merchantId,
    _pluginName: cfg.pluginName,
    _pluginVersion: cfg.pluginVersion,
    api_key: cfg.apiKey,
    _orderId: orderId,
    signature: signKokoOrderViewString({
      merchantId: cfg.merchantId,
      pluginName: cfg.pluginName,
      pluginVersion: cfg.pluginVersion,
      orderId,
      apiKey: cfg.apiKey,
      privateKey: cfg.privateKey,
    }),
  });

  console.log("POST", cfg.orderViewUrl);
  console.log("  _mId           :", mask(cfg.merchantId));
  console.log("  _pluginName    :", cfg.pluginName);
  console.log("  _pluginVersion :", cfg.pluginVersion);
  console.log("  _orderId       :", orderId);
  console.log("  signature      : (RSA-SHA256 over _mId+_pluginName+_pluginVersion+_orderId+api_key)");

  let res: Response;
  const startedAt = Date.now();
  try {
    res = await fetch(cfg.orderViewUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    console.error("✗ LAYER 1 (network): request to Koko threw.");
    console.error("  ", err instanceof Error ? err.message : err);
    console.error("  -> fetchKokoOrderStatus() would swallow this and return PENDING.");
    console.log();
    return;
  }

  const elapsed = Date.now() - startedAt;
  const text = await res.text();
  console.log(`HTTP ${res.status} ${res.statusText} (${elapsed}ms)`);
  console.log("Content-Type:", res.headers.get("content-type") ?? "(none)");
  console.log("--- raw body ---");
  console.log(text.slice(0, 2000));
  console.log("--- end body ---");

  if (!res.ok) {
    console.error("✗ LAYER 2 (HTTP): non-OK response.");
    console.error("  -> fetchKokoOrderStatus() returns PENDING; the order can never be finalized.");
    console.log();
    return;
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("✗ LAYER 3 (parse): body is not JSON.");
    console.error("  -> response.json() throws; fetchKokoOrderStatus() returns PENDING.");
    console.log();
    return;
  }

  console.log("--- parsed shape ---");
  console.log("top-level keys :", Object.keys(json as object).join(", ") || "(none)");
  const record = json as Record<string, unknown>;
  const data = record.data;
  if (data && typeof data === "object") {
    console.log("data is        :", Array.isArray(data) ? `array(len=${data.length})` : "object");
    if (!Array.isArray(data)) {
      console.log("data keys      :", Object.keys(data as object).join(", ") || "(none)");
    }
  } else {
    console.log("data           :", JSON.stringify(data));
  }

  // Replicate exactly what fetchKokoOrderStatus() does today.
  const payload = (record.data ?? record) as Record<string, unknown>;
  const extracted = payload?.status;
  const coerced = (extracted ?? "PENDING") as string;
  const recognized = coerced === "SUCCESS" || coerced === "FAILED" || coerced === "PENDING";

  console.log("--- what fetchKokoOrderStatus() sees today ---");
  console.log("  payload source :", record.data ? "json.data" : "json (flat)");
  console.log("  payload.status :", JSON.stringify(extracted));
  console.log("  recognized     :", recognized);
  console.log("  RETURNS        :", recognized ? coerced : "PENDING (unrecognized token -> defaulted)");

  if (!recognized || coerced === "PENDING") {
    console.error("✗ LAYER 4 (status extraction): does NOT resolve to SUCCESS.");
    console.error("  -> finalizePaidPayment() is never called; the order stays 'awaiting payment'.");
    console.error("  -> Compare the raw body above against the parser in app/_lib/payments/koko.ts.");
  } else if (coerced === "SUCCESS") {
    console.log("✓ Status resolves to SUCCESS — the orderView layer is healthy for this order.");
    console.log("  -> If the order is still PENDING in the DB, the break is downstream:");
    console.log("     the callback routes were never invoked, or finalizePaidPayment() bailed");
    console.log("     (order_not_found / payment_method_mismatch).");
  }
  console.log();
}

async function main() {
  const args = process.argv.slice(2);

  let cfg: ReturnType<typeof getKokoConfig>;
  try {
    cfg = getKokoConfig();
  } catch (err) {
    console.error("✗ LAYER 0 (config): required Koko env vars are missing.");
    console.error("  ", err instanceof Error ? err.message : err);
    console.error("  -> getKokoConfig() throws inside fetchKokoOrderStatus()'s try block,");
    console.error("     which returns PENDING — every Koko order would stay 'awaiting payment'.");
    process.exit(2);
  }

  console.log("=== Koko config (secrets masked) ===");
  console.log("KOKO_ENABLED         :", process.env.KOKO_ENABLED);
  console.log("NEXT_PUBLIC_KOKO_ENABLED:", process.env.NEXT_PUBLIC_KOKO_ENABLED);
  console.log("KOKO_MODE            :", process.env.KOKO_MODE, `-> resolved mode: ${cfg.mode}`);
  console.log("KOKO_MERCHANT_ID     :", mask(cfg.merchantId));
  console.log("KOKO_API_KEY         :", mask(cfg.apiKey));
  console.log("KOKO_PRIVATE_KEY     :", cfg.privateKey ? `present (len=${cfg.privateKey.length})` : "(unset)");
  console.log("KOKO_PUBLIC_KEY      :", cfg.publicKey ? `present (len=${cfg.publicKey.length})` : "(unset)");
  console.log("KOKO_PLUGIN_NAME     :", cfg.pluginName);
  console.log("KOKO_PLUGIN_VERSION  :", cfg.pluginVersion);
  console.log("orderCreateUrl       :", cfg.orderCreateUrl);
  console.log("orderViewUrl         :", cfg.orderViewUrl);
  console.log("APP_URL              :", process.env.APP_URL);
  console.log();

  let orderIds: string[];
  if (args[0] === "--recent") {
    orderIds = await recentKokoOrderIds(Number(args[1] ?? 5));
  } else {
    orderIds = args.filter((a) => !a.startsWith("--"));
  }

  if (orderIds.length === 0) {
    console.error("No order ids to probe.");
    console.error("Usage: npx tsx scripts/koko-probe.ts <orderId> [...]");
    console.error("       npx tsx scripts/koko-probe.ts --recent 5");
    process.exit(2);
  }

  for (const orderId of orderIds) {
    await probeOrder(orderId, cfg);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
