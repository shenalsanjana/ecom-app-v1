// /admin dashboard. Server Component — awaits getDashboardKpis() and renders
// the order pipeline (orders to confirm → orders to dispatch) as the two hero
// tiles, plus today's orders + low-stock as secondary tiles. No client interactivity.
import { getDashboardKpis } from "@/app/_lib/admin-kpis";
import { KpiTile } from "@/app/_components/admin/kpi-tile";

export default async function AdminDashboardPage() {
  const kpis = await getDashboardKpis();

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiTile variant="hero" label="Orders to confirm" value={kpis.ordersToConfirm} href="/admin/orders?tab=pending" />
        <KpiTile variant="hero" label="Orders to dispatch" value={kpis.ordersToDispatch} href="/admin/orders?tab=needs-dispatch" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiTile label="Today's orders" value={kpis.todaysOrders} />
        <KpiTile label="Low-stock materials" value={kpis.lowStock} />
      </div>
    </section>
  );
}
