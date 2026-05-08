export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 h-8 w-32 motion-safe:animate-pulse rounded bg-muted" />
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex gap-4 rounded-lg border p-4">
            <div className="h-24 w-24 motion-safe:animate-pulse rounded bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 motion-safe:animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/4 motion-safe:animate-pulse rounded bg-muted" />
              <div className="h-8 w-32 motion-safe:animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
