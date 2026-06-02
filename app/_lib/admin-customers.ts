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
