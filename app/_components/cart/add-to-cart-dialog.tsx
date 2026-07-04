"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Check, Ruler, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { SizeChartContent } from "@/app/_components/product/size-chart-content";
import { useCart } from "@/app/_lib/cart-context";
import { trackAddToCart } from "@/app/_lib/meta-pixel";
import { formatPrice } from "@/app/_lib/format";

type Props = {
  productId: string;
  variantId: string;
  color?: string | null;
  name: string;
  price: number;
  image: string;
  sizes: string;
  triggerVariant?: "outline" | "default";
  triggerClassName?: string;
};

export function AddToCartDialog({
  productId,
  variantId,
  color = null,
  name,
  price,
  image,
  sizes,
  triggerVariant = "outline",
  triggerClassName = "flex-1 min-w-0 whitespace-nowrap",
}: Props) {
  const sizeList = sizes ? sizes.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const { addItem } = useCart();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [added, setAdded] = useState(false);
  const [showChart, setShowChart] = useState(false);

  const hasSizes = sizeList.length > 0;
  // Size is required for Add to cart when the product offers sizes.
  const canAdd = !hasSizes || !!selectedSize;

  function handleAdd() {
    if (!canAdd) return;
    addItem(
      { productId, variantId, color, name, price, image, size: selectedSize || null },
      1,
    );
    trackAddToCart(productId, price, 1);
    setAdded(true);
    // Auto-close after a brief success flash so the customer sees confirmation
    // without a second click. Reset state for the next open.
    setTimeout(() => {
      setOpen(false);
      setSelectedSize("");
      setAdded(false);
      setShowChart(false);
    }, 900);
  }

  function handleBuyNow() {
    if (!canAdd) return;
    addItem(
      { productId, variantId, color, name, price, image, size: selectedSize || null },
      1,
    );
    trackAddToCart(productId, price, 1);
    router.push("/checkout");
  }

  // If the user opens, picks a size, then closes without adding, reset state
  // so reopening starts clean.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSelectedSize("");
      setAdded(false);
      setShowChart(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={buttonVariants({
          size: "sm",
          variant: triggerVariant,
          className: triggerClassName,
        })}
        aria-label="Add to cart"
      >
        <ShoppingCart className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">Add to cart</span>
      </DialogTrigger>
      <DialogContent
        className={`max-h-[90dvh] overflow-y-auto transition-[max-width] duration-(--duration-fast) ${
          showChart ? "sm:max-w-2xl" : "sm:max-w-md"
        }`}
      >
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <div className="flex items-center justify-between gap-2">
            <DialogDescription>
              {formatPrice(price)}
              {hasSizes ? " — choose your size" : ""}
            </DialogDescription>
            {hasSizes && (
              <button
                type="button"
                onClick={() => setShowChart((v) => !v)}
                aria-expanded={showChart}
                aria-controls="add-to-cart-size-chart"
                className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <Ruler className="h-3.5 w-3.5" aria-hidden />
                {showChart ? "Hide chart" : "Size Chart"}
              </button>
            )}
          </div>
        </DialogHeader>
        {hasSizes && (
          <div className="flex flex-wrap gap-2">
            {sizeList.map((size) => {
              const selected = selectedSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSelectedSize(size)}
                  data-state={selected ? "selected" : "unselected"}
                  aria-pressed={selected}
                  className={`min-w-[48px] rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-(--duration-fast) ease-(--ease-out) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    selected
                      ? "border-foreground bg-foreground text-background ring-2 ring-ring ring-offset-2"
                      : "border-border hover:border-foreground/40"
                  }`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        )}
        {hasSizes && showChart && (
          <div id="add-to-cart-size-chart">
            <SizeChartContent className="relative aspect-square w-full overflow-hidden rounded-md" />
          </div>
        )}
        {hasSizes && !selectedSize && (
          <p className="text-sm text-muted-foreground">Select a size to continue.</p>
        )}
        <DialogFooter className="mt-2">
          <Button
            variant="outline"
            onClick={handleBuyNow}
            disabled={!canAdd || added}
          >
            <Zap className="mr-1.5 h-4 w-4" aria-hidden />
            Buy now
          </Button>
          <Button onClick={handleAdd} disabled={!canAdd || added}>
            {added ? (
              <>
                <Check className="mr-1.5 h-4 w-4" aria-hidden />
                Added
              </>
            ) : (
              "Add to cart"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
