import { Heart, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleWishlistAction } from "@/app/wishlist/actions";

type Props = {
  productId: string;
  name: string;
  price: number;
  originalPrice: number | null;
  ratingAvg: number;
  ratingCount: number;
  stock: number;
  wishlisted: boolean;
};

function formatPrice(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

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

export function BuyBox({
  productId, name, price, originalPrice,
  ratingAvg, ratingCount, stock, wishlisted,
}: Props) {
  const onSale = originalPrice != null && originalPrice > price;
  const pct = onSale ? discountPct(price, originalPrice as number) : 0;
  const fromPath = `/products/${productId}`;
  const inStock = stock > 0;
  const qtyMax = Math.min(stock, 10);

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

      {inStock && (
        <div className="flex items-center gap-3">
          <label htmlFor="qty" className="text-sm font-medium">Quantity</label>
          <select
            id="qty"
            name="qty"
            defaultValue="1"
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {Array.from({ length: qtyMax }).map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="flex-1"
          disabled={!inStock}
          aria-disabled={!inStock}
        >
          Add to cart
        </Button>
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
