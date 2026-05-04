import { ProductGridSkeleton } from "@/app/_components/shared/product-grid-skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 h-8 w-48 animate-pulse rounded bg-muted" />
      <ProductGridSkeleton count={8} />
    </main>
  );
}
