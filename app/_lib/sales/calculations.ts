import { DAY, sltDay, type SalesRange } from "./range";
export const isSettled = (status: string | null) => status === "PAID" || status === "COD_COLLECTED";
export function cents(value: number) {
  const result = Math.round(value * 100);
  if (!Number.isSafeInteger(result)) throw new Error("A recorded amount is outside the supported reporting range.");
  return result;
}
export function allocate(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || weights.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error("Invalid sales allocation.");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!weights.length) { if (total) throw new Error("An order has an amount but no items."); return []; }
  const bases = sum ? weights : weights.map(() => 1), denominator = sum || weights.length;
  const parts = bases.map((weight, index) => {
    const numerator = BigInt(total) * BigInt(weight), div = BigInt(denominator);
    return { index, amount: Number(numerator / div), remainder: numerator % div };
  });
  let remaining = total - parts.reduce((n, row) => n + row.amount, 0);
  for (const part of [...parts].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (!remaining) break; part.amount++; remaining--;
  }
  return parts.map(part => part.amount);
}
export type SalesItem = { id: string; productId: string | null; name: string; sku: string | null; size: string | null; price: number; quantity: number;
  unitCostCents: number | null; salesListPriceCents: number | null; salesProductKey: string | null; salesCategoryKey: string | null; salesCategoryName: string | null };
export type SalesOrder = { id: string; webNumber: string | null; posNumber: string | null; salesChannel: string; paymentMethod: string; paymentStatus: string | null;
  status: string; total: number; shippingCost: number; salesPaidAt: Date | null; salesDateEstimated: boolean; createdAt: Date;
  items: SalesItem[]; adjustments: { amount: number; salesItemSku: string | null }[] };
export type SalesRefundRow = { id: string; orderId: string; merchandiseCents: number; shippingCents: number; occurredAt: Date; voidedAt: Date | null;
  order: { status: string; paymentStatus: string | null; salesChannel: string; paymentMethod: string };
  items: { orderItemId: string; amountCents: number; returnedQuantity: number; unitCostCents: number | null; productKey: string; productName: string; categoryKey: string; categoryName: string; size: string }[] };
export function itemDimensions(item: SalesItem) {
  return { productKey: item.salesProductKey ?? item.productId ?? `legacy-item:${item.id}`, productName: item.name,
    categoryKey: item.salesCategoryKey ?? "uncategorized", categoryName: item.salesCategoryName ?? "Uncategorized", size: item.size || "Unspecified" };
}
export function orderLines(order: Pick<SalesOrder, "items" | "adjustments" | "total" | "shippingCost">) {
  const lines = [...order.items].sort((a, b) => a.id.localeCompare(b.id)).map(item => {
    const base = cents(item.price) * item.quantity;
    if (!Number.isSafeInteger(base) || base < 0 || !Number.isInteger(item.quantity) || item.quantity < 1) throw new Error("An order has invalid item amounts.");
    const gross = Math.max(cents(item.price), item.salesListPriceCents ?? cents(item.price)) * item.quantity;
    return { item, ...itemDimensions(item), gross, discounts: gross - base, charges: 0, net: base };
  });
  let billCharges = 0, billDiscounts = 0;
  for (const adjustment of order.adjustments) {
    const amount = cents(adjustment.amount), matches = adjustment.salesItemSku ? lines.filter(line => line.item.sku === adjustment.salesItemSku) : [];
    if (matches.length === 1) {
      if (amount > 0) matches[0].charges += amount; else matches[0].discounts -= amount;
      matches[0].net += amount;
    } else if (amount > 0) billCharges += amount; else billDiscounts -= amount;
  }
  if (lines.some(line => line.net < 0)) throw new Error("An item's saved discount exceeds its value. Review the order.");
  const apply = (amount: number, discount: boolean) => {
    const parts = allocate(amount, lines.map(line => line.net));
    lines.forEach((line, index) => { line.net += discount ? -parts[index] : parts[index]; if (discount) line.discounts += parts[index]; else line.charges += parts[index]; });
  };
  apply(billCharges, false); apply(billDiscounts, true);
  const target = cents(order.total) - cents(order.shippingCost), before = lines.reduce((n, line) => n + line.net, 0), difference = target - before;
  if (target < 0 || lines.some(line => line.net < 0)) throw new Error("An order has inconsistent merchandise totals. Review it before reporting.");
  // Paid order total is authoritative. Surface older inconsistencies instead of dropping cents.
  if (difference) apply(Math.abs(difference), difference < 0);
  return { lines, reconciled: difference === 0 };
}
export type Metric = { orders: number; units: number; returnedUnits: number; grossCents: number; discountCents: number; chargeCents: number; netSalesCents: number;
  shippingCents: number; revenueCents: number; refundCents: number; cancelledRefundCents: number; costCents: number; recoveredCostCents: number; missingCostUnits: number; profitCents: number | null };
