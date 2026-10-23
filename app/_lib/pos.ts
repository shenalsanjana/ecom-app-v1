import { z } from "zod";
import { LkPhoneSchema } from "./validation";

export const POS_PAYMENT_LABELS = { CASH: "Cash", CARD: "Card terminal", KOKO: "Koko", MINTPAY: "Mintpay", BANK_TRANSFER: "Bank Transfer", COD: "Cash on Delivery (COD)" } as const;
export const PosPaymentMethodSchema = z.enum(["CASH", "CARD", "KOKO", "MINTPAY", "BANK_TRANSFER", "COD"]);
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
  delivery: z.object({
    carrier: z.literal("ROYAL_EXPRESS"),
    phone: LkPhoneSchema,
    line1: z.string().trim().min(5, "Enter the complete street address.").max(200),
    line2: z.string().trim().max(200),
    city: z.string().trim().min(1, "Select a delivery city.").max(100),
    expectedCharge: cents,
  }).strict().optional(),
}).strict().superRefine((sale, ctx) => {
  if (sale.delivery && !sale.customerName) ctx.addIssue({ code: "custom", path: ["customerName"], message: "Enter the delivery customer's name." });
  if (sale.paymentMethod === "COD") {
    if (!sale.delivery) ctx.addIssue({ code: "custom", path: ["delivery"], message: "COD requires Royal Express delivery and customer details." });
    if (sale.tendered !== 0) ctx.addIssue({ code: "custom", path: ["tendered"], message: "COD payment is collected on delivery." });
  }
  if (new Set(sale.items.map(item => item.sizeStockId)).size !== sale.items.length) {
    ctx.addIssue({ code: "custom", path: ["items"], message: "Combine duplicate sizes into one cart line." });
  }
  if (sale.paymentMethod !== "CASH" && sale.paymentMethod !== "COD" && !sale.paymentReference) {
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
