import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/app/_lib/auth";
import { getCustomer } from "@/app/_lib/admin-customers";
import { formatPrice } from "@/app/_lib/format";
import { Badge } from "@/components/ui/badge";
import { paymentStatusLabel } from "@/app/_lib/order-status";
import { RoleControl } from "@/app/_components/admin/customers/role-control";
import { PasswordResetButton } from "@/app/_components/admin/customers/password-reset-button";

export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [customer, session] = await Promise.all([getCustomer(id), auth()]);
  if (!customer) notFound();
  const isSelf = session?.user?.id === customer.id;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/admin/customers" className="text-sm text-muted-foreground">‹ Customers</Link>
        <h1 className="text-xl font-bold">{customer.name}</h1>
        <Badge variant={customer.role === "ADMIN" ? "outline" : "secondary"}>{customer.role === "ADMIN" ? "Admin" : "Customer"}</Badge>
        <span className="text-muted-foreground">{customer.email}</span>
        <span className="ml-auto flex gap-2">
          <RoleControl userId={customer.id} role={customer.role} isSelf={isSelf} />
          <PasswordResetButton userId={customer.id} />
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <div className="rounded-lg border p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Stats</h4>
            <div className="flex flex-wrap gap-6 text-sm">
              <div><div className="text-xl font-bold">{customer.stats.orderCount}</div>Orders</div>
              <div><div className="text-xl font-bold">{formatPrice(customer.stats.totalSpent)}</div>Total spent</div>
              <div><div className="text-xl font-bold">{customer.stats.lastOrderAt ? customer.stats.lastOrderAt.toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" }) : "—"}</div>Last order</div>
              <div><div className="text-xl font-bold">{customer.wishlistCount}</div>Wishlist</div>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">Orders</h4>
              <Link href={`/admin/orders?q=${encodeURIComponent(customer.email ?? "")}`} className="text-xs text-primary">View all in Orders ↗</Link>
            </div>
            {customer.orders.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p> : (
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {customer.orders.map((o) => (
                    <tr key={o.id} className="border-b">
                      <td className="p-1.5"><Link href={`/admin/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.webNumber ?? o.id}</Link></td>
                      <td className="p-1.5">{o.createdAt.toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" })}</td>
                      <td className="p-1.5">{formatPrice(o.total)}</td>
                      <td className="p-1.5">{o.status}</td>
                      <td className="p-1.5 text-muted-foreground">{paymentStatusLabel(o.paymentStatus) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-lg border p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Addresses</h4>
            {customer.addresses.length === 0 ? <p className="text-sm text-muted-foreground">No saved addresses.</p> :
              customer.addresses.map((a) => (
                <div key={a.id} className="mb-2 rounded border p-2 text-sm">
                  <span className="font-medium">{a.label}</span>{a.isDefault && <span className="ml-2 text-xs text-primary">default</span>}
                  <br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city} · {a.country}
                </div>
              ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Account</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{customer.email}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Role</span><span>{customer.role}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Joined</span><span>{customer.createdAt.toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" })}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">ID</span><span className="text-muted-foreground">{customer.id}</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
