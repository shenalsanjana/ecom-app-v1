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
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      <span
        className={cn(
          "font-heading text-base font-semibold",
          onSale && "text-brand"
        )}
      >
        {formatPrice(price)}
      </span>
      {onSale && (
        <span className="text-sm text-muted-foreground line-through">
          {formatPrice(originalPrice as number)}
        </span>
      )}
    </span>
  );
}
