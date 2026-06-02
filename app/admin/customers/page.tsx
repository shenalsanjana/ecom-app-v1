import { listCustomers, buildCustomerWhere, CUSTOMER_TABS, PAGE_SIZE, type CustomerTab, type CustomerRow } from "@/app/_lib/admin-customers";
import { prisma } from "@/app/_lib/prisma";
import { CustomersToolbar } from "@/app/_components/admin/customers/customers-toolbar";
import { CustomersTable } from "@/app/_components/admin/customers/customers-table";

export default async function AdminCustomersPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const role = (sp.role as CustomerTab) || "customers";
  const page = Number(sp.page ?? "1") || 1;

  const { rows, total } = await listCustomers({ role, q: sp.q, page });

  // sort the current page by aggregate when requested (cross-page sort is approximate)
  const sorted: CustomerRow[] = [...rows];
  if (sp.sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sp.sort === "orders") sorted.sort((a, b) => b.orderCount - a.orderCount);
  else if (sp.sort === "spent") sorted.sort((a, b) => b.totalSpent - a.totalSpent);

  const counts = Object.fromEntries(
    await Promise.all(CUSTOMER_TABS.map(async (t) => [t, await prisma.user.count({ where: buildCustomerWhere({ role: t }) })])),
  ) as Record<CustomerTab, number>;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefFor = (p: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v !== undefined) next.set(k, v);
    next.set("page", String(p));
    return `/admin/customers?${next.toString()}`;
  };

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Customers</h1>
      <CustomersToolbar counts={counts} />
      <CustomersTable rows={sorted} />
      <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
        {page > 1 ? <a className="hover:underline" href={hrefFor(page - 1)}>‹ Prev</a> : <span className="opacity-40">‹ Prev</span>}
        <span>Page {page} of {pages} · {total} customers</span>
        {page < pages ? <a className="hover:underline" href={hrefFor(page + 1)}>Next ›</a> : <span className="opacity-40">Next ›</span>}
      </div>
    </section>
  );
}
