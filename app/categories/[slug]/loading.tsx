import { ProductGridSkeleton } from "@/app/_components/shared/product-grid-skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="h-9 w-72 motion-safe:animate-pulse rounded bg-muted" />
        <div className="mt-3 h-5 w-96 motion-safe:animate-pulse rounded bg-muted" />
      </div>
      <ProductGridSkeleton count={12} />
    </main>
  );
}
