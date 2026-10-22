// app/_lib/wishlist.ts
import { prisma } from "@/app/_lib/prisma";

export async function getWishlistCount(userId: string): Promise<number> {
  return prisma.wishlistItem.count({ where: { userId, product: { archived: false, status: "PUBLISHED" } } });
}

export async function getWishlistProductIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.wishlistItem.findMany({
    where: { userId, product: { archived: false, status: "PUBLISHED" } },
    select: { productId: true },
  });
  return new Set(rows.map((r) => r.productId));
}
