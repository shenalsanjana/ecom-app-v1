// app/_components/home/product-card.tsx
import Image from "next/image";
import Link from "next/link";
import { Zap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { AddToCartDialog } from "@/app/_components/cart/add-to-cart-dialog";
import { WishlistHeart } from "@/app/_components/wishlist/wishlist-heart";
import { prettifyCategory } from "@/app/_lib/category-label";
import { discountPct } from "@/app/_lib/pricing";
import { Eyebrow } from "@/app/_components/ui/eyebrow";
import { Price } from "@/app/_components/ui/price";
import { Rating } from "@/app/_components/ui/rating";
import { SaleBadge } from "@/app/_components/ui/sale-badge";

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
        {onSale && <SaleBadge pct={pct} className="absolute left-3 top-3 z-10" />}
        <Link href={href} aria-label={name} className="absolute inset-0">
          <Image
            src={image}
            alt={name}
            fill
            sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
            className="object-cover transition-transform duration-(--duration-slow) ease-(--ease-out) group-hover:scale-105"
          />
        </Link>
        <div className="absolute right-2 top-2 z-10">
          <WishlistHeart productId={id} fromPath={fromPath} />
        </div>
      </div>
      <CardContent className="space-y-1.5 p-4">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h3 className="font-heading line-clamp-2 min-h-[2.75rem] text-base font-medium leading-snug">
          <Link href={href} className="hover:underline underline-offset-4">
            {name}
          </Link>
        </h3>
        <Rating rating={rating} reviewCount={reviewCount} />
        <Price price={price} originalPrice={originalPrice} />
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
