// /admin dashboard. Server Component — awaits getDashboardKpis()
// and renders 1 hero tile + 3 secondary tiles. No client interactivity.
import { getDashboardKpis } from "@/app/_lib/admin-kpis";
import { KpiTile } from "@/app/_components/admin/kpi-tile";

export default async function AdminDashboardPage() {
  const kpis = await getDashboardKpis();

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Dashboard</h1>
      <KpiTile variant="hero" label="Pending dispatch" value={kpis.pendingDispatch} />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile label="Today's orders" value={kpis.todaysOrders} />
        <KpiTile label="Pending COD" value={kpis.pendingCod} />
        <KpiTile label="Low-stock products" value={kpis.lowStock} />
      </div>
    </section>
  );
}
