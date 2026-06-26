// app/feed/meta-catalog.csv/route.ts
// Public CSV catalog feed for Meta Commerce Manager / Facebook Shop. Meta pulls
// it on a schedule; cached via `revalidate` so polls don't hit the DB every time.
// Excludes archived products; out-of-stock products are kept (marked out of stock)
// so ad history is retained.
import { prisma } from "@/app/_lib/prisma";
import { productToFeedRow, feedRowsToCsv, type FeedProduct } from "@/app/_lib/meta-feed";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const products = await prisma.product.findMany({
    where: { archived: false },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      originalPrice: true,
      stock: true,
      image: true,
      archived: true,
    },
  });

  const rows = products.map((p) => productToFeedRow(p as FeedProduct));
  const csv = feedRowsToCsv(rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
