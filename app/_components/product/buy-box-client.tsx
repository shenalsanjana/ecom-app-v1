// app/_components/product/buy-box-client.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Star, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddToCartButton } from "@/app/_components/cart/add-to-cart-button";
import { toggleWishlistAction } from "@/app/wishlist/actions";
import { useCart } from "@/app/_lib/cart-context";
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
  wishlisted: boolean;
  isLoggedIn: boolean;
  sizes?: string;
};

function discountPct(price: number, original: number): number {
  return Math.round(((original - price) / original) * 100);
}

function StockChip({ stock }: { stock: number }) {
  if (stock === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
        Out of stock
      </span>
    );
  }
  if (stock <= 5) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        Only {stock} left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
      In stock
    </span>
  );
}

export function BuyBoxClient({
  productId, name, price, originalPrice, image,
  ratingAvg, ratingCount, stock, wishlisted, isLoggedIn, sizes,
}: Props) {
  const router = useRouter();
  const { addItem, items } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [isBuying, setIsBuying] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string>("");

  const sizeList = sizes ? sizes.split(",").map(s => s.trim()) : [];
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
    if (!isLoggedIn) {
      const callbackUrl = encodeURIComponent(`/products/${productId}`);
      router.push(`/login?callbackUrl=${callbackUrl}`);
      return;
    }

    setIsBuying(true);
    addItem({ productId, name, price, image, size: selectedSize || null }, quantity);
    router.push("/checkout");
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>

      <a
        href="#reviews"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        aria-label={`${ratingAvg.toFixed(1)} out of 5 stars, ${ratingCount} reviews`}
      >
        <Star className="h-4 w-4 fill-amber-400 stroke-amber-400" aria-hidden />
        <span className="font-medium text-foreground">{ratingAvg.toFixed(1)}</span>
        <span>({ratingCount.toLocaleString()})</span>
      </a>

      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-semibold">{formatPrice(price)}</span>
        {onSale && (
          <>
            <span className="text-base text-muted-foreground line-through">
              {formatPrice(originalPrice as number)}
            </span>
            <Badge variant="destructive">-{pct}%</Badge>
          </>
        )}
      </div>

      <div><StockChip stock={stock} /></div>

      {/* Size Selection */}
      {sizeList.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Size:</span>
            <span className="text-sm text-muted-foreground">{selectedSize || "Select a size"}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {sizeList.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setSelectedSize(size)}
                className={`min-w-[48px] rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  selectedSize === size
                    ? "border-black bg-black text-white"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                {size}
              </button>
            ))}
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
            className="flex-1 bg-black hover:bg-black/90 text-white"
          >
            {isBuying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Buy Now
          </Button>
        )}
        <form action={toggleWishlistAction}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="fromPath" value={fromPath} />
          <Button
            type="submit"
            variant="outline"
            className="w-full sm:w-auto"
            aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          >
            <Heart className={"mr-2 h-4 w-4 " + (wishlisted ? "fill-current" : "")} />
            {wishlisted ? "Wishlisted" : "Wishlist"}
          </Button>
        </form>
      </div>
    </div>
  );
}