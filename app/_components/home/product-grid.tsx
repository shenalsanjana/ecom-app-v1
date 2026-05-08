import { ProductCard } from "@/app/_components/home/product-card";
import { getFeaturedProducts } from "@/app/_lib/products";

export async function ProductGrid() {
  const products = await getFeaturedProducts(8);
  return (
    <section className="border-b">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Featured products</h2>
          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            View all
          </a>
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
              fromPath="/"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
