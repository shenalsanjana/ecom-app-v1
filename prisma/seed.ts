import { existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { categories, featuredProducts, dealsProducts } from "../app/_data/mock";

// Load Next.js-convention env files for local runs (`tsx prisma/seed.ts`).
// On Vercel/CI, DATABASE_URL is already in process.env and these files are
// absent, so this is a no-op.
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const prisma = new PrismaClient();

// Resolve a product image path. Prefers real photos at
// public/products/<id>/main.jpg + 1.jpg..4.jpg when present and falls back to
// the demo SVG (main.svg) otherwise. Generate demos with:
//   npx tsx scripts/generate-demo-images.ts
function publicPath(...parts: string[]): string {
  return join(process.cwd(), "public", ...parts);
}

function pickProductMain(productId: string): string {
  const candidates = ["main.jpg", "main.jpeg", "main.png", "main.webp", "main.svg"];
  for (const file of candidates) {
    if (existsSync(publicPath("products", productId, file))) {
      return `/products/${productId}/${file}`;
    }
  }
  return `/products/${productId}/main.svg`;
}

const REVIEW_AUTHORS = [
  "Nethmi Perera", "Sanuli Fernando", "Tharushi Silva", "Senuri Jayawardena",
  "Dinuli Perera", "Oneli Fernando", "Yehani Silva", "Shenaya Wijesinghe",
  "Kavindi Perera", "Methmi Fernando", "Thevini Silva", "Sayuni Jayasinghe",
  "Himashi Bandara", "Rashmi Perera", "Dinethmi Fernando", "Vihangi Silva",
  "Lithumi Perera", "Senuji Fernando", "Amaaya Silva",
];

const REVIEW_TITLES = [
  "Loving it so far",
  "Solid quality",
  null,
  "Better than expected",
  "Would buy again",
  null,
  "Great gift",
  "Not bad for the price",
];

const REVIEW_BODIES = [
  "Worked exactly as described. Shipping was quick and packaging was clean.",
  "Quality feels above the price point. A few small nitpicks but nothing dealbreaking.",
  "Has held up well after a few weeks of daily use. Recommended.",
  "Solid build, looks good, does the job. No complaints.",
  "Bought as a gift — they loved it. Would order again.",
  "Took a bit to get used to but now I use it constantly.",
  "Fine. Nothing remarkable but no obvious flaws either.",
  "Exceeded my expectations honestly. Glad I picked this one.",
];

const RATING_POOL = [5, 5, 5, 4, 4, 4, 4, 3, 3, 2];

// Stable per-product RNG so reseeds produce the same data.
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

// Short, consistent default description for the T-shirt catalog (rendered as
// markdown on the product page). Product-agnostic so every item reads the same.
const DEFAULT_DESCRIPTION = `Premium 220 GSM T-Shirt made with a comfortable 65% cotton and 35% polyester blend. Designed for everyday wear with a soft feel, durable fabric, and a clean modern fit. The material is breathable, long-lasting, and perfect for casual outfits, streetwear, or high-quality DTF printed designs.

**Wash Care:** Wash inside out with cold or normal water. Use hand wash or gentle machine wash. Do not bleach, tumble dry, or iron directly on the print. Dry in shade to maintain fabric quality and print durability.`;

function stockFor(productId: string): number {
  const rng = rngFromId(productId + ":stock");
  return 5 + Math.floor(rng() * 21);      // 5..25
}

async function main() {
  const existingCategoryCount = await prisma.category.count();
  if (existingCategoryCount > 0 && process.env.FORCE_SEED !== "true") {
    console.log(
      `[seed] Skipping: ${existingCategoryCount} categories already present. ` +
      `Set FORCE_SEED=true to override.`,
    );
    return;
  }

  if (existingCategoryCount > 0) {
    console.log(
      `[seed] FORCE_SEED=true detected; reseeding over ${existingCategoryCount} existing categories.`,
    );
  }

  // Categories
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, image: c.image },
      create: { slug: c.slug, name: c.name, image: c.image },
    });
  }

  const all = [...featuredProducts, ...dealsProducts];

  // Products (image resolved from public/products/<id>/, description, stock, sizes)
  for (const p of all) {
    const image = pickProductMain(p.id);
    const description = DEFAULT_DESCRIPTION;
    const stock = stockFor(p.id);

    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        price: p.price,
        originalPrice: p.originalPrice ?? null,
        image,
        description,
        stock,
        categorySlug: p.category,
        sizes: "S,M,L,XL",
      },
      create: {
        id: p.id,
        name: p.name,
        price: p.price,
        originalPrice: p.originalPrice ?? null,
        image,
        description,
        stock,
        categorySlug: p.category,
        sizes: "S,M,L,XL",
      },
    });

    // ProductImage rows: one per real gallery file (1.jpg, 2.jpg, ...) under
    // public/products/<id>/. Stops at the first missing index so we don't
    // create duplicate rows pointing at main.jpg.
    await prisma.productImage.deleteMany({ where: { productId: p.id } });
    const galleryRows: { productId: string; url: string; sortOrder: number }[] = [];
    for (let n = 1; n <= 8; n++) {
      const candidates = [`${n}.jpg`, `${n}.jpeg`, `${n}.png`, `${n}.webp`];
      const found = candidates.find((file) =>
        existsSync(publicPath("products", p.id, file)),
      );
      if (!found) break;
      galleryRows.push({
        productId: p.id,
        url: `/products/${p.id}/${found}`,
        sortOrder: n,
      });
    }
    if (galleryRows.length > 0) {
      await prisma.productImage.createMany({ data: galleryRows });
    }

    // Review rows (5..10 per product, deterministic).
    await prisma.review.deleteMany({ where: { productId: p.id } });
    const rng = rngFromId(p.id + ":reviews");
    const count = 5 + Math.floor(rng() * 6); // 5..10
    const reviews = Array.from({ length: count }, () => {
      const daysAgo = Math.floor(rng() * 90);
      const createdAt = new Date(Date.now() - daysAgo * 86400_000);
      return {
        productId: p.id,
        authorName: pick(REVIEW_AUTHORS, rng),
        rating: pick(RATING_POOL, rng),
        title: pick(REVIEW_TITLES, rng),
        body: pick(REVIEW_BODIES, rng),
        createdAt,
      };
    });
    await prisma.review.createMany({ data: reviews });
  }

  // FORCE_SEED runs replace the catalog wholesale, so prune any products and
  // categories left over from a previous catalog. Product cascades to its
  // images, reviews, and wishlist items; Category needs its products gone
  // first (no onDelete on the Product->Category relation, so RESTRICT).
  if (process.env.FORCE_SEED === "true") {
    const newProductIds = all.map((p) => p.id);
    const newCategorySlugs = categories.map((c) => c.slug);
    const stalePrd = await prisma.product.deleteMany({
      where: { id: { notIn: newProductIds } },
    });
    const staleCat = await prisma.category.deleteMany({
      where: { slug: { notIn: newCategorySlugs } },
    });
    if (stalePrd.count > 0 || staleCat.count > 0) {
      console.log(
        `[seed] Removed stale catalog rows: ${stalePrd.count} products, ${staleCat.count} categories.`,
      );
    }
  }

  const totalImages = await prisma.productImage.count();
  const totalReviews = await prisma.review.count();
  console.log(
    `Seeded ${categories.length} categories, ${all.length} products, ${totalImages} images, ${totalReviews} reviews.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
