import Link from "next/link";
import { ProductCard } from "@/app/_components/home/product-card";
import { DealsCountdown } from "@/app/_components/home/deals-countdown";
import { getDealsProducts } from "@/app/_lib/products";

export async function DealsSection() {
  const products = await getDealsProducts(4);
  return (
    <section className="border-b bg-primary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p
              className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em]"
              style={{ color: "color-mix(in oklab, var(--brand) 70%, white)" }}
            >
              Limited time
            </p>
            <h2 className="font-heading mt-1 text-[34px] font-bold tracking-tight">
              Deals of the day
            </h2>
            <p className="mt-1 text-sm text-white/60">
              Limited-time savings on everyday picks.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <DealsCountdown />
            <Link
              href="/deals"
              className="text-sm font-medium text-white/75 transition-colors duration-(--duration-fast) hover:text-white"
            >
              See all deals →
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} fromPath="/" />
          ))}
        </div>
      </div>
    </section>
  );
}
