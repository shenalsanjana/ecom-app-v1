import Link from "next/link";
import { ProductCard } from "@/app/_components/home/product-card";
import { getDealsProducts } from "@/app/_lib/products";

export async function DealsSection() {
  const products = await getDealsProducts(4);
  return (
    <section className="border-b bg-muted">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">Deals of the day</h2>
            <p className="mt-1 text-sm text-muted-foreground">Limited-time savings on everyday picks.</p>
          </div>
          <Link href="/deals" className="text-sm font-medium text-muted-foreground transition-colors duration-(--duration-fast) hover:text-brand">
            See all deals
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
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
              fromPath="/"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
