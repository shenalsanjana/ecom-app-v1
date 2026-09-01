import { DealsSection } from "@/app/_components/home/deals-section";
import { DepartmentCards } from "@/app/_components/home/department-cards";
import { DesignGrid } from "@/app/_components/home/design-grid";
import { Hero } from "@/app/_components/home/hero";
import { ProductGrid } from "@/app/_components/home/product-grid";
import { SocialProof } from "@/app/_components/home/social-proof";
import { TrustStrip } from "@/app/_components/home/trust-strip";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { SiteHeader } from "@/app/_components/home/site-header";
import { getDepartments } from "@/app/_lib/taxonomy";

export const revalidate = 300;

export default async function Home() {
  // One cached read, shared by both taxonomy sections.
  const departments = await getDepartments();

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <SocialProof />
        <ProductGrid />
        <DepartmentCards departments={departments} />
        <DesignGrid departments={departments} />
        <DealsSection />
        <TrustStrip />
      </main>
      <SiteFooter />
    </>
  );
}
