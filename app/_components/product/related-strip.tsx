import { ProductCard } from "@/app/_components/home/product-card";
import type { ProductView } from "@/app/_lib/products";

type Props = {
  products: ProductView[];
  fromPath: string;
};

export function RelatedStrip({ products, fromPath }: Props) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby="related-heading" className="space-y-6">
      <h2 id="related-heading" className="font-heading text-xl font-medium tracking-tight">
        You might also like
      </h2>
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
            fromPath={fromPath}
          />
        ))}
      </div>
    </section>
  );
}
