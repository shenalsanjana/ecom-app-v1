// Skeleton state shown by Next.js while the dashboard's server queries
// resolve. The chrome (layout) renders synchronously above this slot.
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section>
      <Skeleton className="mb-6 h-8 w-40 rounded" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    </section>
  );
}
