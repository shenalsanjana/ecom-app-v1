import { CategoryStrip } from "@/app/_components/home/category-strip";
import { DealsSection } from "@/app/_components/home/deals-section";
import { Hero } from "@/app/_components/home/hero";
import { Newsletter } from "@/app/_components/home/newsletter";
import { ProductGrid } from "@/app/_components/home/product-grid";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { SiteHeader } from "@/app/_components/home/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <CategoryStrip />
        <ProductGrid />
        <DealsSection />
        <Newsletter />
      </main>
      <SiteFooter />
    </>
  );
}
