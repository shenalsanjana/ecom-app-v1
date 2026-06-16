// Seeds the CurfoxCity table from the committed catalogue
// (app/_lib/courier/curfox-cities.json) — NO network call. The catalogue is
// already the booking-time source of truth via app/_lib/courier/catalogue.ts;
// this populates the DB too so admin tooling / overrides have rows to read.
//
// Safe by design: UPSERT-ONLY, keyed on the Curfox city id. It never deletes,
// so a future partial catalogue can only add/refresh rows, never shrink the
// table. Pass --dry-run to preview counts without writing.
//
//   npm run curfox:seed            # apply
//   npm run curfox:seed -- --dry-run
import { existsSync, readFileSync } from "node:fs";
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
import { prisma } from "../app/_lib/prisma";

type City = { id: number; name: string; district: string; warehouseId: number | null };

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const raw = readFileSync("app/_lib/courier/curfox-cities.json", "utf8");
  const { meta, cities } = JSON.parse(raw) as {
    meta: { cityCount: number; districts: string[] };
    cities: City[];
  };

  console.log("=== Curfox city seed ===");
  console.log(`catalogue: ${cities.length} cities across ${meta.districts.length} districts`);

  const before = await prisma.curfoxCity.count();
  console.log(`CurfoxCity rows before: ${before}`);

  if (dryRun) {
    console.log("\n[--dry-run] no writes performed. Would upsert", cities.length, "rows.");
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (const c of cities) {
    await prisma.curfoxCity.upsert({
      where: { id: c.id },
      create: { id: c.id, name: c.name, defaultWarehouseId: c.warehouseId ?? null },
      update: { name: c.name, defaultWarehouseId: c.warehouseId ?? null },
    });
    if (++done % 250 === 0) console.log(`  upserted ${done}/${cities.length}…`);
  }

  const after = await prisma.curfoxCity.count();
  console.log(`\n✓ upserted ${done} cities. CurfoxCity rows after: ${after} (was ${before}).`);
  console.log("Note: upsert-only — no rows were deleted.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("seed failed:", e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
