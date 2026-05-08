type Props = {
  count?: number;
};

export function ProductGridSkeleton({ count = 8 }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="motion-safe:animate-pulse">
          <div className="aspect-square w-full rounded-2xl bg-muted" />
          <div className="mt-3 h-4 w-3/4 rounded bg-muted" />
          <div className="mt-2 h-4 w-1/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
