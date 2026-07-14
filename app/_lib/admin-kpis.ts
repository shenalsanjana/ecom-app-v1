// Single source for admin dashboard KPI queries. Five COUNT queries in
// parallel; expected ~30-100ms on Prisma Postgres. No caching — the /admin
// route is dynamic via requireAdmin() reading cookies, and freshness wins
// over micro-latency on a low-traffic admin route.
import { prisma } from "@/app/_lib/prisma";
import { startOfTodaySLT } from "@/app/_lib/time";
import { LOW_STOCK_THRESHOLD } from "@/app/_lib/admin-products";

export type DashboardKpis = {
  ordersToConfirm: number;
  ordersToDispatch: number;
  todaysOrders: number;
  lowStock: number;
};

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const [ordersToConfirm, ordersToDispatch, todaysOrders, lowPlainStock, lowDesignStock] = await Promise.all([
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { status: "CONFIRMED", courierBookedAt: null } }),
    prisma.order.count({ where: { createdAt: { gte: startOfTodaySLT() } } }),
    prisma.plainTshirtStock.count({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } } }),
    prisma.dtfDesign.count({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } } }),
  ]);
  return { ordersToConfirm, ordersToDispatch, todaysOrders, lowStock: lowPlainStock + lowDesignStock };
}
