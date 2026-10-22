import { cn } from "@/lib/utils";
import { formatPrice } from "@/app/_lib/format";

type PriceProps = {
  price: number;
  originalPrice?: number | null;
  className?: string;
};

export function Price({ price, originalPrice, className }: PriceProps) {
  const onSale = originalPrice != null && originalPrice > price;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <span
        className={cn(
          "font-heading text-base font-semibold",
          onSale && "text-brand"
        )}
      >
        {onSale && <span className="sr-only">Discounted price </span>}
        {formatPrice(price)}
      </span>
      {onSale && (
        <del className="text-sm text-muted-foreground">
          <span className="sr-only">Original price </span>
          {formatPrice(originalPrice as number)}
        </del>
      )}
    </span>
  );
}
