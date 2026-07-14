// app/feed/meta-catalog.csv/route.ts
// Public CSV catalog feed for Meta Commerce Manager / Facebook Shop. Meta pulls
// it on a schedule; cached via `revalidate` so polls don't hit the DB every time.
// Excludes archived products/variants; out-of-stock variants are kept (marked
// out of stock) so ad history is retained. One row per color variant.
import { prisma } from "@/app/_lib/prisma";
import { variantToFeedRow, feedRowsToCsv, type FeedVariant } from "@/app/_lib/meta-feed";
import { variantInStock, buildPlainStockMap, buildDesignStockMap } from "@/app/_lib/variants";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const [products, plainStockRows, designStockRows] = await Promise.all([
    prisma.product.findMany({
      where: { archived: false },
      orderBy: { id: "asc" },
      select: {
        id: true, name: true, description: true, price: true, originalPrice: true, dtfDesignId: true,
        variants: {
          where: { archived: false },
          orderBy: { sortOrder: "asc" },
          select: {
            color: true, colorSlug: true, sku: true, price: true, originalPrice: true,
            images: { where: { role: "CARD" }, orderBy: { sortOrder: "asc" }, select: { url: true }, take: 1 },
            sizeStocks: { select: { size: true } },
          },
        },
      },
    }),
    prisma.plainTshirtStock.findMany({ select: { id: true, colorSlug: true, size: true, quantity: true } }),
    prisma.dtfDesign.findMany({ select: { id: true, quantity: true } }),
  ]);
  const plainStock = buildPlainStockMap(plainStockRows);
  const designStock = buildDesignStockMap(designStockRows);

  const rows = products.flatMap((p) =>
    p.variants.map((v) =>
      variantToFeedRow({
        productId: p.id,
        productName: p.name,
        color: v.color,
        colorSlug: v.colorSlug,
        description: p.description,
        sku: v.sku,
        price: v.price ?? p.price,
        originalPrice: v.originalPrice ?? p.originalPrice,
        inStock: variantInStock(v.sizeStocks, v.colorSlug, p.dtfDesignId, plainStock, designStock),
        image: v.images[0]?.url ?? "",
      } satisfies FeedVariant),
    ),
  );
  const csv = feedRowsToCsv(rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
