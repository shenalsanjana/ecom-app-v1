import type { Prisma } from "@prisma/client";

export const ORDER_TABS = ["all", "needs-dispatch", "pending-cod", "delivered", "cancelled"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

export type ListParams = {
  tab?: OrderTab;
  q?: string;
  status?: string;
  payment?: string;
};

export function buildOrderWhere(params: ListParams): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};

  switch (params.tab) {
    case "needs-dispatch":
      where.status = "CONFIRMED";
      where.courierBookedAt = null;
      break;
    case "pending-cod":
      where.paymentStatus = "COD_PENDING";
      break;
    case "delivered":
      where.status = "DELIVERED";
      break;
    case "cancelled":
      where.status = "CANCELLED";
      break;
    // "all" / undefined → no preset
  }

  if (params.status) where.status = params.status;
  if (params.payment) where.paymentStatus = params.payment;

  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { webNumber: { contains: q, mode: "insensitive" } },
      { rbNumber: { contains: q, mode: "insensitive" } },
      { guestName: { contains: q, mode: "insensitive" } },
      { guestEmail: { contains: q, mode: "insensitive" } },
      { customerPhone: { contains: q, mode: "insensitive" } },
      { user: { is: { name: { contains: q, mode: "insensitive" } } } },
      { user: { is: { email: { contains: q, mode: "insensitive" } } } },
    ];
  }

  return where;
}

import { calculateDelivery } from "@/app/_lib/checkout-config";
import { zoneForCity } from "@/app/_lib/delivery-zones";

export function recomputeTotals(
  items: { price: number; quantity: number }[],
  city: string,
): { subtotal: number; shippingCost: number; total: number } {
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const shippingCost = calculateDelivery(subtotal, zoneForCity(city));
  return { subtotal, shippingCost, total: subtotal + shippingCost };
}
