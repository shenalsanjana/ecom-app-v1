import { z } from "zod";

export const POS_ADJUSTMENT_MAX_CENTS = 1_000_000_000;
const valueSchema = z.object({
  mode: z.enum(["FIXED", "PERCENT"]),
  // Fixed values are cents; percentages are hundredths of a percent.
  value: z.number().int().min(0).max(POS_ADJUSTMENT_MAX_CENTS),
}).strict();
export const PosPriceAdjustmentsSchema = z.object({
  charge: valueSchema.optional(), discount: valueSchema.optional(),
}).strict().superRefine((input, ctx) => {
  for (const kind of ["charge", "discount"] as const) {
    const entry = input[kind];
    if (entry?.mode === "PERCENT" && entry.value > (kind === "discount" ? 10_000 : 100_000)) {
      ctx.addIssue({ code: "custom", path: [kind, "value"], message: kind === "discount" ? "Discount cannot exceed 100%." : "Additional cost cannot exceed 1000%." });
    }
  }
});
export type PosPriceAdjustments = z.infer<typeof PosPriceAdjustmentsSchema>;
const draftValue = z.object({ mode: z.enum(["FIXED", "PERCENT"]), value: z.string().max(30) });
const draftSchema = z.object({ charge: draftValue, discount: draftValue });
export type PosAdjustmentDraft = z.infer<typeof draftSchema>;
export const emptyPosAdjustments = (): PosAdjustmentDraft => ({ charge: { mode: "FIXED", value: "" }, discount: { mode: "FIXED", value: "" } });
export const restorePosAdjustments = (value: unknown): PosAdjustmentDraft => {
  const result = draftSchema.safeParse(value);
  return result.success ? result.data : emptyPosAdjustments();
};
export function parsePosAdjustments(draft: PosAdjustmentDraft): PosPriceAdjustments | undefined {
  const result: PosPriceAdjustments = {};
  for (const kind of ["charge", "discount"] as const) {
    const entry = draft[kind];
    if (!entry.value.trim()) continue;
    if (!/^\d+(?:\.\d{1,2})?$/.test(entry.value.trim())) throw new Error("Enter a non-negative amount with at most two decimals.");
    const value = Math.round(Number(entry.value) * 100);
    if (value) result[kind] = { mode: entry.mode, value };
  }
  const parsed = PosPriceAdjustmentsSchema.safeParse(result);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  return Object.keys(result).length ? parsed.data : undefined;
}
export function hasPosPriceAdjustments(order: { salesChannel?: string; adjustments?: { label: string }[] }) {
  return order.salesChannel === "POS" && !!order.adjustments?.some(entry => entry.label.startsWith("POS · "));
}
type PricingItem = { sizeStockId: string; price: number; quantity: number; adjustments?: PosPriceAdjustments };
export function calculatePosPricing(items: PricingItem[], bill?: PosPriceAdjustments) {
  const adjustments: { label: string; amount: number; sizeStockId?: string }[] = [];
  const lineTotals = new Map<string, number>();
  const check = (value: number) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > POS_ADJUSTMENT_MAX_CENTS) throw new Error("The adjusted amount is outside the supported range.");
    return value;
  };
  const apply = (base: number, input: PosPriceAdjustments | undefined, scope: string, sizeStockId?: string) => {
    let net = check(base);
    if (!input) return net;
    const parsed = PosPriceAdjustmentsSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    for (const kind of ["charge", "discount"] as const) {
      const entry = parsed.data[kind];
      if (!entry?.value) continue;
      const amount = entry.mode === "FIXED" ? entry.value : Math.floor((net * entry.value + 5000) / 10_000);
      if (kind === "discount" && amount > net) throw new Error(`${scope}: discount exceeds the amount available.`);
      const signed = kind === "charge" ? amount : -amount;
      net = check(net + signed);
      const value = entry.mode === "PERCENT" ? `${entry.value / 100}%` : `LKR ${(entry.value / 100).toFixed(2)}`;
      adjustments.push({ label: `POS · ${scope} · ${kind === "charge" ? "Additional cost" : "Discount"} (${value})`, amount: signed, ...(sizeStockId ? { sizeStockId } : {}) });
    }
    return net;
  };
  let subtotal = 0, itemTotal = 0;
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || !Number.isSafeInteger(item.price) || item.price <= 0) throw new Error("Invalid cart quantity or price.");
    const base = check(item.price * item.quantity);
    subtotal = check(subtotal + base);
    const line = apply(base, item.adjustments, "Item", item.sizeStockId);
    lineTotals.set(item.sizeStockId, line);
    itemTotal = check(itemTotal + line);
  }
  const merchandiseTotal = apply(itemTotal, bill, "Entire bill");
  return { subtotal, merchandiseTotal, adjustments, lineTotals };
}
