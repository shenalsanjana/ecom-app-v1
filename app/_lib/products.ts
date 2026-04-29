// app/_lib/products.ts
import { prisma } from "@/app/_lib/prisma";

export type ProductView = {
  id: string;
  name: string;
  price: number;
  originalPrice: number | null;
  image: string;
  rating: number;
  reviewCount: number;
  category: string;
};

export type CategoryView = {
  slug: string;
  name: string;
  image: string;
};

function toView(p: {
  id: string;
  name: string;
  price: number;
  originalPrice: number | null;
  image: string;
  rating: number;
  reviewCount: number;
  categorySlug: string;
}): ProductView {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    originalPrice: p.originalPrice ?? null,
    image: p.image,
    rating: p.rating,
    reviewCount: p.reviewCount,
    category: p.categorySlug,
  };
}

export async function getCategories(): Promise<CategoryView[]> {
  const rows = await prisma.category.findMany({ orderBy: { name: "asc" } });
  return rows.map((c) => ({ slug: c.slug, name: c.name, image: c.image }));
}

export async function getFeaturedProducts(limit = 8): Promise<ProductView[]> {
  const rows = await prisma.product.findMany({
    where: { id: { startsWith: "p" } },
    orderBy: { id: "asc" },
    take: limit,
  });
  return rows.map(toView);
}

export async function getDealsProducts(limit = 4): Promise<ProductView[]> {
  const rows = await prisma.product.findMany({
    where: { originalPrice: { not: null } },
    orderBy: { id: "asc" },
    take: limit,
  });
  return rows.map(toView);
}

export async function getProductById(id: string): Promise<ProductView | null> {
  const row = await prisma.product.findUnique({ where: { id } });
  return row ? toView(row) : null;
}
