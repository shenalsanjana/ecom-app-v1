import { listOrders, buildOrderWhere, ORDER_TABS, PAGE_SIZE, type OrderTab } from "@/app/_lib/admin-orders";
import { prisma } from "@/app/_lib/prisma";
import { OrdersToolbar } from "@/app/_components/admin/orders/orders-toolbar";
import { OrdersTable } from "@/app/_components/admin/orders/orders-table";

export default async function AdminOrdersPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = (sp.tab as OrderTab) || "all";
  const page = Number(sp.page ?? "1") || 1;

  const { rows, total } = await listOrders({ tab, q: sp.q, status: sp.status, payment: sp.payment, page });

  const counts = Object.fromEntries(
    await Promise.all(ORDER_TABS.map(async (t) => [t, await prisma.order.count({ where: buildOrderWhere({ tab: t }) })])),
  ) as Record<OrderTab, number>;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Orders</h1>
      <OrdersToolbar counts={counts} />
      <OrdersTable rows={rows} />
      <p className="mt-4 text-sm text-muted-foreground">Page {page} of {pages} · {total} orders</p>
    </section>
  );
}
