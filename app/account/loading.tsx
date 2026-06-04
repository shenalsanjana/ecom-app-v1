// app/account/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="max-w-lg">
      <Skeleton className="mb-6 h-8 w-40 rounded" />
      <div className="space-y-4">
        <Skeleton className="h-5 w-24 rounded" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-5 w-24 rounded" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-32 rounded-lg" />
      </div>
    </section>
  );
}
