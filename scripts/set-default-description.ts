// One-off: set every product's description to the short default.
// seed.ts (DEFAULT_DESCRIPTION) is the source of truth for fresh seeds; this
// applies the same text to the already-seeded dev DB without a full FORCE_SEED.
// Run: npx tsx scripts/set-default-description.ts
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const DEFAULT_DESCRIPTION = `Premium 220 GSM T-Shirt made with a comfortable 65% cotton and 35% polyester blend. Designed for everyday wear with a soft feel, durable fabric, and a clean modern fit. The material is breathable, long-lasting, and perfect for casual outfits, streetwear, or high-quality DTF printed designs.

**Wash Care:** Wash inside out with cold or normal water. Use hand wash or gentle machine wash. Do not bleach, tumble dry, or iron directly on the print. Dry in shade to maintain fabric quality and print durability.`;

const prisma = new PrismaClient();

async function main() {
  const res = await prisma.product.updateMany({ data: { description: DEFAULT_DESCRIPTION } });
  console.log(`[set-default-description] Updated ${res.count} products.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
