// app/wishlist/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";
import { buttonVariants } from "@/components/ui/button";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { ProductCard } from "@/app/_components/home/product-card";
import { getWishlistProductCards } from "@/app/_lib/products";

export default async function WishlistPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/wishlist");

  const items = await prisma.wishlistItem.findMany({
    where: { userId: session.user.id, product: { archived: false } },
    select: { id: true, productId: true },
    orderBy: { createdAt: "desc" },
  });

  const cards = await getWishlistProductCards(items.map((it) => it.productId));
  // Preserve wishlist order (getWishlistProductCards returns unordered).
  const byId = new Map(cards.map((c) => [c.id, c]));
  const ordered = items.map((it) => byId.get(it.productId)).filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your wishlist</h1>
          {ordered.length === 0 ? (
            <div className="rounded border p-10 text-center">
              <h2 className="text-lg font-medium">Your wishlist is empty</h2>
              <p className="mt-2 text-sm text-muted-foreground">Tap the heart on any product to save it for later.</p>
              <Link href="/" className={buttonVariants({ className: "mt-4" })}>Continue shopping</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ordered.map((card) => (
                <ProductCard key={card.id} product={card} fromPath="/wishlist" />
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
