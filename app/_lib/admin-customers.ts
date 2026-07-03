import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import { CUSTOMER_TABS, type CustomerTab } from "@/app/_lib/customer-tabs";

export { CUSTOMER_TABS };
export type { CustomerTab };

export type CustomerListParams = { role?: CustomerTab; q?: string };

export function buildCustomerWhere(params: CustomerListParams): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};

  switch (params.role) {
    case "admins":
      where.role = "ADMIN";
      break;
    case "all":
      break;
    case "customers":
    default:
      where.role = "CUSTOMER";
  }

  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function countAdmins(): Promise<number> {
  return prisma.user.count({ where: { role: "ADMIN" } });
}

export const PAGE_SIZE = 25;

export type CustomerRow = {
  id: string; name: string; email: string; role: string; createdAt: Date;
  orderCount: number; totalSpent: number;
};

export async function listCustomers(
  params: CustomerListParams & { page?: number; pageSize?: number },
): Promise<{ rows: CustomerRow[]; total: number }> {
  const where = buildCustomerWhere(params);
  const pageSize = Math.min(params.pageSize ?? PAGE_SIZE, 200);
  const page = Math.max(1, params.page ?? 1);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    prisma.user.count({ where }),
  ]);

  const ids = users.map((u) => u.id);
  const agg = ids.length
    ? await prisma.order.groupBy({
        by: ["userId"],
        where: { userId: { in: ids }, status: { not: "CANCELLED" } },
        _count: { _all: true },
        _sum: { total: true },
      })
    : [];
  const map = new Map(agg.map((a) => [a.userId, { count: a._count._all, sum: a._sum.total ?? 0 }]));

  const rows: CustomerRow[] = users.map((u) => {
    const m = map.get(u.id) ?? { count: 0, sum: 0 };
    return { ...u, email: u.email ?? "", orderCount: m.count, totalSpent: m.sum };
  });

  return { rows, total };
}

export async function getCustomer(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true, createdAt: true,
      addresses: { orderBy: { isDefault: "desc" } },
      orders: {
        take: 10,
        orderBy: { createdAt: "desc" },
        select: { id: true, webNumber: true, total: true, status: true, paymentStatus: true, createdAt: true },
      },
      _count: { select: { wishlist: true } },
    },
  });
  if (!user) return null;

  const agg = await prisma.order.aggregate({
    where: { userId: id, status: { not: "CANCELLED" } },
    _count: { _all: true },
    _sum: { total: true },
    _max: { createdAt: true },
  });

  const { _count, ...rest } = user;
  return {
    ...rest,
    wishlistCount: _count.wishlist,
    stats: {
      orderCount: agg._count._all,
      totalSpent: agg._sum.total ?? 0,
      lastOrderAt: agg._max.createdAt ?? null,
    },
  };
}
