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
import { getDesignMedia } from "@/app/_lib/taxonomy-media";

export const revalidate = 300;

export default async function Home() {
  // One cached read, shared by both taxonomy sections. SiteFooter is the
  // deliberate exception: it calls getDepartments() itself (it renders on
  // ~20 pages, not just this one, so it must self-fetch), which hits the
  // same unstable_cache key and is negligible. It's mocked out in this
  // page's tests, so those tests don't cover that second call.
  //
  // getDesignMedia is a second, independent cached read, not folded into
  // getDepartments: the footer's self-fetch above means every page pays for
  // getDepartments, so nesting a product -> variant -> image join into it
  // would slow ~20 routes for data only DesignGrid, here, ever reads. Because
  // the two reads don't depend on each other, they're issued with Promise.all
  // rather than sequential awaits, which would serialise the home render for
  // no reason.
  const [departments, media] = await Promise.all([getDepartments(), getDesignMedia()]);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <SocialProof />
        <ProductGrid />
        <DepartmentCards departments={departments} />
        <DesignGrid departments={departments} media={media} />
        <DealsSection />
        <TrustStrip />
      </main>
      <SiteFooter />
    </>
  );
}
