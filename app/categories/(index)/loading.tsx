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
        {/* Mirrors the page's heading band — same ground, same padding, a
            crumb line over a heading — so nothing moves when it lands. */}
        <section className="border-b bg-muted/30">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <Skeleton className="h-4 w-40 rounded" />
            <Skeleton className="mt-4 h-9 w-64 max-w-full rounded" />
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
