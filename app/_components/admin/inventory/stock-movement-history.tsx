import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";

export async function StockMovementHistory({ query, page }: { query: string; page: number }) {
  const where: Prisma.StockMovementWhereInput = query.trim() ? { OR: [
    { stockLabel: { contains: query.trim(), mode: "insensitive" } },
    { reason: { contains: query.trim(), mode: "insensitive" } },
    { orderId: { contains: query.trim(), mode: "insensitive" } },
  ] } : {};
  const limit = 50;
  const rows = await prisma.stockMovement.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit + 1 });
  const more = rows.length > limit;
  const actorIds = [...new Set(rows.slice(0, limit).flatMap(row => row.actorId ? [row.actorId] : []))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(actors.map(actor => [actor.id, actor.name]));
  const href = (next: number) => `/admin/inventory?tab=movements&p=${next}&q=${encodeURIComponent(query)}`;
  return <div className="space-y-4">
    <div><h2 className="font-semibold">Stock movements</h2><p className="mt-1 text-sm text-muted-foreground">Available-balance changes from this release onward. Opening records capture the previous recorded availability; they are not receipts or physical counts.</p></div>
    <form className="flex gap-2"><input type="hidden" name="tab" value="movements" /><input name="q" defaultValue={query} aria-label="Search stock movements" placeholder="Search item, reason or order ID" maxLength={160} className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" /><button className="rounded-md border px-4 py-2 text-sm">Search</button></form>
    <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm">
      <caption className="sr-only">Immutable history of available stock changes, times shown in Sri Lanka time</caption>
      <thead className="border-b bg-secondary/30"><tr>{["Time (Sri Lanka)", "Item", "Available before → after", "Change", "Reason / reference", "Actor"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
      <tbody>{rows.slice(0, limit).map(row => <tr key={row.id} className="border-b last:border-0">
        <td className="whitespace-nowrap p-3">{row.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Colombo", dateStyle: "medium", timeStyle: "short" })}</td>
        <td className="p-3">{row.stockLabel}<span className="block text-xs text-muted-foreground">{row.plainTshirtStockId ? "Shared blank" : "DTF print"}</span></td>
        <td className="whitespace-nowrap p-3">{row.before} → {row.after}</td><td className="p-3 font-medium">{row.delta > 0 ? "+" : ""}{row.delta}</td>
        <td className="p-3">{row.reason}{row.orderId && <Link className="mt-1 block text-xs underline" href={`/admin/orders/${encodeURIComponent(row.orderId)}`}>View order</Link>}</td>
        <td className="p-3">{(row.actorId && names.get(row.actorId)) || (row.actorType === "ADMIN" ? "Admin" : row.actorType === "CUSTOMER" ? "Customer" : "System")}{row.actorId && <span className="block text-xs text-muted-foreground">{row.actorId}</span>}</td>
      </tr>)}{rows.length === 0 && <tr><td colSpan={6} className="p-4 text-muted-foreground">No matching stock movements.</td></tr>}</tbody>
    </table></div>
    <nav aria-label="Stock movement pages" className="flex items-center gap-4 text-sm">{page > 1 && <Link className="underline" href={href(page - 1)}>Previous</Link>}<span>Page {page}</span>{more && <Link className="underline" href={href(page + 1)}>Next</Link>}</nav>
  </div>;
}
