import { requireAdmin } from "@/app/_lib/admin-auth";
import { prisma } from "@/app/_lib/prisma";
import { discountInclude } from "@/app/_lib/discount-service";
import { DiscountManager, type DiscountRow } from "@/app/_components/admin/discounts/discount-manager";
export const dynamic = "force-dynamic";

export default async function DiscountsPage() {
  await requireAdmin();
  // This dynamic server page snapshots time once per authenticated request.
  // eslint-disable-next-line react-hooks/purity
  const asOf = Date.now();
  // Sequential reads keep the admin dashboard's DB footprint small.
  const discounts = await prisma.discount.findMany({ include: discountInclude, orderBy: { createdAt: "desc" } });
  const stats = await prisma.discountRedemption.groupBy({ by: ["discountId"], _sum: { amount: true }, _count: { _all: true } });
  const paid = await prisma.discountRedemption.groupBy({ by: ["discountId"], where: { order: { paymentStatus: { in: ["PAID", "COD_COLLECTED"] } } }, _count: { _all: true } });
  const products = await prisma.product.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const categories = await prisma.design.findMany({ select: { slug: true, name: true, department: { select: { name: true } } }, orderBy: { name: "asc" } });
  const statsById = new Map(stats.map(s => [s.discountId, s]));
  const paidById = new Map(paid.map(s => [s.discountId, s._count._all]));
  const rows: DiscountRow[] = discounts.map(d => ({
    id: d.id, version: d.version, name: d.name, code: d.code ?? "", type: d.type as DiscountRow["type"], scope: d.scope as DiscountRow["scope"], value: d.value / 100,
    active: d.active, publicOffer: d.publicOffer, paymentMethods: d.paymentMethods?.length ? d.paymentMethods as DiscountRow["paymentMethods"] : ["ALL"], startsAt: d.startsAt?.toISOString() ?? null, expiresAt: d.expiresAt?.toISOString() ?? null, usageLimit: d.usageLimit,
    minimumOrder: d.minimumOrder / 100, maximumDiscount: d.maximumDiscount === null ? null : d.maximumDiscount / 100,
    productIds: d.products.map(p => p.productId), categorySlugs: d.categories.map(c => c.designSlug), usedCount: d.usedCount,
    savings: (statsById.get(d.id)?._sum.amount ?? 0) / 100, paidOrders: paidById.get(d.id) ?? 0,
  }));
  return <DiscountManager asOf={asOf} rows={rows} products={products} categories={categories.map(c => ({ id: c.slug, name: `${c.department.name} / ${c.name}` }))} totals={{
    uses: stats.reduce((n, s) => n + s._count._all, 0), savings: stats.reduce((n, s) => n + (s._sum.amount ?? 0), 0) / 100,
    paid: paid.reduce((n, s) => n + s._count._all, 0), active: discounts.filter(d => d.active && (!d.startsAt || d.startsAt.getTime() <= asOf) && (!d.expiresAt || d.expiresAt.getTime() > asOf) && (d.usageLimit === null || d.usedCount < d.usageLimit)).length,
  }} />;
}
