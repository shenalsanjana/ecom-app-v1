import { PrismaClient } from "@prisma/client";
import { categories, featuredProducts, dealsProducts } from "../app/_data/mock";

const prisma = new PrismaClient();

async function main() {
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, image: c.image },
      create: { slug: c.slug, name: c.name, image: c.image },
    });
  }

  const all = [...featuredProducts, ...dealsProducts];
  for (const p of all) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        price: p.price,
        originalPrice: p.originalPrice ?? null,
        image: p.image,
        rating: p.rating,
        reviewCount: p.reviewCount,
        categorySlug: p.category,
      },
      create: {
        id: p.id,
        name: p.name,
        price: p.price,
        originalPrice: p.originalPrice ?? null,
        image: p.image,
        rating: p.rating,
        reviewCount: p.reviewCount,
        categorySlug: p.category,
      },
    });
  }

  console.log(`Seeded ${categories.length} categories and ${all.length} products.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
