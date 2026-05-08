// app/_components/home/product-card.tsx
import Image from "next/image";
import Link from "next/link";
import { Heart, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { toggleWishlistAction } from "@/app/wishlist/actions";
import { QuickBuyButtons } from "@/app/_components/cart/quick-buy-buttons";
import { formatPrice } from "@/app/_lib/format";

export type ProductCardProps = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  image: string;
  rating: number;
  reviewCount: number;
  sizes: string;
  wishlisted?: boolean;
  fromPath?: string;
};

function discountPct(price: number, original: number): number {
  return Math.round(((original - price) / original) * 100);
}

export function ProductCard({
  id,
  name,
  price,
  originalPrice,
  image,
  rating,
  reviewCount,
  sizes,
  wishlisted = false,
  fromPath = "/",
}: ProductCardProps) {
  const onSale = originalPrice != null && originalPrice > price;
  const pct = onSale ? discountPct(price, originalPrice as number) : 0;
  const href = `/products/${id}`;

  return (
    <Card className="overflow-hidden p-0">
      <div className="relative flex h-48 items-center justify-center bg-muted">
        {onSale && (
          <Badge className="absolute left-3 top-3 z-10" variant="brand">
            -{pct}%
          </Badge>
        )}
        <Link href={href} aria-label={name} className="absolute inset-0">
          <Image
            src={image}
            alt={name}
            fill
            sizes="(min-width:1024px) 25vw, 50vw"
            className="object-cover"
          />
        </Link>
        <form action={toggleWishlistAction} className="absolute right-2 top-2 z-10">
          <input type="hidden" name="productId" value={id} />
          <input type="hidden" name="fromPath" value={fromPath} />
          <button
            type="submit"
            className={
              "flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur transition-transform duration-(--duration-fast) motion-safe:hover:scale-110 " +
              (wishlisted
                ? "text-brand"
                : "text-muted-foreground hover:text-foreground")
            }
            aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          >
            <Heart
              key={wishlisted ? "filled" : "empty"}
              className={
                wishlisted
                  ? "h-4 w-4 fill-brand text-brand motion-safe:animate-wishlist-fill"
                  : "h-4 w-4"
              }
            />
          </button>
        </form>
      </div>
      <CardContent className="space-y-2 p-4">
        <h3 className="font-heading line-clamp-2 min-h-[2.75rem] text-base font-medium leading-snug">
          <Link href={href} className="hover:underline underline-offset-4">{name}</Link>
        </h3>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
          <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
          <span>({reviewCount.toLocaleString()})</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className={
              "font-heading text-base font-semibold " +
              (onSale ? "text-brand" : "")
            }
          >
            {formatPrice(price)}
          </span>
          {onSale && (
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(originalPrice as number)}
            </span>
          )}
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <QuickBuyButtons
          productId={id}
          name={name}
          price={price}
          image={image}
          sizes={sizes}
        />
      </CardFooter>
    </Card>
  );
}