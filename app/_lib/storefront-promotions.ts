import { discountAmount, toCents, type DiscountLine, type DiscountRule } from "./discounts";
import { formatPrice } from "./format";
import { eligiblePaymentLabels, hasPaymentRestriction, paymentEligible, paymentEligibilityMessage } from "./discount-payment-methods";
import type { PaymentMethod } from "./payments/types";

/** Public marketing data only. Private coupon codes never cross this boundary. */
export type StorefrontPromotion = Pick<DiscountRule, "id" | "name" | "code" | "type" | "scope" | "value" | "minimumOrder" | "maximumDiscount" | "products" | "categories" | "paymentMethods"> & {
  startsAt: string | null; expiresAt: string | null; limited: boolean;
};
export type PromotionSnapshot = { offers: StorefrontPromotion[]; asOf: number };

export function publicPromotions(rules: (DiscountRule & { publicOffer?: boolean })[], now: number): StorefrontPromotion[] {
  return rules.filter(r => r.active && (!r.code || r.publicOffer === true) &&
    (!r.expiresAt || r.expiresAt.getTime() > now) && (r.usageLimit === null || r.usedCount < r.usageLimit))
    .map(r => ({ id: r.id, name: r.name, code: r.code, type: r.type, scope: r.scope, value: r.value,
      minimumOrder: r.minimumOrder, maximumDiscount: r.maximumDiscount,
      startsAt: r.startsAt?.toISOString() ?? null, expiresAt: r.expiresAt?.toISOString() ?? null,
      limited: r.usageLimit !== null, products: r.products, categories: r.categories, paymentMethods: r.paymentMethods ?? [] }));
}
export function activePromotions(offers: StorefrontPromotion[], now: number) {
  return offers.filter(r => (!r.startsAt || Date.parse(r.startsAt) <= now) && (!r.expiresAt || Date.parse(r.expiresAt) > now));
}
export function promotionRule(offer: StorefrontPromotion): DiscountRule {
  return { ...offer, active: true, version: 0, usageLimit: null, usedCount: 0,
    startsAt: offer.startsAt ? new Date(offer.startsAt) : null, expiresAt: offer.expiresAt ? new Date(offer.expiresAt) : null };
}
export function eligibleForPromotion(offer: StorefrontPromotion, line: DiscountLine) {
  return discountAmount(promotionRule(offer), [line]) > 0;
}
export function promotionHeadline(offer: StorefrontPromotion) {
  const headline = offer.type === "FIXED" ? `${formatPrice(offer.value / 100)} off eligible orders` : `${offer.value / 100}% off${offer.scope === "STORE" ? " full-price items" : " selected full-price items"}`;
  return headline + (hasPaymentRestriction(offer) ? ` with ${eligiblePaymentLabels(offer)}` : "");
}
export function promotionTerms(offer: StorefrontPromotion) {
  return [offer.code ? `Use code ${offer.code}` : hasPaymentRestriction(offer) ? "Applied automatically with an eligible payment method at checkout" : "Applied automatically at checkout",
    hasPaymentRestriction(offer) ? `Eligible payment methods: ${eligiblePaymentLabels(offer)}` : null,
    offer.minimumOrder > 0 ? `Minimum order ${formatPrice(offer.minimumOrder / 100)} before delivery` : null,
    offer.maximumDiscount !== null ? `Save up to ${formatPrice(offer.maximumDiscount / 100)} per order` : null,
    offer.type === "FIXED" ? "Discount is per order" : null,
    "Sale items excluded", "One offer per order", offer.limited ? "While uses remain" : null,
    offer.expiresAt ? `Ends ${new Date(offer.expiresAt).toLocaleString("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} (Sri Lanka)` : null,
  ].filter(Boolean).join(" · ");
}

function targetKey(r: StorefrontPromotion) {
  return JSON.stringify([r.scope, r.products.map(p => p.productId).sort(), r.categories.map(c => c.designSlug).sort()]);
}
/** One offer applies to an entire order. Per-item best offers could promise a
 * combination checkout cannot honour, so preview only a consistent automatic
 * percentage across the same eligibility group. Conditional offers keep base prices. */
export function automaticPriceOffer(offers: StorefrontPromotion[]) {
  const automatic = offers.filter(r => !r.code);
  if (!automatic.length || automatic.some(r => r.type !== "PERCENTAGE" || r.minimumOrder > 0 || r.maximumDiscount !== null || hasPaymentRestriction(r))) return null;
  if (automatic.some(r => targetKey(r) !== targetKey(automatic[0]))) return null;
  return [...automatic].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))[0];
}
export function productPromotion(offers: StorefrontPromotion[], line: DiscountLine, code = "") {
  const applicable = offers.filter(r => eligibleForPromotion(r, line));
  const automatic = code ? null : automaticPriceOffer(offers);
  const exact = automatic && applicable.some(r => r.id === automatic.id) ? automatic : null;
  const saving = exact ? discountAmount(promotionRule(exact), [{ ...line, quantity: 1 }]) : 0;
  const offer = exact ?? (code ? applicable.find(r => r.code === code) : applicable.find(r => !r.code) ?? applicable[0]) ?? null;
  return { price: saving ? (toCents(line.price) - saving) / 100 : line.price,
    originalPrice: saving ? line.price : line.originalPrice, exact: saving > 0, offer,
    paymentOffers: applicable.filter(r => hasPaymentRestriction(r)) };
}
/** One quiet store-wide campaign, selected consistently on every page. */
export function storeCampaign(offers: StorefrontPromotion[]) {
  const automatic = automaticPriceOffer(offers);
  if (automatic?.scope === "STORE") return automatic;
  return [...offers].filter(r => r.scope === "STORE")
    .sort((a, b) => Number(!!a.code) - Number(!!b.code) || Number(a.minimumOrder > 0) - Number(b.minimumOrder > 0) || a.id.localeCompare(b.id))[0] ?? null;
}

export function cartPromotionAdvice(offers: StorefrontPromotion[], lines: DiscountLine[], subtotal: number, applied: { id: string; amount: number } | null, code: string, paymentMethod?: PaymentMethod) {
  const saving = (offer: StorefrontPromotion) => discountAmount(promotionRule(offer), lines);
  const automaticSaving = offers.filter(r => !r.code && r.minimumOrder <= subtotal && paymentEligible(r, paymentMethod)).reduce((best, offer) => Math.max(best, saving(offer)), 0);
  const suggestion = offers.filter(r => r.id !== applied?.id && (!code || !!r.code) && saving(r) > (applied?.amount ?? 0))
    .sort((a, b) => Number(!paymentEligible(a, paymentMethod)) - Number(!paymentEligible(b, paymentMethod)) || Math.max(0, a.minimumOrder - subtotal) - Math.max(0, b.minimumOrder - subtotal) || saving(b) - saving(a) || a.id.localeCompare(b.id))[0] ?? null;
  const blocked = !code ? offers.filter(r => !r.code && r.minimumOrder <= subtotal && !paymentEligible(r, paymentMethod) && saving(r) > (applied?.amount ?? 0))
    .sort((a, b) => saving(b) - saving(a) || a.id.localeCompare(b.id))[0] : null;
  const paymentNotice = blocked ? paymentEligibilityMessage(blocked, paymentMethod, blocked.name) : null;
  return { suggestion, remaining: suggestion ? Math.max(0, suggestion.minimumOrder - subtotal) : 0, automaticSaving, paymentNotice };
}
