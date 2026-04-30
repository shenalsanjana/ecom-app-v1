// app/wishlist/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";
import { buttonVariants } from "@/components/ui/button";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { ProductCard } from "@/app/_components/home/product-card";

export default async function WishlistPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/wishlist");

  const items = await prisma.wishlistItem.findMany({
    where: { userId: session.user.id },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  // Compute rating/reviewCount per product via a single groupBy.
  const productIds = items.map((it) => it.productId);
  const grouped =
    productIds.length > 0
      ? await prisma.review.groupBy({
          by: ["productId"],
          where: { productId: { in: productIds } },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : [];
  const aggMap = new Map(
    grouped.map((g) => [g.productId, { avg: g._avg.rating ?? 0, count: g._count._all }]),
  );

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your wishlist</h1>
          {items.length === 0 ? (
            <div className="rounded border p-10 text-center">
              <h2 className="text-lg font-medium">Your wishlist is empty</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Tap the heart on any product to save it for later.
              </p>
              <Link href="/" className={buttonVariants({ className: "mt-4" })}>
                Continue shopping
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((it) => {
                const agg = aggMap.get(it.productId) ?? { avg: 0, count: 0 };
                return (
                  <ProductCard
                    key={it.id}
                    id={it.product.id}
                    name={it.product.name}
                    price={it.product.price}
                    originalPrice={it.product.originalPrice}
                    image={it.product.image}
                    rating={agg.avg}
                    reviewCount={agg.count}
                    wishlisted={true}
                    fromPath="/wishlist"
                  />
                );
              })}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
