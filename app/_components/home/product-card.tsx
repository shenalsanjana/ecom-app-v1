import Image from "next/image";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { Product } from "@/app/_data/mock";

function formatPrice(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function discountPct(price: number, original: number): number {
  return Math.round(((original - price) / original) * 100);
}

export function ProductCard({ product }: { product: Product }) {
  const onSale = product.originalPrice !== undefined && product.originalPrice > product.price;
  const pct = onSale ? discountPct(product.price, product.originalPrice as number) : 0;

  return (
    <Card className="overflow-hidden p-0">
      <div className="relative flex h-48 items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900">
        {onSale && (
          <Badge className="absolute left-3 top-3" variant="destructive">
            -{pct}%
          </Badge>
        )}
        <Image
          src={product.image}
          alt={product.name}
          width={96}
          height={96}
          className="opacity-90 dark:invert"
        />
      </div>
      <CardContent className="space-y-2 p-4">
        <h3 className="line-clamp-2 min-h-[2.75rem] text-sm font-medium leading-snug">
          {product.name}
        </h3>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
          <span className="font-medium text-foreground">{product.rating.toFixed(1)}</span>
          <span>({product.reviewCount.toLocaleString()})</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold">{formatPrice(product.price)}</span>
          {onSale && (
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(product.originalPrice as number)}
            </span>
          )}
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button className="w-full" size="sm">Add to cart</Button>
      </CardFooter>
    </Card>
  );
}
