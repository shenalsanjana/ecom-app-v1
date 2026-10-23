import { getDeliveryConfig } from "@/app/_lib/store-settings";
import Link from "next/link";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { getPosProducts } from "@/app/_lib/pos-service";
import { PosRegister } from "@/app/_components/admin/pos/pos-register";

export default async function PosPage() {
  await requireAdmin();
  const products = await getPosProducts();
  const deliveryConfig = await getDeliveryConfig();
  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shop POS</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose products, add to the sale, and take payment.</p>
        </div>
        <Link href="/admin/orders?channel=POS" className="rounded-md border px-3 py-2 text-sm hover:bg-secondary">Shop sales & receipts</Link>
      </div>
      <PosRegister initialProducts={products} initialDeliveryConfig={deliveryConfig} />
    </section>
  );
}
