import Link from "next/link";
import { formatPrice } from "@/app/_lib/format";
import { Badge } from "@/components/ui/badge";
import type { CustomerRow } from "@/app/_lib/admin-customers";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export function CustomersTable({ rows }: { rows: CustomerRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No customers match this view.</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
          <th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Role</th>
          <th className="p-2">Orders</th><th className="p-2">Total spent</th><th className="p-2">Joined</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className="border-b hover:bg-secondary/40">
            <td className="p-2 font-medium">
              <Link href={`/admin/customers/${c.id}`} className="flex items-center gap-2 hover:underline">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{initials(c.name)}</span>
                {c.name}
              </Link>
            </td>
            <td className="p-2 text-muted-foreground">{c.email}</td>
            <td className="p-2"><Badge variant={c.role === "ADMIN" ? "outline" : "secondary"}>{c.role === "ADMIN" ? "Admin" : "Customer"}</Badge></td>
            <td className="p-2">{c.orderCount}</td>
            <td className="p-2 font-medium">{c.totalSpent > 0 ? formatPrice(c.totalSpent) : "—"}</td>
            <td className="p-2">{c.createdAt.toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
