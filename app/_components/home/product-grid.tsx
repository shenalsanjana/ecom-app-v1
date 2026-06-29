import { ProductCard } from "@/app/_components/home/product-card";
import { getFeaturedProducts } from "@/app/_lib/products";
import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";

export async function ProductGrid() {
  const products = await getFeaturedProducts(8);
  return (
    <Section>
      <SectionHeader
        eyebrow="Editor's picks"
        title="Featured products"
        action={{ label: "View all", href: "/categories" }}
      />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
    </Section>
  );
}
