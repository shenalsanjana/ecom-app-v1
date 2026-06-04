// app/admin/products/[id]/edit/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="max-w-2xl space-y-5">
      <Skeleton className="h-8 w-48 rounded" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-11 w-36 rounded-lg" />
    </section>
  );
}
