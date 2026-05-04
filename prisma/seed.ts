import { existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { categories, featuredProducts, dealsProducts } from "../app/_data/mock";

// Mirrors app/_lib/prisma.ts: when running against Turso, use the libSQL
// driver adapter and satisfy schema.prisma's DATABASE_URL validation with a
// placeholder. Without this, seeding from a build env that has only
// TURSO_DATABASE_URL would either fail validation or silently write to a
// local SQLite file instead of the remote DB.
if (process.env.TURSO_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./placeholder.db";
}

const prisma = process.env.TURSO_DATABASE_URL
  ? new PrismaClient({
      adapter: new PrismaLibSQL({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }),
    })
  : new PrismaClient();

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

function pickGalleryImage(productId: string, index: number): string {
  const candidates = [`${index}.jpg`, `${index}.jpeg`, `${index}.png`, `${index}.webp`];
  for (const file of candidates) {
    if (existsSync(publicPath("products", productId, file))) {
      return `/products/${productId}/${file}`;
    }
  }
  return pickProductMain(productId);
}

const REVIEW_AUTHORS = [
  "Alex M.", "Jordan K.", "Priya R.", "Sam T.", "Mei L.",
  "Diego A.", "Chris P.", "Hana O.", "Tom W.", "Rosa G.",
  "Liam B.", "Yuki S.",
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

function buildDescription(name: string, category: string): string {
  return [
    `# ${name}`,
    "",
    `A standout pick in our ${category} lineup. Designed to feel good in everyday use without compromising on quality.`,
    "",
    "## Why you'll like it",
    "",
    "- Built to last — chosen materials, careful construction",
    "- Easy to live with — minimal fuss, comfortable in real-world use",
    "- Backed by hundreds of happy customers",
    "",
    "Whether you're upgrading or trying it for the first time, you're in good hands.",
  ].join("\n");
}

function stockFor(productId: string): number {
  if (productId === "p7") return 0;       // out-of-stock test case
  if (productId === "d2") return 3;       // low-stock test case
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
    const description = buildDescription(p.name, p.category);
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

    // ProductImage rows (4 per product). Reset and re-create on each seed run.
    await prisma.productImage.deleteMany({ where: { productId: p.id } });
    await prisma.productImage.createMany({
      data: [1, 2, 3, 4].map((n) => ({
        productId: p.id,
        url: pickGalleryImage(p.id, n),
        sortOrder: n,
      })),
    });

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
