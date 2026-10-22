"use client";
import { usePromotions } from "./promotion-provider";
import { useCouponCode } from "@/app/_lib/coupon-store";
import { productPromotion, promotionHeadline, promotionTerms } from "@/app/_lib/storefront-promotions";
import type { DiscountLine } from "@/app/_lib/discounts";
import { formatPrice } from "@/app/_lib/format";
import { hasPaymentRestriction } from "@/app/_lib/discount-payment-methods";

export function useProductPromotion(line: DiscountLine) {
  return productPromotion(usePromotions(), line, useCouponCode());
}
export function ProductOfferNote({ promotion }: { promotion: ReturnType<typeof productPromotion> }) {
  const offer = promotion.offer;
  const paymentOffers = promotion.paymentOffers;
  if (!offer && !paymentOffers.length) return null;
  const detailsOffers = [offer, ...paymentOffers].filter((value, index, all) => value && all.findIndex(other => other?.id === value.id) === index);
  return <div className="min-w-0 break-words text-xs leading-relaxed text-muted-foreground">
    {offer && <p className="font-medium text-brand">{promotion.exact ? `${offer.name} · Applied automatically` : `${promotionHeadline(offer)}${offer.code ? hasPaymentRestriction(offer) ? ` · Code ${offer.code}` : ` with ${offer.code}` : " at checkout"}`}</p>}
    {offer && !promotion.exact && (offer.minimumOrder > 0 || offer.maximumDiscount !== null || offer.type === "FIXED") && <p>{[offer.minimumOrder > 0 ? `Orders from ${formatPrice(offer.minimumOrder / 100)}` : null, offer.maximumDiscount !== null ? `Save up to ${formatPrice(offer.maximumDiscount / 100)}` : null, offer.type === "FIXED" ? "Per order" : null].filter(Boolean).join(" · ")}</p>}
    {paymentOffers.length > 0 && (!offer || !hasPaymentRestriction(offer)) && <p className="mt-1">{promotionHeadline(paymentOffers[0])}{paymentOffers[0].code ? ` · Code ${paymentOffers[0].code}` : ""}</p>}
    <details className="mt-1"><summary className="w-fit cursor-pointer underline underline-offset-2">{paymentOffers.length ? "Conditions apply" : "Offer details"}</summary><div className="mt-2 space-y-2">{detailsOffers.map(item => item && <div key={item.id}><p className="font-medium">{item.name}: {promotionHeadline(item)}</p><p className="mt-1">{promotionTerms(item)}</p></div>)}</div></details>
  </div>;
}
