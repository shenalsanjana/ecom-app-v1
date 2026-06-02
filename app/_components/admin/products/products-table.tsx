import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/app/_lib/format";
import { Badge } from "@/components/ui/badge";
import { StockQuickEdit } from "./stock-quick-edit";

type Row = {
  id: string; name: string; price: number; originalPrice: number | null;
  image: string; stock: number; sizes: string; archived: boolean;
  category: { name: string } | null;
};

export function ProductsTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No products match this view.</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
          <th className="p-2"></th><th className="p-2">Name</th><th className="p-2">Category</th>
          <th className="p-2">Price</th><th className="p-2">Stock</th><th className="p-2">Sizes</th><th className="p-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className={"border-b hover:bg-secondary/40 " + (p.archived ? "opacity-60" : "")}>
            <td className="p-2"><Image src={p.image} alt="" width={36} height={36} className="rounded object-cover" /></td>
            <td className="p-2 font-medium">
              <Link href={`/admin/products/${p.id}/edit`} className="hover:underline">{p.name}</Link>
              <br /><span className="text-muted-foreground">{p.id}</span>
            </td>
            <td className="p-2">{p.category?.name ?? "—"}</td>
            <td className="p-2 font-medium">{formatPrice(p.price)}{p.originalPrice ? <span className="ml-1 text-xs text-muted-foreground line-through">{formatPrice(p.originalPrice)}</span> : null}</td>
            <td className="p-2"><StockQuickEdit id={p.id} value={p.stock} /></td>
            <td className="p-2 text-muted-foreground">{p.sizes}</td>
            <td className="p-2"><Badge variant={p.archived ? "outline" : "secondary"}>{p.archived ? "Archived" : "Active"}</Badge></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
