import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/app/_lib/format";
import { Badge } from "@/components/ui/badge";
import { DeleteProductButton } from "./delete-product-button";
import { resolveDefaultVariant, productInStock, type PlainStockMap, type DesignStockMap } from "@/app/_lib/variants";

type Row = {
  id: string; name: string; price: number; originalPrice: number | null;
  archived: boolean; dtfDesignId: string | null;
  category: { name: string } | null;
  variants: {
    sortOrder: number;
    archived: boolean;
    colorSlug: string;
    sizeStocks: { size: string }[];
    images: { url: string }[];
  }[];
  _count: { variants: number };
};

function thumbnail(row: Row): string {
  const variant = resolveDefaultVariant(row.variants);
  return variant?.images[0]?.url ?? "";
}

export function ProductsTable({
  rows, plainStock, designStock,
}: { rows: Row[]; plainStock: PlainStockMap; designStock: DesignStockMap }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No products match this view.</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
          <th className="p-2"></th><th className="p-2">Name</th><th className="p-2">Category</th>
          <th className="p-2">Price</th><th className="p-2">Colors</th><th className="p-2">Available</th><th className="p-2">Status</th><th className="p-2 text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          // productInStock expects { colorSlug, sizes }[] — adapt the row's
          // { colorSlug, sizeStocks } shape rather than renaming the query field.
          const inStock = productInStock(
            p.variants.map((v) => ({ colorSlug: v.colorSlug, sizes: v.sizeStocks })),
            p.dtfDesignId, plainStock, designStock,
          );
          return (
            <tr key={p.id} className={"border-b hover:bg-secondary/40 " + (p.archived ? "opacity-60" : "")}>
              <td className="p-2">{thumbnail(p) && <Image src={thumbnail(p)} alt="" width={36} height={36} className="rounded object-cover" />}</td>
              <td className="p-2 font-medium">
                <Link href={`/admin/products/${p.id}/edit`} className="hover:underline">{p.name}</Link>
                <br /><span className="text-muted-foreground">{p.id}</span>
              </td>
              <td className="p-2">{p.category?.name ?? "—"}</td>
              <td className="p-2 font-medium">{formatPrice(p.price)}{p.originalPrice ? <span className="ml-1 text-xs text-muted-foreground line-through">{formatPrice(p.originalPrice)}</span> : null}</td>
              <td className="p-2">{p._count.variants}</td>
              <td className="p-2"><Badge variant={inStock ? "secondary" : "outline"}>{inStock ? "Available" : "Unavailable"}</Badge></td>
              <td className="p-2"><Badge variant={p.archived ? "outline" : "secondary"}>{p.archived ? "Archived" : "Active"}</Badge></td>
              <td className="p-2 text-right"><DeleteProductButton id={p.id} name={p.name} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
