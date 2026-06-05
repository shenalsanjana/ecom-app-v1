import Link from "next/link";
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

  const { rows, total } = await listOrders({
    tab,
    q: sp.q,
    payment: sp.payment,
    sort: sp.sort as "newest" | "oldest" | undefined,
    page,
  });

  const counts = Object.fromEntries(
    await Promise.all(ORDER_TABS.map(async (t) => [t, await prisma.order.count({ where: buildOrderWhere({ tab: t }) })])),
  ) as Record<OrderTab, number>;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v !== undefined && k !== "page") params.set(k, v);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/orders${qs ? `?${qs}` : ""}`;
  }

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Orders</h1>
      <OrdersToolbar counts={counts} />
      <OrdersTable rows={rows} />
      <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
        {page > 1
          ? <Link href={pageHref(page - 1)} className="rounded-md border px-3 py-1 hover:bg-secondary">← Prev</Link>
          : <span className="rounded-md border px-3 py-1 opacity-40">← Prev</span>}
        <span>Page {page} of {pages} · {total} orders</span>
        {page < pages
          ? <Link href={pageHref(page + 1)} className="rounded-md border px-3 py-1 hover:bg-secondary">Next →</Link>
          : <span className="rounded-md border px-3 py-1 opacity-40">Next →</span>}
      </div>
    </section>
  );
}
