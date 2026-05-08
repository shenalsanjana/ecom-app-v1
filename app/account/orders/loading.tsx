export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 h-8 w-40 motion-safe:animate-pulse rounded bg-muted" />
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-lg border p-4">
            <div className="h-5 w-1/2 motion-safe:animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-1/3 motion-safe:animate-pulse rounded bg-muted" />
            <div className="mt-3 h-4 w-2/3 motion-safe:animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </main>
  );
}
