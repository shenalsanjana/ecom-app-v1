// app/categories/(index)/loading.tsx
//
// The catalogue's own loading boundary, scoped by the (index) route group so
// it covers the bare /categories list and not app/categories/[...slug].
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { ProductGridSkeleton } from "@/app/_components/shared/product-grid-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* Mirrors OfferBanner's box so the band does not resize when it
            lands, including its part order: heading, offer, signals. The panel
            is drawn unconditionally — it is present far more often than not,
            and a skeleton that guessed wrong would shift the grid either way. */}
        <section className="border-b bg-card">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-9 sm:px-6 md:py-11 lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[auto_auto] lg:gap-x-16 lg:px-8">
            <div className="order-1 lg:col-start-1 lg:row-start-1">
              <Skeleton className="h-12 w-80 max-w-full rounded" />
              <Skeleton className="mt-3 h-5 w-[34rem] max-w-full rounded" />
            </div>
            <Skeleton className="order-2 h-[13.5rem] rounded-2xl lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center" />
            <div className="order-3 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:col-start-1 lg:row-start-2 lg:max-w-xl lg:self-end">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-5 w-52 max-w-full rounded" />
              ))}
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Skeleton className="h-5 w-28 rounded" />
          <div className="mt-6">
            <ProductGridSkeleton count={12} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
