import type { Prisma } from "@prisma/client";
import { calculateDelivery, DEFAULT_DELIVERY_CONFIG, type DeliveryConfig } from "@/app/_lib/checkout-config";
import { zoneForCity } from "@/app/_lib/delivery-zones";
import { prisma } from "@/app/_lib/prisma";

export const ORDER_TABS = ["all", "pending", "needs-dispatch", "pending-cod", "delivered", "cancelled"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

export type ListParams = {
  tab?: OrderTab;
  q?: string;
  payment?: string;
  sort?: "newest" | "oldest";
};

export function buildOrderWhere(params: ListParams): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};

  switch (params.tab) {
    case "pending":
      where.status = "PENDING";
      break;
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

export type AdjustmentKind = "CHARGE" | "DISCOUNT";

export function signedAdjustmentAmount(kind: AdjustmentKind, amount: number): number {
  return kind === "DISCOUNT" ? -amount : amount;
}

export function courierBookedError(order: { courierBookedAt: Date | null }): string | null {
  return order.courierBookedAt
    ? "Order already sent to Curfox — cancel/rebook there to make changes."
    : null;
}

export function recomputeTotals(
  items: { price: number; quantity: number }[],
  city: string,
  config: DeliveryConfig = DEFAULT_DELIVERY_CONFIG,
  adjustments: { amount: number }[] = [],
  // Pass the order's method: Koko/Mintpay never get free delivery, and an edit
  // that recomputed without it would silently hand the order free shipping that
  // checkout had correctly charged for.
  paymentMethod?: string | null,
): { subtotal: number; shippingCost: number; total: number } {
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const shippingCost = calculateDelivery(subtotal, zoneForCity(city), config, paymentMethod);
  const adjustmentTotal = adjustments.reduce((s, a) => s + a.amount, 0);
  const total = Math.max(0, subtotal + shippingCost + adjustmentTotal);
  return { subtotal, shippingCost, total };
}

export type OrderItemRow = {
  id: string;
  // Null when the referenced variant was hard-deleted (FK ON DELETE SET NULL).
  variantId: string | null;
  name: string;
  size: string | null;
  price: number;
  quantity: number;
  // Frozen raw-material pool ids this line consumed at order-creation time
  // (or the last time its size changed). Null for sizeless lines or orders
  // that predate this feature.
  plainTshirtStockId: string | null;
  dtfDesignId: string | null;
};

export type ItemChange = {
  id: string;
  quantity?: number;
  size?: string | null;
  remove?: boolean;
};

export type NextItem = OrderItemRow & { sizeChanged: boolean };

/**
 * Applies edit-mode changes to the order's items. Pure item-list math only —
 * it does NOT touch stock. The caller (editItems) restores every original
 * item's pools and reacquires every surviving item's pools via the shared
 * restoreItemPools/acquireItemPools helpers; unchanged lines net to zero.
 * `sizeChanged` tells the caller which surviving items need a NEW
 * plainTshirtStockId resolved (the design never changes on an edit, so
 * dtfDesignId is always carried through as-is).
 */
export function applyItemChanges(
  current: OrderItemRow[],
  changes: ItemChange[],
): { nextItems: NextItem[] } {
  const byId = new Map(current.map((i) => [i.id, { ...i }]));
  const originalSizeById = new Map(current.map((i) => [i.id, i.size]));

  for (const change of changes) {
    const item = byId.get(change.id);
    if (!item) throw new Error(`Unknown order item: ${change.id}`);
    if (change.remove) {
      byId.delete(change.id);
      continue;
    }
    if (change.quantity !== undefined) {
      if (change.quantity <= 0) throw new Error("Quantity must be positive; remove the item instead");
      item.quantity = change.quantity;
    }
    if (change.size !== undefined) item.size = change.size;
  }

  const nextItems: NextItem[] = [...byId.values()].map((item) => ({
    ...item,
    sizeChanged: item.size !== originalSizeById.get(item.id),
  }));
  return { nextItems };
}

const TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED"],
  CONFIRMED: ["DELIVERED"],
  DISPATCHED: ["DELIVERED"],
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

/**
 * Payment guardrail for confirming/dispatching. COD is exempt (COD_PENDING is its
 * normal pre-delivery state); online orders must be PAID before they can ship.
 */
export function canConfirm(order: { paymentMethod: string; paymentStatus: string | null }): boolean {
  return order.paymentMethod === "COD" || order.paymentStatus === "PAID";
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
        items: { take: 2, orderBy: { id: "asc" }, select: { id: true, name: true, color: true, size: true, quantity: true } },
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
      items: { include: { variant: { select: { sizeStocks: { select: { size: true } } } } } },
      notesLog: { orderBy: { createdAt: "desc" } },
      adjustments: { orderBy: { createdAt: "asc" } },
    },
  });
}
