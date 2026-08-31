// One-off: generate realistic, category-aware seeded reviews for products that
// currently have NONE. Additive and idempotent — any product that already has at
// least one review is skipped, so real customer submissions are never touched.
// Reads the actual product list from the DB, so it covers every category
// (cat / dino / stitch) and admin-created products. Rows are written with
// synthetic=true, approved=true so they appear on the storefront immediately.
//
// Unlike scripts/update-review-content.ts (which only rewrites existing synthetic
// reviews), this CREATES reviews for products that have none.
//
// Run:  npx tsx scripts/generate-product-reviews.ts --dry-run   # preview counts
//       npx tsx scripts/generate-product-reviews.ts             # apply
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

// Stable per-product RNG so reruns produce the same data (mirrors prisma/seed.ts).
function rngFromId(id: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 0xffffffff;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

async function main() {
  // Non-archived products and their current review count.
  const products = await prisma.product.findMany({
    where: { archived: false },
    select: {
      id: true,
      designSlug: true,
      _count: { select: { reviews: true } },
    },
    orderBy: { id: "asc" },
  });

  const targets = products.filter((p) => p._count.reviews === 0);

  const perCategory: Record<string, { products: number; reviews: number }> = {};
  let totalReviews = 0;

  for (const p of targets) {
    const rng = rngFromId(p.id + ":reviews");
    const count = 5 + Math.floor(rng() * 6); // 5..10
    const rows = Array.from({ length: count }, () => {
      const daysAgo = Math.floor(rng() * 90);
      const createdAt = new Date(Date.now() - daysAgo * 86400_000);
      const tpl = pick(reviewPoolForCategory(p.designSlug), rng);
      return {
        productId: p.id,
        authorName: pick(REVIEW_AUTHORS, rng),
        rating: tpl.rating,
        title: tpl.title,
        body: tpl.body,
        createdAt,
        synthetic: true,
        approved: true,
      };
    });

    const bucket = (perCategory[p.designSlug] ??= { products: 0, reviews: 0 });
    bucket.products += 1;
    bucket.reviews += rows.length;
    totalReviews += rows.length;

    if (!DRY_RUN) {
      await prisma.review.createMany({ data: rows });
    }
  }

  const skipped = products.length - targets.length;
  const summary =
    Object.entries(perCategory)
      .map(([slug, b]) => `${slug}: ${b.products} products / ${b.reviews} reviews`)
      .join(", ") || "none";
  console.log(
    `[generate-product-reviews] ${DRY_RUN ? "DRY RUN — would create" : "Created"} ` +
      `${totalReviews} reviews across ${targets.length} products (${summary}). ` +
      `Skipped ${skipped} products that already have reviews.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
