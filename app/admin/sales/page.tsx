import { requireAdmin } from "@/app/_lib/admin-auth";
import { readSalesReport, SalesRangeError } from "@/app/_lib/sales/service";
import { SalesDashboard } from "@/app/_components/admin/sales/sales-dashboard";
export default async function SalesDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams, one = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
  const query = { period: one(params.period) ?? "today", start: one(params.start), end: one(params.end), channel: one(params.channel) ?? "ALL" };
  let initial = null, error = "";
  try { initial = await readSalesReport(query); } catch (caught) { error = caught instanceof SalesRangeError ? caught.message : "Sales could not be loaded. Refresh shortly or choose a shorter date range."; }
  return <SalesDashboard initial={initial} initialQuery={query} initialError={error} />;
}
