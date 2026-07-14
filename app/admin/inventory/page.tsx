import { listPlainTshirtStock, listDtfDesigns } from "@/app/_lib/admin-inventory";
import { LOW_STOCK_THRESHOLD } from "@/app/_lib/admin-products";
import { PlainStockGrid } from "@/app/_components/admin/inventory/plain-stock-grid";
import { DtfDesignsTable } from "@/app/_components/admin/inventory/dtf-designs-table";

export default async function AdminInventoryPage() {
  const [plainStock, designs] = await Promise.all([listPlainTshirtStock(), listDtfDesigns()]);
  return (
    <section className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
      <div>
        <h2 className="mb-2 text-sm font-semibold">Plain T-Shirt Stock</h2>
        <PlainStockGrid rows={plainStock} lowStockThreshold={LOW_STOCK_THRESHOLD} />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold">DTF Designs</h2>
        <DtfDesignsTable designs={designs} lowStockThreshold={LOW_STOCK_THRESHOLD} />
      </div>
    </section>
  );
}