export type Breakdown = Metric & { key: string; name: string };
export function emptyMetric(): Metric { return { orders: 0, units: 0, returnedUnits: 0, grossCents: 0, discountCents: 0, chargeCents: 0, netSalesCents: 0,
  shippingCents: 0, revenueCents: 0, refundCents: 0, cancelledRefundCents: 0, costCents: 0, recoveredCostCents: 0, missingCostUnits: 0, profitCents: 0 }; }
export type StatusSummary = { placed: number; pending: number; pendingCents: number; failed: number; cancelled: number; deliveredPaid: number; paymentReview: number };
export type SalesReport = { generatedAt: string; range: { start: string; end: string; channel: string; period: string }; totals: Metric; status: StatusSummary;
  channels: Breakdown[]; payments: Breakdown[]; products: Breakdown[]; categories: Breakdown[]; sizes: Breakdown[]; daily: Breakdown[]; bestSellers: Breakdown[];
  quality: { estimatedPaidDates: number; legacyPriceOrders: number; reconciledOrders: number; missingCosts: { orderId: string; reference: string; item: string; quantity: number }[] };
  lowStock: { kind: string; name: string; quantity: number }[]; lowStockCount: number };
const paymentNames: Record<string, string> = { CASH: "Cash", CARD: "Card terminal", PAYHERE: "PayHere", KOKO: "Koko", MINTPAY: "Mintpay", BANK_TRANSFER: "Bank transfer", COD: "Cash on delivery" };
export function calculateSales(orders: SalesOrder[], refunds: SalesRefundRow[], range: SalesRange, status: StatusSummary, now = new Date()): SalesReport {
  status = { ...status };
  const totals = emptyMetric(), maps = { channels: new Map<string, Breakdown>(), payments: new Map<string, Breakdown>(), products: new Map<string, Breakdown>(), categories: new Map<string, Breakdown>(), sizes: new Map<string, Breakdown>(), daily: new Map<string, Breakdown>() };
  const seen = new Map<Metric, Set<string>>();
  const row = (map: Map<string, Breakdown>, key: string, name: string) => { if (!map.has(key)) map.set(key, { key, name, ...emptyMetric() }); return map.get(key)!; };
  row(maps.channels, "POS", "Shop POS"); row(maps.channels, "ONLINE", "Online store");
  for (let date = range.from.getTime(); date < range.to.getTime(); date += DAY) { const key = sltDay(new Date(date)); row(maps.daily, key, key); }
  const quality: SalesReport["quality"] = { estimatedPaidDates: 0, legacyPriceOrders: 0, reconciledOrders: 0, missingCosts: [] };
  const within = (date: Date) => date >= range.from && date < range.to;
  for (const order of new Map(orders.map(order => [order.id, order])).values()) {
    if (!isSettled(order.paymentStatus) || order.status === "CANCELLED" || !order.salesPaidAt || !within(order.salesPaidAt) || (range.channel !== "ALL" && order.salesChannel !== range.channel)) continue;
    const channel = order.salesChannel === "POS" ? "POS" : "ONLINE", date = sltDay(order.salesPaidAt);
    const parents = [totals, row(maps.channels, channel, channel === "POS" ? "Shop POS" : "Online store"), row(maps.payments, order.paymentMethod, paymentNames[order.paymentMethod] ?? order.paymentMethod), row(maps.daily, date, date)];
    const result = orderLines(order);
    if (order.salesDateEstimated) quality.estimatedPaidDates++;
    if (order.items.some(item => item.salesListPriceCents === null)) quality.legacyPriceOrders++;
    if (!result.reconciled) quality.reconciledOrders++;
    for (const metric of parents) { metric.orders++; metric.shippingCents += cents(order.shippingCost); }
    if (order.status === "DELIVERED") status.deliveredPaid++;
    for (const line of result.lines) {
      const dimensions = [row(maps.products, line.productKey, line.productName), row(maps.categories, line.categoryKey, line.categoryName), row(maps.sizes, line.size, line.size)];
      for (const metric of [...parents, ...dimensions]) {
        metric.units += line.item.quantity; metric.grossCents += line.gross; metric.discountCents += line.discounts; metric.chargeCents += line.charges; metric.netSalesCents += line.net;
        if (line.item.unitCostCents === null) metric.missingCostUnits += line.item.quantity; else metric.costCents += line.item.unitCostCents * line.item.quantity;
      }
      for (const metric of dimensions) { const set = seen.get(metric) ?? new Set<string>(); if (!set.has(order.id)) { metric.orders++; set.add(order.id); seen.set(metric, set); } }
      if (line.item.unitCostCents === null && quality.missingCosts.length < 20) quality.missingCosts.push({ orderId: order.id, reference: order.posNumber ?? order.webNumber ?? order.id, item: line.item.name, quantity: line.item.quantity });
    }
  }
  for (const refund of new Map(refunds.map(refund => [refund.id, refund])).values()) {
    if (refund.voidedAt || !within(refund.occurredAt) || (range.channel !== "ALL" && refund.order.salesChannel !== range.channel)) continue;
    const channel = refund.order.salesChannel === "POS" ? "POS" : "ONLINE", date = sltDay(refund.occurredAt), amount = refund.merchandiseCents + refund.shippingCents;
    const parents = [totals, row(maps.channels, channel, channel === "POS" ? "Shop POS" : "Online store"), row(maps.payments, refund.order.paymentMethod, paymentNames[refund.order.paymentMethod] ?? refund.order.paymentMethod), row(maps.daily, date, date)];
    const eligible = refund.order.status !== "CANCELLED" && isSettled(refund.order.paymentStatus);
    for (const metric of parents) { metric.refundCents += amount; if (!eligible) metric.cancelledRefundCents += amount; else metric.shippingCents -= refund.shippingCents; }
    if (!eligible) continue;
    for (const item of refund.items) {
      const dimensions = [row(maps.products, item.productKey, item.productName), row(maps.categories, item.categoryKey, item.categoryName), row(maps.sizes, item.size, item.size)];
      for (const metric of [...parents, ...dimensions]) {
        metric.netSalesCents -= item.amountCents; metric.returnedUnits += item.returnedQuantity;
        if (item.returnedQuantity && item.unitCostCents === null) metric.missingCostUnits += item.returnedQuantity;
        else metric.recoveredCostCents += (item.unitCostCents ?? 0) * item.returnedQuantity;
      }
      for (const metric of dimensions) metric.refundCents += item.amountCents;
      if (item.returnedQuantity && item.unitCostCents === null && quality.missingCosts.length < 20) {
        quality.missingCosts.push({ orderId: refund.orderId, reference: refund.orderId, item: item.productName, quantity: item.returnedQuantity });
      }
    }
  }
  for (const metric of [totals, ...Object.values(maps).flatMap(map => [...map.values()])]) {
    metric.revenueCents = metric.netSalesCents + metric.shippingCents;
    metric.profitCents = metric.missingCostUnits ? null : metric.netSalesCents - metric.costCents + metric.recoveredCostCents;
    if (Object.values(metric).some(value => typeof value === "number" && !Number.isSafeInteger(value))) throw new Error("The report exceeds the supported amount range.");
  }
  const sorted = (map: Map<string, Breakdown>) => [...map.values()].sort((a, b) => b.netSalesCents - a.netSalesCents || a.name.localeCompare(b.name));
  const products = sorted(maps.products);
  return { generatedAt: now.toISOString(), range: { start: range.start, end: range.end, channel: range.channel, period: range.period }, totals, status,
    channels: sorted(maps.channels), payments: sorted(maps.payments), products, categories: sorted(maps.categories), sizes: sorted(maps.sizes),
    daily: [...maps.daily.values()].sort((a, b) => a.key.localeCompare(b.key)), bestSellers: [...products].filter(row => row.units > 0).sort((a, b) => (b.units - b.returnedUnits) - (a.units - a.returnedUnits) || b.netSalesCents - a.netSalesCents).slice(0, 10),
    quality, lowStock: [], lowStockCount: 0 };
}
