"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePromotions } from "./promotion-provider";
import { promotionHeadline, promotionTerms, storeCampaign } from "@/app/_lib/storefront-promotions";
import { buttonVariants } from "@/components/ui/button";
import { hasPaymentRestriction } from "@/app/_lib/discount-payment-methods";

export function PromotionBanner({ announcement = false, children }: { announcement?: boolean; children?: React.ReactNode }) {
  const offer = storeCampaign(usePromotions());
  const pathname = usePathname();
  if (!offer || /^\/(admin|account|auth)(\/|$)/.test(pathname)) return <>{children}</>;
  if (announcement) return <aside aria-label="Store offer" className="break-words bg-primary px-4 py-2 text-center text-xs leading-relaxed text-primary-foreground">
    <Link href="/#store-offer" className="underline decoration-primary-foreground/40 underline-offset-2">{promotionHeadline(offer)}{offer.code ? ` · Code ${offer.code}` : " · Automatic offer"}{offer.minimumOrder > 0 || offer.maximumDiscount !== null || hasPaymentRestriction(offer) ? " · Conditions apply" : " · Sale items excluded"}</Link>
  </aside>;
  return <aside id="store-offer" aria-label="Current store offer" className="scroll-mt-24 border-b bg-muted/40">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <div className="min-w-0 flex-1 break-words"><p className="text-xs font-medium text-brand">{offer.name}</p><h2 className="mt-1 font-heading text-xl font-semibold">{promotionHeadline(offer)}</h2>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">{promotionTerms(offer)}</p>
      </div>
      <Link href="/categories" className={buttonVariants({ variant: "outline" })}>Shop eligible styles</Link>
    </div>
  </aside>;
}
