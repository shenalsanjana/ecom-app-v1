import Image from "next/image";

/**
 * Shared size-chart figure (image + caption). Single source of truth for the
 * chart asset and its measurement note. The caller supplies the container
 * sizing via `className` so the same figure works both in a wide dialog and in
 * a height-bounded inline popup.
 */
export function SizeChartContent({
  className = "relative aspect-square w-full overflow-hidden rounded-md",
}: {
  className?: string;
}) {
  return (
    <figure className="space-y-2">
      <div className={className}>
        <Image
          src="/size-charts/oversize.jpg"
          alt="Oversize t-shirt size chart"
          fill
          sizes="(min-width: 640px) 42rem, 100vw"
          className="object-contain"
        />
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Measurements in inches, ±0.5&quot; tolerance. Unisex sizing.
      </figcaption>
    </figure>
  );
}
