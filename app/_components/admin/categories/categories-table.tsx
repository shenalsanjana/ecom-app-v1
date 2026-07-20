import Link from "next/link";
import Image from "next/image";
import { isUploadedImage } from "@/app/_lib/uploaded-image";
import { DeleteCategoryButton } from "./delete-category-button";
import { CopyAdLinkButton } from "./copy-ad-link-button";

type Row = { slug: string; name: string; image: string; productCount: number; adUrl: string };

export function CategoriesTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No categories yet.</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
          <th className="p-2"></th><th className="p-2">Name</th><th className="p-2">Slug</th>
          <th className="p-2">Products</th><th className="p-2">Ad link</th><th className="p-2 text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.slug} className="border-b hover:bg-secondary/40">
            <td className="p-2"><Image src={c.image} alt="" width={36} height={36} unoptimized={isUploadedImage(c.image)} className="rounded object-cover" /></td>
            <td className="p-2 font-medium">
              <Link href={`/admin/categories/${c.slug}/edit`} className="hover:underline">{c.name}</Link>
            </td>
            <td className="p-2 text-muted-foreground">{c.slug}</td>
            <td className="p-2">{c.productCount}</td>
            <td className="p-2"><CopyAdLinkButton url={c.adUrl} /></td>
            <td className="p-2 text-right">
              {c.productCount > 0
                ? <span className="text-xs text-muted-foreground">In use</span>
                : <DeleteCategoryButton slug={c.slug} name={c.name} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
