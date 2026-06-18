// Single source for admin dashboard KPI queries. Four COUNT queries
// in parallel; expected ~30-100ms on Prisma Postgres. Only createdAt
// has a schema-level index today — the others are unindexed scans on
// small tables (acceptable for current traffic; revisit if Order or
// Product rows grow significantly). No caching —
// the /admin route is dynamic via requireAdmin() reading cookies, and
// freshness wins over micro-latency on a low-traffic admin route.
import { prisma } from "@/app/_lib/prisma";
import { startOfTodaySLT } from "@/app/_lib/time";

const LOW_STOCK_THRESHOLD = 5;

export type DashboardKpis = {
  ordersToConfirm: number;
  ordersToDispatch: number;
  todaysOrders: number;
  lowStock: number;
};

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const [ordersToConfirm, ordersToDispatch, todaysOrders, lowStock] = await Promise.all([
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { status: "CONFIRMED", courierBookedAt: null } }),
    prisma.order.count({ where: { createdAt: { gte: startOfTodaySLT() } } }),
    prisma.product.count({ where: { stock: { lte: LOW_STOCK_THRESHOLD } } }),
  ]);
  return { ordersToConfirm, ordersToDispatch, todaysOrders, lowStock };
}
