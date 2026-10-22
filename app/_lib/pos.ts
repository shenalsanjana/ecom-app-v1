import { z } from "zod";

export const POS_PAYMENT_LABELS = { CASH: "Cash", CARD: "Card terminal", KOKO: "Koko", MINTPAY: "Mintpay" } as const;
export const PosPaymentMethodSchema = z.enum(["CASH", "CARD", "KOKO", "MINTPAY"]);
export type PosPaymentMethod = z.infer<typeof PosPaymentMethodSchema>;

// POS amounts cross the client boundary as integer LKR cents.
export const POS_MAX_CENTS = 1_000_000_000;
const cents = z.number().int().min(0).max(POS_MAX_CENTS);
export const PosSaleSchema = z.object({
  operationKey: z.uuid(),
  items: z.array(z.object({
    sizeStockId: z.string().min(1).max(128),
    quantity: z.number().int().min(1).max(99),
    expectedPrice: cents.positive(),
  }).strict()).min(1, "Add at least one item.").max(100),
  paymentMethod: PosPaymentMethodSchema,
  tendered: cents,
  paymentReference: z.string().trim().max(100).default(""),
  customerName: z.string().trim().max(100).default(""),
}).strict().superRefine((sale, ctx) => {
  if (new Set(sale.items.map(item => item.sizeStockId)).size !== sale.items.length) {
    ctx.addIssue({ code: "custom", path: ["items"], message: "Combine duplicate sizes into one cart line." });
  }
  if (sale.paymentMethod !== "CASH" && !sale.paymentReference) {
    ctx.addIssue({ code: "custom", path: ["paymentReference"], message: `Enter the approved ${POS_PAYMENT_LABELS[sale.paymentMethod]} payment reference.` });
  }
});
export type PosSaleInput = z.input<typeof PosSaleSchema>;
export type PosSale = z.output<typeof PosSaleSchema>;
export type PosProduct = {
  productId: string; categoryId: string; categoryName: string;
  sizeStockId: string; sku: string; name: string; color: string; size: string;
  price: number; available: number; image: string | null;
};
export type PosCartLine = PosProduct & { quantity: number };
export type PosSaleResult =
  | { success: true; orderId: string; posNumber: string }
  | { success: false; error: string; uncertain?: boolean };

export class PosError extends Error {}

export function posTotal(items: { price: number; quantity: number }[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function posChange(total: number, tendered: number): number {
  if (!Number.isSafeInteger(total) || total <= 0 || total > POS_MAX_CENTS) {
    throw new PosError("The sale total is outside the supported range.");
  }
  if (!Number.isSafeInteger(tendered) || tendered < total || tendered > POS_MAX_CENTS) {
    throw new PosError("The amount received must cover the sale total.");
  }
  return tendered - total;
}
