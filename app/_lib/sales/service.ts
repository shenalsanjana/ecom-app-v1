import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { LOW_STOCK_THRESHOLD } from "../admin-products";
import { calculateSales, cents, type SalesReport, type StatusSummary } from "./calculations";
import { salesRange, type SalesQuery } from "./range";

export class SalesRangeError extends Error {}
export class SalesBusyError extends Error {}
export const MAX_SALES_ORDERS = 5000, MAX_SALES_LINES = 20000, MAX_SALES_REFUNDS = 2000;
export const salesOrderSelect = {
  id: true, webNumber: true, posNumber: true, salesChannel: true, paymentMethod: true, paymentStatus: true, status: true,
  total: true, shippingCost: true, createdAt: true, salesPaidAt: true, salesDateEstimated: true,
  items: { orderBy: { id: "asc" }, select: { id: true, productId: true, name: true, sku: true, size: true, price: true, quantity: true,
    unitCostCents: true, salesListPriceCents: true, salesProductKey: true, salesCategoryKey: true, salesCategoryName: true } },
  adjustments: { select: { amount: true, salesItemSku: true } },
} satisfies Prisma.OrderSelect;
const cache = new Map<string, { expires: number; value: SalesReport }>();
let computing: { key: string; promise: Promise<SalesReport> } | null = null;
export function invalidateSalesReports() { cache.clear(); }

export async function readSalesReport(query: SalesQuery, now = new Date()): Promise<SalesReport> {
  let range;
  try { range = salesRange(query, now); } catch (error) { throw new SalesRangeError(error instanceof Error ? error.message : "Choose a valid reporting range."); }
  const key = `${range.period}|${range.start}|${range.end}|${range.channel}`, current = cache.get(key);
  if (current && current.expires > Date.now()) return current.value;
  if (computing?.key === key) return computing.promise;
  if (computing) throw new SalesBusyError("Another report is being prepared. Please try again in a few seconds.");
  const promise = prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout='5s'`;
    const channel = range.channel === "ALL" ? {} : { salesChannel: range.channel };
    const paidWhere: Prisma.OrderWhereInput = { ...channel, status: { not: "CANCELLED" }, paymentStatus: { in: ["PAID", "COD_COLLECTED"] }, salesPaidAt: { gte: range.from, lt: range.to } };
    const refundWhere: Prisma.SalesRefundWhereInput = { voidedAt: null, occurredAt: { gte: range.from, lt: range.to }, ...(range.channel === "ALL" ? {} : { order: channel }) };
    const [orderCount, lineCount, refundCount, refundLineCount] = await Promise.all([
      tx.order.count({ where: paidWhere }), tx.orderItem.count({ where: { order: paidWhere } }),
      tx.salesRefund.count({ where: refundWhere }), tx.salesRefundItem.count({ where: { refund: refundWhere } }),
    ]);
    if (orderCount > MAX_SALES_ORDERS || refundCount > MAX_SALES_REFUNDS || lineCount + refundLineCount > MAX_SALES_LINES) throw new SalesRangeError("This report is too large for an interactive view. Narrow the dates or select one sales channel, then export each range.");
    const [orders, refunds, groups, plainCount, printCount, blanks, prints] = await Promise.all([
      tx.order.findMany({ where: paidWhere, select: salesOrderSelect, orderBy: { id: "asc" }, take: MAX_SALES_ORDERS }),
      tx.salesRefund.findMany({ where: refundWhere, orderBy: { id: "asc" }, take: MAX_SALES_REFUNDS, select: {
        id: true, orderId: true, merchandiseCents: true, shippingCents: true, occurredAt: true, voidedAt: true,
        order: { select: { status: true, paymentStatus: true, salesChannel: true, paymentMethod: true } },
        items: { select: { orderItemId: true, amountCents: true, returnedQuantity: true, unitCostCents: true, productKey: true, productName: true, categoryKey: true, categoryName: true, size: true } },
      } }),
      tx.order.groupBy({ by: ["status", "paymentStatus", "paymentReviewRequired"], where: { ...channel, createdAt: { gte: range.from, lt: range.to } }, _count: { _all: true }, _sum: { total: true } }),
      tx.plainTshirtStock.count({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } } }),
      tx.dtfDesign.count({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } } }),
      tx.plainTshirtStock.findMany({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } }, take: 20, orderBy: [{ quantity: "asc" }, { id: "asc" }], select: { quantity: true, color: true, size: true, inventoryProduct: { select: { name: true } } } }),
      tx.dtfDesign.findMany({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } }, take: 20, orderBy: [{ quantity: "asc" }, { id: "asc" }], select: { name: true, quantity: true } }),
    ]);
    const status: StatusSummary = { placed: 0, pending: 0, pendingCents: 0, failed: 0, cancelled: 0, deliveredPaid: 0, paymentReview: 0 };
    for (const group of groups) {
      if (group.paymentReviewRequired) status.paymentReview += group._count._all;
      if (group.status === "CANCELLED") { status.cancelled += group._count._all; continue; }
      status.placed += group._count._all;
      if (group.paymentStatus === "PAYMENT_FAILED") status.failed += group._count._all;
      else if (!["PAID", "COD_COLLECTED"].includes(group.paymentStatus ?? "")) { status.pending += group._count._all; status.pendingCents += cents(group._sum.total ?? 0); }
    }
    const report = calculateSales(orders, refunds, range, status, now);
    report.lowStockCount = plainCount + printCount;
    report.lowStock = [...blanks.map(stock => ({ kind: "Shared blank", name: `${stock.inventoryProduct?.name ?? "Unassigned blank"} · ${stock.color} · ${stock.size}`, quantity: stock.quantity })),
      ...prints.map(stock => ({ kind: "Print", name: stock.name, quantity: stock.quantity }))].sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name)).slice(0, 20);
    return report;
  }, { isolationLevel: "RepeatableRead", maxWait: 1500, timeout: 8000 });
  computing = { key, promise };
  try {
    const value = await promise;
    cache.set(key, { value, expires: Date.now() + 5000 });
    while (cache.size > 4) cache.delete(cache.keys().next().value!);
    return value;
  } finally { if (computing?.promise === promise) computing = null; }
}
