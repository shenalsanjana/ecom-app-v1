// app/_components/home/product-card.tsx
import Image from "next/image";
import Link from "next/link";
import { Star, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { AddToCartDialog } from "@/app/_components/cart/add-to-cart-dialog";
import { WishlistHeart } from "@/app/_components/wishlist/wishlist-heart";
import { formatPrice } from "@/app/_lib/format";
import { prettifyCategory } from "@/app/_lib/category-label";

export type ProductCardProps = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  image: string;
  rating: number;
  reviewCount: number;
  sizes: string;
  category?: string;
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
  category,
  fromPath = "/",
}: ProductCardProps) {
  const onSale = originalPrice != null && originalPrice > price;
  const pct = onSale ? discountPct(price, originalPrice as number) : 0;
  const href = `/products/${id}`;
  const eyebrow = category ? prettifyCategory(category) : "";

  return (
    <Card className="group overflow-hidden p-0">
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        {onSale && (
          <Badge
            variant="outline"
            className="absolute left-3 top-3 z-10 bg-card/90 text-brand"
          >
            -{pct}%
          </Badge>
        )}
        <Link href={href} aria-label={name} className="absolute inset-0">
          <Image
            src={image}
            alt={name}
            fill
            sizes="(min-width:1024px) 25vw, 50vw"
            className="object-cover transition-transform duration-(--duration-slow) ease-(--ease-out) group-hover:scale-105"
          />
        </Link>
        <div className="absolute right-2 top-2 z-10">
          <WishlistHeart productId={id} fromPath={fromPath} />
        </div>
      </div>
      <CardContent className="space-y-1.5 p-4">
        {eyebrow && (
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h3 className="font-heading line-clamp-2 min-h-[2.75rem] text-base font-medium leading-snug">
          <Link href={href} className="hover:underline underline-offset-4">{name}</Link>
        </h3>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
          <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
          <span>({reviewCount.toLocaleString()})</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className={"font-heading text-base font-semibold " + (onSale ? "text-brand" : "")}>
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
        <div className="flex w-full flex-col gap-2">
          <AddToCartDialog
            productId={id}
            name={name}
            price={price}
            image={image}
            sizes={sizes}
            triggerVariant="default"
            triggerClassName="w-full min-w-0 whitespace-nowrap"
          />
          {/* Buy it now skips the card-level size dialog and sends the shopper to
              the product page, where size is the mandatory input. The
              ?action=buy-now intent scrolls to and flashes the size picker. */}
          <Link
            href={`${href}?action=buy-now`}
            aria-label={`Buy ${name} now`}
            className={buttonVariants({
              size: "sm",
              variant: "outline",
              className: "w-full min-w-0 whitespace-nowrap",
            })}
          >
            <Zap className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">Buy it now</span>
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
