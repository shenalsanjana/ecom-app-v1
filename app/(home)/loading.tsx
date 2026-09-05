// app/(home)/loading.tsx
//
// Scoped to the (home) group on purpose. This file used to live at
// app/categories/(index)/loading.tsx; moving the catalogue to "/" would have
// put it at app/loading.tsx, where it is the ROOT loading boundary and every
// route without its own — /contact, /search, /cart — would flash a product
// grid skeleton on the way in. The route group keeps the boundary on "/" while
// leaving the URL alone.
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { ProductGridSkeleton } from "@/app/_components/shared/product-grid-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* Mirrors BrandBand's box so the band does not resize when it lands. */}
        <section className="border-b bg-card">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-9 sm:px-6 md:py-11 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16 lg:px-8">
            <div>
              <Skeleton className="h-12 w-80 max-w-full rounded" />
              <Skeleton className="mt-3 h-5 w-[34rem] max-w-full rounded" />
              <Skeleton className="mt-2 h-5 w-[26rem] max-w-full rounded" />
            </div>
            <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:shrink-0">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-5 w-52 rounded" />
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
