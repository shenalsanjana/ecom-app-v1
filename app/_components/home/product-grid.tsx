import Link from "next/link";
import { ProductCard } from "@/app/_components/home/product-card";
import { getFeaturedProducts } from "@/app/_lib/products";

export async function ProductGrid() {
  const products = await getFeaturedProducts(8);
  return (
    <section className="border-b">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand">Editor's picks</p>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">Featured products</h2>
          </div>
          <Link href="/categories" className="border-b border-border pb-0.5 text-sm font-medium text-foreground hover:border-foreground">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              id={p.id}
              name={p.name}
              price={p.price}
              originalPrice={p.originalPrice}
              image={p.image}
              rating={p.rating}
              reviewCount={p.reviewCount}
              sizes={p.sizes}
              category={p.category}
              fromPath="/"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
