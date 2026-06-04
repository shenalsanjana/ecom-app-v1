// app/categories/loading.tsx
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { ProductGridSkeleton } from "@/app/_components/shared/product-grid-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Skeleton className="h-9 w-72 rounded" />
          <Skeleton className="mt-3 h-5 w-96 rounded" />
          <div className="mt-8">
            <ProductGridSkeleton count={12} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
