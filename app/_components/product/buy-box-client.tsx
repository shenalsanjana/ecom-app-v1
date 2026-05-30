// app/_components/product/buy-box-client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Heart, Star, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddToCartButton } from "@/app/_components/cart/add-to-cart-button";
import { SizeChartDialog } from "@/app/_components/product/size-chart-dialog";
import { StockIndicator } from "@/app/_components/shared/stock-indicator";
import { useCart } from "@/app/_lib/cart-context";
import { useWishlist } from "@/app/_lib/wishlist-context";
import { formatPrice } from "@/app/_lib/format";

type Props = {
  productId: string;
  name: string;
  price: number;
  originalPrice: number | null;
  image: string;
  ratingAvg: number;
  ratingCount: number;
  stock: number;
  sizes?: string;
};

function discountPct(price: number, original: number): number {
  return Math.round(((original - price) / original) * 100);
}

export function BuyBoxClient({
  productId, name, price, originalPrice, image,
  ratingAvg, ratingCount, stock, sizes,
}: Props) {
  const router = useRouter();
  const { addItem, items } = useCart();
  const { has: isWishlisted, toggle: toggleWishlist } = useWishlist();
  const wishlisted = isWishlisted(productId);
  const [quantity, setQuantity] = useState(1);
  const [isBuying, setIsBuying] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string>("");

  const sizeList = useMemo(
    () => (sizes ? sizes.split(",").map((s) => s.trim()) : []),
    [sizes],
  );

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const buyNowIntent = searchParams.get("action") === "buy-now";

  useEffect(() => {
    if (!buyNowIntent) return;
    if (!sizeList.length) return;
    if (selectedSize) return;
    const el = document.getElementById("size-picker");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.setAttribute("data-attention", "true");
    const t = setTimeout(() => el.removeAttribute("data-attention"), 2000);

    // Strip ?action=buy-now from the URL so refresh / back-nav doesn't re-fire
    // the nudge. Preserve any other query params.
    const next = new URLSearchParams(searchParams.toString());
    next.delete("action");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });

    return () => {
      clearTimeout(t);
      el.removeAttribute("data-attention");
    };
  }, [buyNowIntent, sizeList.length, selectedSize, searchParams, pathname, router]);

  const onSale = originalPrice != null && originalPrice > price;
  const pct = onSale ? discountPct(price, originalPrice as number) : 0;
  const fromPath = `/products/${productId}`;
  const inStock = stock > 0;
  const qtyMax = Math.min(stock, 10);

  const requiresSize = sizeList.length > 0;
  const sizeMissing = requiresSize && !selectedSize;

  // Match cart line by composite key (productId + size).
  const cartKey = selectedSize ? `${productId}::${selectedSize}` : productId;
  const existingItem = items.find((i) => i.key === cartKey);
  const inCartQty = existingItem ? existingItem.quantity : 0;

  function handleBuyNow() {
    if (sizeMissing) return;

    setIsBuying(true);
    addItem({ productId, name, price, image, size: selectedSize || null }, quantity);
    router.push("/checkout");
  }

  return (
    <div className="space-y-5">
      <h1 className="font-heading text-2xl font-medium tracking-tight sm:text-3xl">{name}</h1>

      <a
        href="#reviews"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors duration-(--duration-fast) hover:text-foreground"
        aria-label={`${ratingAvg.toFixed(1)} out of 5 stars, ${ratingCount} reviews`}
      >
        <Star className="h-4 w-4 fill-amber-400 stroke-amber-400" aria-hidden />
        <span className="font-medium text-foreground">{ratingAvg.toFixed(1)}</span>
        <span>({ratingCount.toLocaleString()})</span>
      </a>

      <div className="flex items-baseline gap-3">
        <span
          className={
            "font-heading text-2xl font-semibold " + (onSale ? "text-brand" : "")
          }
        >
          {formatPrice(price)}
        </span>
        {onSale && (
          <>
            <span className="text-base text-muted-foreground line-through">
              {formatPrice(originalPrice as number)}
            </span>
            <Badge variant="brand">-{pct}%</Badge>
          </>
        )}
      </div>

      <div><StockIndicator stock={stock} /></div>

      {/* Size Selection */}
      {sizeList.length > 0 && (
        <div
          id="size-picker"
          className="space-y-2 rounded-md transition-shadow data-[attention=true]:ring-2 data-[attention=true]:ring-ring data-[attention=true]:ring-offset-2 data-[attention=true]:ring-offset-background"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Size:</span>
            <span className="text-sm text-muted-foreground">{selectedSize || "Select a size"}</span>
            <SizeChartDialog />
          </div>
          <div className="flex flex-wrap gap-2">
            {sizeList.map((size) => {
              const isSelected = selectedSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSelectedSize(size)}
                  aria-pressed={isSelected}
                  className={
                    "min-w-[48px] rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors duration-(--duration-fast) " +
                    (isSelected
                      ? "border-ring bg-muted ring-2 ring-ring"
                      : "border-border hover:border-foreground/40")
                  }
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {inStock && (
        <div className="flex items-center gap-3">
          <label htmlFor="qty" className="text-sm font-medium">Quantity</label>
          <select
            id="qty"
            name="qty"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {Array.from({ length: qtyMax }).map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
          {inCartQty > 0 && (
            <span className="text-sm text-muted-foreground">
              ({inCartQty} in cart)
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <AddToCartButton
          productId={productId}
          name={name}
          price={price}
          image={image}
          size={selectedSize || null}
          quantity={quantity}
          requiresSize={requiresSize}
          disabled={!inStock}
          className="flex-1"
        />
        {inStock && (
          <Button
            onClick={handleBuyNow}
            disabled={isBuying || sizeMissing}
            variant="outline"
            className="flex-1"
          >
            {isBuying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Buy Now
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wishlisted}
          onClick={() => toggleWishlist(productId, fromPath)}
        >
          <Heart className={"mr-2 h-4 w-4 " + (wishlisted ? "fill-current text-brand" : "")} />
          {wishlisted ? "Wishlisted" : "Wishlist"}
        </Button>
      </div>
    </div>
  );
}