// app/cart/page.tsx
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { CartPageClient } from "@/app/_components/cart/cart-page-client";

export default async function CartPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <CartPageClient />
      </main>
      <SiteFooter />
    </>
  );
}
