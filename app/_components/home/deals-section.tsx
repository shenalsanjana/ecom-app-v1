import { ProductCard } from "@/app/_components/home/product-card";
import { getDealsProducts } from "@/app/_lib/products";

export async function DealsSection() {
  const products = await getDealsProducts(4);
  return (
    <section className="border-b bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Deals of the day</h2>
            <p className="mt-1 text-sm text-muted-foreground">Limited-time savings on everyday picks.</p>
          </div>
          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            See all deals
          </a>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={{ ...p, originalPrice: p.originalPrice ?? undefined }} />
          ))}
        </div>
      </div>
    </section>
  );
}
