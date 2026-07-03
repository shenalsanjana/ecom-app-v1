// One-off: rewrite SYNTHETIC review content (author, rating, title, body) with
// realistic, category-aware copy from app/_data/review-content.ts (the same
// source seed.ts uses). Reviews with synthetic=false (e.g. real submissions from
// the future review form) are never touched.
//
// Run:  npx tsx scripts/update-review-content.ts --dry-run   # preview counts
//       npx tsx scripts/update-review-content.ts             # apply
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  REVIEW_AUTHORS,
  reviewPoolForCategory,
} from "../app/_data/review-content";

for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const DRY_RUN = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

// Stable FNV-1a hash so each review's assignment is deterministic across reruns.
function hashToInt(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

async function main() {
  const reviews = await prisma.review.findMany({
    where: { synthetic: true },
    select: { id: true, product: { select: { categorySlug: true } } },
  });

  const perCategory: Record<string, number> = {};

  for (const r of reviews) {
    const slug = r.product.categorySlug;
    const pool = reviewPoolForCategory(slug);
    const tpl = pool[hashToInt(r.id) % pool.length];
    const author =
      REVIEW_AUTHORS[hashToInt(r.id + ":author") % REVIEW_AUTHORS.length];

    perCategory[slug] = (perCategory[slug] ?? 0) + 1;

    if (!DRY_RUN) {
      await prisma.review.update({
        where: { id: r.id },
        data: {
          authorName: author,
          rating: tpl.rating,
          title: tpl.title,
          body: tpl.body,
        },
      });
    }
  }

  const summary =
    Object.entries(perCategory)
      .map(([slug, n]) => `${slug}: ${n}`)
      .join(", ") || "none";
  console.log(
    `[update-review-content] ${DRY_RUN ? "DRY RUN — would update" : "Updated"} ` +
      `${reviews.length} synthetic reviews (${summary}).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
