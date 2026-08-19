import { CategoryStrip } from "@/app/_components/home/category-strip";
import { DealsSection } from "@/app/_components/home/deals-section";
import { Hero } from "@/app/_components/home/hero";
import { ProductGrid } from "@/app/_components/home/product-grid";
import { SocialProof } from "@/app/_components/home/social-proof";
import { TrustStrip } from "@/app/_components/home/trust-strip";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { SiteHeader } from "@/app/_components/home/site-header";

export const revalidate = 300;

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <SocialProof />
        <ProductGrid />
        <CategoryStrip />
        <DealsSection />
        <TrustStrip />
      </main>
      <SiteFooter />
    </>
  );
}
