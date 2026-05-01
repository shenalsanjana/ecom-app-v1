// app/_components/cart/cart-page-client.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingCart, Search, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { CartItemRow } from "@/app/_components/cart/cart-item";
import { CartSummary } from "@/app/_components/cart/cart-summary";
import { CartIcon } from "@/app/_components/header/cart-icon";
import { WishlistIcon } from "@/app/_components/header/wishlist-icon";
import { ProfileMenu } from "@/app/_components/header/profile-menu";
import { useCart } from "@/app/_lib/cart-context";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";

type SessionUser = { name: string; email: string } | null;

const NAV_LINKS = [
  { href: "#", label: "Shop" },
  { href: "#", label: "Categories" },
  { href: "#", label: "Deals" },
  { href: "#", label: "About" },
];

type Props = {
  user: SessionUser;
  loggedIn: boolean;
  wishlistCount: number;
};

export function CartPageClient({ user, loggedIn, wishlistCount }: Props) {
  const { items, clearCart } = useCart();
  const router = useRouter();

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="mr-2"
            onClick={() => router.back()}
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <Link href="/" className="text-lg font-semibold tracking-tight">Shoply</Link>
          <nav className="hidden items-center gap-5 text-sm md:flex">
            {NAV_LINKS.map((l) => (
              <Link key={l.label} href={l.href} className="text-muted-foreground hover:text-foreground">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="relative ml-auto hidden flex-1 max-w-sm md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" placeholder="Search products" className="pl-9" />
          </div>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <WishlistIcon loggedIn={loggedIn} count={wishlistCount} />
            <CartIcon />
            <ProfileMenu user={user} />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="mb-8 text-2xl font-semibold tracking-tight">Shopping Cart</h1>

          {items.length === 0 ? (
            <div className="rounded border p-10 text-center">
              <ShoppingCart className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="text-lg font-medium">Your cart is empty</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Looks like you have not added any items to your cart yet.
              </p>
              <Link href="/" className={buttonVariants({ className: "mt-4" })}>
                Continue shopping
              </Link>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div className="rounded-lg border">
                  <div className="flex justify-between border-b px-4 py-3 text-sm font-medium text-muted-foreground">
                    <span>Product</span>
                    <span>Quantity</span>
                  </div>
                  <div className="px-4">
                    {items.map((item) => (
                      <CartItemRow key={item.productId} item={item} />
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex justify-between">
                  <Link href="/" className={buttonVariants({ variant: "outline" })}>
                    Continue shopping
                  </Link>
                  <Button
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm("Clear all items from cart?")) {
                        clearCart();
                      }
                    }}
                  >
                    Clear cart
                  </Button>
                </div>
              </div>

              <div>
                <CartSummary />
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
