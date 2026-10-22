import type { Prisma } from "@prisma/client";

/** EXISTS keeps one product row even when several memberships match. */
export function inCollections(slugs: string[]): Prisma.ProductWhereInput {
  return { OR: [
    { designSlug: { in: slugs } },
    { additionalCollections: { some: { designSlug: { in: slugs } } } },
  ] };
}

export type CollectionProduct = { category: string; collectionSlugs?: string[] };

export function productCollections(product: CollectionProduct): string[] {
  return [...new Set([product.category, ...(product.collectionSlugs ?? [])])];
}

export class CollectionMembershipError extends Error {}

/** Called after the parent write acquires its row lock, in the same transaction.
 * Omission preserves links for older callers; an explicit [] removes them. */
export async function syncAdditionalCollections(
  tx: Prisma.TransactionClient, productId: string, primary: string, slugs?: string[],
): Promise<void> {
  if (slugs === undefined) {
    await tx.productCollection.deleteMany({ where: { productId, designSlug: primary } });
    return;
  }
  const additional = [...new Set(slugs)].filter(slug => slug !== primary);
  if (additional.length) {
    const existing = await tx.design.findMany({ where: { slug: { in: additional } }, select: { slug: true } });
    if (existing.length !== additional.length) throw new CollectionMembershipError("A selected collection no longer exists. Reload the product and try again.");
  }
  await tx.productCollection.deleteMany({ where: { productId, designSlug: { notIn: additional } } });
  if (additional.length) await tx.productCollection.createMany({
    data: additional.map(designSlug => ({ productId, designSlug })), skipDuplicates: true,
  });
}
