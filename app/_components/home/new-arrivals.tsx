import { ProductCard } from "@/app/_components/home/product-card";
import { getNewArrivals } from "@/app/_lib/products";
import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";

export async function NewArrivals() {
  const products = await getNewArrivals(6);
  return (
    <Section>
      <SectionHeader
        eyebrow="Just dropped"
        title="New arrivals"
        action={{ label: "View all", href: "/categories?sort=newest" }}
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
