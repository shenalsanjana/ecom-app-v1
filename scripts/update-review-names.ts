// One-off: reassign existing review author names to the new list.
// seed.ts (REVIEW_AUTHORS) is the source of truth for fresh seeds; this applies
// the same names to the already-seeded dev DB without a full FORCE_SEED.
// Run: npx tsx scripts/update-review-names.ts
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const NAMES = [
  "Nethmi Perera", "Sanuli Fernando", "Tharushi Silva", "Senuri Jayawardena",
  "Dinuli Perera", "Oneli Fernando", "Yehani Silva", "Shenaya Wijesinghe",
  "Kavindi Perera", "Methmi Fernando", "Thevini Silva", "Sayuni Jayasinghe",
  "Himashi Bandara", "Rashmi Perera", "Dinethmi Fernando", "Vihangi Silva",
  "Lithumi Perera", "Senuji Fernando", "Amaaya Silva",
];

const prisma = new PrismaClient();

async function main() {
  // Order by (productId, createdAt) so the rotation stays varied within each
  // product (5..10 reviews each) and every name gets used across the dataset.
  const reviews = await prisma.review.findMany({
    orderBy: [{ productId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  let i = 0;
  for (const r of reviews) {
    await prisma.review.update({
      where: { id: r.id },
      data: { authorName: NAMES[i % NAMES.length] },
    });
    i++;
  }

  console.log(`[update-review-names] Updated ${reviews.length} reviews across the new ${NAMES.length}-name pool.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
