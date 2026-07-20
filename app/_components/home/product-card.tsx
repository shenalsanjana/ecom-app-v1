// app/_components/home/product-card.tsx
"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Zap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { AddToCartDialog } from "@/app/_components/cart/add-to-cart-dialog";
import { WishlistHeart } from "@/app/_components/wishlist/wishlist-heart";
import { ColorSwatches } from "@/app/_components/product/color-swatches";
import { prettifyCategory } from "@/app/_lib/category-label";
import { isUploadedImage } from "@/app/_lib/uploaded-image";
import { discountPct } from "@/app/_lib/pricing";
import { Eyebrow } from "@/app/_components/ui/eyebrow";
import { Price } from "@/app/_components/ui/price";
import { Rating } from "@/app/_components/ui/rating";
import { SaleBadge } from "@/app/_components/ui/sale-badge";
import type { ProductView } from "@/app/_lib/products";

export function ProductCard({
  product,
  fromPath = "/",
  showEyebrow = false,
}: {
  product: ProductView;
  fromPath?: string;
  showEyebrow?: boolean;
}) {
  const { id, name, rating, reviewCount, category, variants, defaultColorSlug } = product;
  const [selectedColor, setSelectedColor] = useState(defaultColorSlug);
  const variant = variants.find((v) => v.colorSlug === selectedColor) ?? variants[0];

  const price = variant.price;
  const originalPrice = variant.originalPrice;
  const onSale = originalPrice != null && originalPrice > price;
  const pct = onSale ? discountPct(price, originalPrice) : 0;
  const image = variant.cardImages[0] ?? "";
  const href = `/products/${id}?color=${selectedColor}`;
  const swatchOptions = variants.map((v) => ({
    colorSlug: v.colorSlug, color: v.color, swatchHex: v.swatchHex, image: v.cardImages[0] ?? "",
  }));

  return (
    <Card className="group overflow-hidden p-0">
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        {onSale && <SaleBadge pct={pct} className="absolute left-3 top-3 z-10" />}
        <Link href={href} aria-label={name} className="absolute inset-0">
          <Image
            key={selectedColor}
            src={image}
            alt={name}
            fill
            unoptimized={isUploadedImage(image)}
            sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
            className="object-cover transition-transform duration-(--duration-slow) ease-(--ease-out) group-hover:scale-105 animate-in fade-in duration-(--duration-fast)"
          />
        </Link>
        <div className="absolute right-2 top-2 z-10">
          <WishlistHeart productId={id} fromPath={fromPath} />
        </div>
      </div>
      <CardContent className="flex flex-col gap-1.5 p-4">
        {showEyebrow && category && <Eyebrow>{prettifyCategory(category)}</Eyebrow>}
        <h3 className="font-heading line-clamp-2 min-h-[2.75rem] text-base font-medium leading-snug">
          <Link href={href} className="hover:underline underline-offset-4">{name}</Link>
        </h3>
        <Rating rating={rating} reviewCount={reviewCount} />
        <ColorSwatches options={swatchOptions} selected={selectedColor} onSelect={setSelectedColor} />
        <Price price={price} originalPrice={originalPrice} />
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <div className="flex w-full flex-col gap-2">
          <AddToCartDialog
            productId={id}
            variantId={variant.id}
            color={variant.color}
            name={name}
            price={price}
            image={image}
            sizes={variant.sizes.join(",")}
            triggerVariant="default"
            triggerClassName="w-full min-w-0 whitespace-nowrap"
          />
          <Link
            href={`/products/${id}?action=buy-now&color=${selectedColor}`}
            aria-label={`Buy ${name} now`}
            className={buttonVariants({ size: "sm", variant: "outline", className: "w-full min-w-0 whitespace-nowrap" })}
          >
            <Zap className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">Buy it now</span>
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
