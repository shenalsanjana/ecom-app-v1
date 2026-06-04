// app/admin/settings/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="max-w-3xl space-y-8">
      <Skeleton className="h-8 w-40 rounded" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-border p-6">
          <Skeleton className="h-5 w-48 rounded" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
    </section>
  );
}
