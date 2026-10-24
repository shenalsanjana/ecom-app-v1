import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { effectivePrice, effectiveOriginalPrice } from "./variants";
import { DiscountError, DiscountPaymentError, selectDiscount, toCents, type DiscountLine, type AppliedDiscount } from "./discounts";
import type { PaymentMethod } from "./payments/types";
import { paymentEligible, paymentEligibilityMessage } from "./discount-payment-methods";

type DiscountDb = Pick<Prisma.TransactionClient, "discount">;
export const discountInclude = { products: { select: { productId: true } }, categories: { select: { designSlug: true } } } as const;
async function evaluateDiscount(db: DiscountDb, lines: DiscountLine[], code?: string, paymentMethod?: PaymentMethod) {
  const normalized = code?.trim().toUpperCase() || null;
  const rules = await db.discount.findMany({ where: normalized ? { code: normalized } : { code: null, active: true }, include: discountInclude });
  const now = new Date();
  try {
    const discount = selectDiscount(rules, lines, normalized ?? "", now, paymentMethod);
    const blocked = !normalized ? rules.filter(rule => !paymentEligible(rule, paymentMethod))
      .map(rule => ({ rule, amount: selectDiscount([rule], lines, "", now, rule.paymentMethods?.[0] as PaymentMethod)?.amount ?? 0 }))
      .filter(candidate => candidate.amount > (discount?.amount ?? 0)).sort((a, b) => b.amount - a.amount || a.rule.id.localeCompare(b.rule.id))[0] : null;
    return { discount, notice: blocked ? paymentEligibilityMessage(blocked.rule, paymentMethod, blocked.rule.name) : null };
  }
  catch (error) {
    // A valid code remains entered while the customer chooses another method.
    // Its saving is removed, and the authoritative total remains usable.
    if (error instanceof DiscountPaymentError) return { discount: null, notice: error.message };
    throw error;
  }
}
export async function priceDiscount(db: DiscountDb, lines: DiscountLine[], code?: string, paymentMethod?: PaymentMethod): Promise<AppliedDiscount | null> {
  return (await evaluateDiscount(db, lines, code, paymentMethod)).discount;
}

/** Optimistic row claim serializes uses and invalidates edits/deactivation/deletion. */
export async function claimDiscount(tx: DiscountDb, discount: AppliedDiscount): Promise<void> {
  const now = new Date();
  const result = await tx.discount.updateMany({
    where: {
      id: discount.id, version: discount.version, active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        { OR: [{ usageLimit: null }, { usedCount: { lt: tx.discount.fields.usageLimit } }] },
      ],
    },
    data: { usedCount: { increment: 1 }, version: { increment: 1 } },
  });
  if (result.count !== 1) throw new DiscountError("This offer changed or reached its usage limit. Please review your total and try again.");
}
export type QuoteItemInput = { productId: string; variantId: string; quantity: number };
export type DiscountQuote = {
  subtotal: number; originalSubtotal: number; discount: AppliedDiscount | null;
  prices: { variantId: string; price: number }[];
  lines?: DiscountLine[];
  notice?: string | null;
  paymentMethod?: PaymentMethod;
  customizedProducts?: { productId: string; name: string }[];
};
export async function quoteCart(items: QuoteItemInput[], code?: string, paymentMethod?: PaymentMethod): Promise<DiscountQuote> {
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: [...new Set(items.map(i => i.variantId))] }, archived: false, product: { archived: false, status: "PUBLISHED" } },
    select: { id: true, productId: true, price: true, originalPrice: true,
      product: { select: { price: true, originalPrice: true, name: true, isCustomizedDesign: true, designSlug: true, additionalCollections: { select: { designSlug: true } } } } },
  });
  const map = new Map(variants.map(v => [v.id, v]));
  const lines: DiscountLine[] = items.map(item => {
    const variant = map.get(item.variantId);
    if (!variant || variant.productId !== item.productId) throw new DiscountError("An item is no longer available. Please review your cart.");
    return { productId: item.productId, price: effectivePrice(variant, variant.product), originalPrice: effectiveOriginalPrice(variant, variant.product), quantity: item.quantity,
      categorySlugs: [variant.product.designSlug, ...variant.product.additionalCollections.map(c => c.designSlug)] };
  });
  const result = await evaluateDiscount(prisma, lines, code, paymentMethod);
  return {
    subtotal: lines.reduce((s, l) => s + toCents(l.price) * l.quantity, 0),
    originalSubtotal: lines.reduce((s, l) => s + toCents(Math.max(l.price, l.originalPrice ?? l.price)) * l.quantity, 0),
    ...result,
    paymentMethod,
    lines,
    prices: variants.map(v => ({ variantId: v.id, price: effectivePrice(v, v.product) })),
    ...(variants.some(v => v.product.isCustomizedDesign) ? { customizedProducts: [...new Map(variants.filter(v => v.product.isCustomizedDesign)
      .map(v => [v.productId, { productId: v.productId, name: v.product.name }])).values()] } : {}),
  };
}
