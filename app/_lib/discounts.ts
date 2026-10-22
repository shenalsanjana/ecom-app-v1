import { z } from "zod";
import { DISCOUNT_PAYMENT_METHODS, paymentEligibilityMessage, paymentEligible } from "./discount-payment-methods";
import type { PaymentMethod } from "./payments/types";

export const toCents = (value: number) => Math.round(value * 100);
export const fromCents = (value: number) => value / 100;
const money = z.number().finite().min(0).max(10_000_000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001, "Use at most two decimal places");
export const DiscountInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().toUpperCase().max(40).regex(/^[A-Z0-9_-]*$/, "Use letters, numbers, hyphens or underscores"),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  scope: z.enum(["STORE", "PRODUCTS", "CATEGORIES"]),
  value: money.refine(v => v > 0, "Discount must be greater than zero"),
  active: z.boolean(),
  publicOffer: z.boolean().optional(),
  paymentMethods: z.array(z.enum(["ALL", ...DISCOUNT_PAYMENT_METHODS])).min(1, "Select at least one payment method.").max(5).optional(),
  startsAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  usageLimit: z.number().int().positive().max(2_000_000_000).nullable(),
  minimumOrder: money,
  maximumDiscount: money.refine(v => v > 0).nullable(),
  productIds: z.array(z.string().min(1)).max(1000),
  categorySlugs: z.array(z.string().min(1)).max(1000),
}).superRefine((v, ctx) => {
  const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (v.type === "PERCENTAGE" && v.value > 100) fail("value", "Percentage cannot exceed 100");
  if (v.startsAt && v.expiresAt && Date.parse(v.expiresAt) <= Date.parse(v.startsAt)) fail("expiresAt", "Expiry must be after the start date");
  if (v.scope === "PRODUCTS" && !v.productIds.length) fail("productIds", "Select at least one product");
  if (v.scope === "CATEGORIES" && !v.categorySlugs.length) fail("categorySlugs", "Select at least one collection");
  if (v.paymentMethods?.includes("ALL") && v.paymentMethods.some(method => method !== "ALL")) fail("paymentMethods", "Choose All payment methods or specific methods.");
});
export type DiscountInput = z.infer<typeof DiscountInputSchema>;
export type DiscountRule = {
  id: string; name: string; code: string | null; type: string; scope: string;
  value: number; active: boolean; startsAt: Date | null; expiresAt: Date | null;
  usageLimit: number | null; usedCount: number; minimumOrder: number; maximumDiscount: number | null; version: number;
  products: { productId: string }[]; categories: { designSlug: string }[];
  /** Empty means all methods, including offers created before this setting. */
  paymentMethods?: string[];
};
export type DiscountLine = { productId: string; price: number; originalPrice: number | null; quantity: number; categorySlugs: string[] };
export type AppliedDiscount = { id: string; name: string; code: string | null; amount: number; version: number };
export class DiscountError extends Error {}
export class DiscountPaymentError extends DiscountError {}

function ruleError(rule: DiscountRule, subtotal: number, now: Date): string | null {
  if (!rule.active) return "This coupon is inactive.";
  if (rule.startsAt && rule.startsAt > now) return "This coupon is not available yet.";
  if (rule.expiresAt && rule.expiresAt <= now) return "This coupon has expired.";
  if (rule.usageLimit !== null && rule.usedCount >= rule.usageLimit) return "This coupon has reached its usage limit.";
  if (subtotal < rule.minimumOrder) return `Minimum order value is LKR ${(rule.minimumOrder / 100).toFixed(2)}.`;
  return null;
}
export function discountAmount(rule: DiscountRule, lines: DiscountLine[]): number {
  const eligible = lines.filter(line => {
    // Existing sale prices are already a discount and cannot be combined.
    if (line.originalPrice !== null && toCents(line.originalPrice) > toCents(line.price)) return false;
    return rule.scope === "STORE" ||
      (rule.scope === "PRODUCTS" && rule.products.some(p => p.productId === line.productId)) ||
      (rule.scope === "CATEGORIES" && rule.categories.some(c => line.categorySlugs.includes(c.designSlug)));
  }).reduce((sum, line) => sum + toCents(line.price) * line.quantity, 0);
  const amount = rule.type === "PERCENTAGE" ? Math.round(eligible * rule.value / 10_000) : rule.type === "FIXED" ? rule.value : 0;
  return Math.max(0, Math.min(eligible, amount, rule.maximumDiscount ?? eligible));
}
export function selectDiscount(rules: DiscountRule[], lines: DiscountLine[], code = "", now = new Date(), paymentMethod?: PaymentMethod): AppliedDiscount | null {
  const subtotal = lines.reduce((sum, line) => sum + toCents(line.price) * line.quantity, 0);
  const normalized = code.trim().toUpperCase();
  const candidates = normalized ? rules.filter(r => r.code === normalized) : rules.filter(r => r.code === null);
  if (normalized && !candidates.length) throw new DiscountError("Invalid coupon code.");
  let best: AppliedDiscount | null = null;
  for (const rule of [...candidates].sort((a, b) => a.id.localeCompare(b.id))) {
    const error = ruleError(rule, subtotal, now);
    if (error) { if (normalized) throw new DiscountError(error); continue; }
    const amount = discountAmount(rule, lines);
    if (!amount) { if (normalized) throw new DiscountError("This coupon does not apply to your items. Sale items are excluded."); continue; }
    if (!paymentEligible(rule, paymentMethod)) {
      if (normalized) throw new DiscountPaymentError(paymentEligibilityMessage(rule, paymentMethod, "This coupon"));
      continue;
    }
    if (!best || amount > best.amount) best = { id: rule.id, name: rule.name, code: rule.code, amount, version: rule.version };
  }
  return best;
}
