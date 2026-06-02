import type { Prisma } from "@prisma/client";
import { calculateDelivery } from "@/app/_lib/checkout-config";
import { zoneForCity } from "@/app/_lib/delivery-zones";
import { prisma } from "@/app/_lib/prisma";

export const ORDER_TABS = ["all", "needs-dispatch", "pending-cod", "delivered", "cancelled"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

export type ListParams = {
  tab?: OrderTab;
  q?: string;
  status?: string;
  payment?: string;
  sort?: "newest" | "oldest";
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

  // Explicit filters override the tab preset. When status is overridden we also
  // drop the needs-dispatch courierBookedAt:null constraint, which would
  // otherwise leak into an incoherent query (e.g. status=PENDING + not-booked).
  if (params.status) {
    where.status = params.status;
    delete where.courierBookedAt;
  }
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

export function recomputeTotals(
  items: { price: number; quantity: number }[],
  city: string,
): { subtotal: number; shippingCost: number; total: number } {
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const shippingCost = calculateDelivery(subtotal, zoneForCity(city));
  return { subtotal, shippingCost, total: subtotal + shippingCost };
}

export type OrderItemRow = {
  id: string;
  productId: string;
  name: string;
  size: string | null;
  price: number;
  quantity: number;
};

export type ItemChange = {
  id: string;
  quantity?: number;
  size?: string | null;
  remove?: boolean;
};

/**
 * Applies edit-mode changes to the order's items. Returns the next item set and
 * per-product stock deltas: positive = restore to stock, negative = decrement.
 */
export function applyItemChanges(
  current: OrderItemRow[],
  changes: ItemChange[],
): { nextItems: OrderItemRow[]; stockDeltas: Record<string, number> } {
  const byId = new Map(current.map((i) => [i.id, { ...i }]));
  const deltas: Record<string, number> = {};
  const addDelta = (productId: string, d: number) => {
    if (d === 0) return;
    deltas[productId] = (deltas[productId] ?? 0) + d;
  };

  for (const change of changes) {
    const item = byId.get(change.id);
    if (!item) throw new Error(`Unknown order item: ${change.id}`);

    if (change.remove) {
      addDelta(item.productId, item.quantity); // restore all
      byId.delete(change.id);
      continue;
    }
    if (change.size !== undefined) item.size = change.size;
    if (change.quantity !== undefined) {
      if (change.quantity <= 0) throw new Error("Quantity must be positive; remove the item instead");
      addDelta(item.productId, item.quantity - change.quantity); // old - new
      item.quantity = change.quantity;
    }
  }

  // prune zero deltas
  for (const k of Object.keys(deltas)) if (deltas[k] === 0) delete deltas[k];
  return { nextItems: [...byId.values()], stockDeltas: deltas };
}

const TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED"],
  CONFIRMED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function nextStatuses(current: string): string[] {
  return TRANSITIONS[current] ?? [];
}

export function canEdit(order: { status: string }): boolean {
  return order.status !== "DELIVERED" && order.status !== "CANCELLED";
}

/** Identical to canEdit today; kept separate in case cancellation rules diverge. */
export function canCancel(order: { status: string }): boolean {
  return canEdit(order);
}

export const PAGE_SIZE = 25;

export async function listOrders(
  params: ListParams & { page?: number; pageSize?: number },
) {
  const where = buildOrderWhere(params);
  const pageSize = Math.min(params.pageSize ?? PAGE_SIZE, 200);
  const page = Math.max(1, params.page ?? 1);
  const orderBy = { createdAt: params.sort === "oldest" ? "asc" : "desc" } as const;

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy,
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return { rows, total };
}

export async function getOrderDetail(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true } },
      items: { include: { product: { select: { sizes: true } } } },
      notesLog: { orderBy: { createdAt: "desc" } },
    },
  });
}
