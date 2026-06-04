// app/products/[id]/loading.tsx
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Skeleton className="h-4 w-64 rounded" />
        </div>
        <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4 rounded" />
              <Skeleton className="h-5 w-1/3 rounded" />
              <Skeleton className="h-6 w-1/4 rounded" />
              <Skeleton className="h-24 w-full rounded" />
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
          </div>
        </section>
        <div className="mx-auto max-w-7xl space-y-6 px-4 pb-16 sm:px-6 lg:px-8">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
