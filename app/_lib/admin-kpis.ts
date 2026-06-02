// Single source for admin dashboard KPI queries. Four COUNT queries
// in parallel; expected ~30-100ms on Prisma Postgres. Only createdAt
// has a schema-level index today — the others are unindexed scans on
// small tables (acceptable for current traffic; revisit if Order or
// Product rows grow significantly). No caching —
// the /admin route is dynamic via requireAdmin() reading cookies, and
// freshness wins over micro-latency on a low-traffic admin route.
import { prisma } from "@/app/_lib/prisma";
import { startOfTodaySLT } from "@/app/_lib/time";
import { LOW_STOCK_THRESHOLD } from "@/app/_lib/admin-products";

export type DashboardKpis = {
  pendingDispatch: number;
  todaysOrders: number;
  pendingCod: number;
  lowStock: number;
};

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const [pendingDispatch, todaysOrders, pendingCod, lowStock] = await Promise.all([
    prisma.order.count({ where: { status: "CONFIRMED", courierBookedAt: null } }),
    prisma.order.count({ where: { createdAt: { gte: startOfTodaySLT() } } }),
    prisma.order.count({ where: { paymentStatus: "COD_PENDING" } }),
    prisma.product.count({ where: { stock: { lte: LOW_STOCK_THRESHOLD } } }),
  ]);
  return { pendingDispatch, todaysOrders, pendingCod, lowStock };
}
