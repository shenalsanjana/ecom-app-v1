"use server";
import { z } from "zod";
import { DiscountError } from "@/app/_lib/discounts";
import { quoteCart, type DiscountQuote, type QuoteItemInput } from "@/app/_lib/discount-service";
import { DISCOUNT_PAYMENT_METHODS } from "@/app/_lib/discount-payment-methods";
import type { PaymentMethod } from "@/app/_lib/payments/types";

const schema = z.object({
  items: z.array(z.object({ productId: z.string().min(1), variantId: z.string().min(1), quantity: z.number().int().min(1).max(10) })).min(1).max(100),
  code: z.string().trim().max(40).optional(),
  paymentMethod: z.enum(DISCOUNT_PAYMENT_METHODS).optional(),
});
export async function getDiscountQuote(items: QuoteItemInput[], code?: string, paymentMethod?: PaymentMethod): Promise<{ success: true; quote: DiscountQuote } | { success: false; error: string }> {
  const parsed = schema.safeParse({ items, code, paymentMethod });
  if (!parsed.success) return { success: false, error: "Please review your cart and coupon code." };
  try { return { success: true, quote: await quoteCart(parsed.data.items, parsed.data.code, parsed.data.paymentMethod) }; }
  catch (error) {
    if (!(error instanceof DiscountError)) console.error("[discount-quote]", error);
    return { success: false, error: error instanceof DiscountError ? error.message : "Unable to check offers. Please try again." };
  }
}
