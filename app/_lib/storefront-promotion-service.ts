import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { discountInclude } from "./discount-service";
import { publicPromotions, type PromotionSnapshot } from "./storefront-promotions";

export async function readStorefrontPromotions(): Promise<PromotionSnapshot> {
  const rules = await prisma.discount.findMany({ where: { active: true, OR: [{ code: null }, { publicOffer: true }] }, include: discountInclude, orderBy: { id: "asc" } });
  const asOf = Date.now();
  return { offers: publicPromotions(rules, asOf), asOf };
}
export const getStorefrontPromotions = unstable_cache(readStorefrontPromotions, ["storefront-promotions"], { tags: ["promotions"], revalidate: 30 });
