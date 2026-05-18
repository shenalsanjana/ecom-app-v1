// app/account/orders/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/app/_lib/format";
import { paymentStatusLabel } from "@/app/_lib/order-status";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-LK", { year: "numeric", month: "short", day: "numeric" });
}

function paymentBadgeVariant(
  status: string | null | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "PAID":
    case "COD_COLLECTED":
      return "default";
    case "COD_PENDING":
      return "secondary";
    case "PENDING":
      return "destructive";
    default:
      return "outline";
  }
}

export default async function OrdersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/account/orders");

  const orders = await prisma.order.findMany({
    where: { userId: session.user.id },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">My orders</h1>

      {orders.length === 0 ? (
        <div className="rounded-lg border p-10 text-center text-muted-foreground">
          You haven&apos;t placed any orders yet.
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((o) => (
            <li key={o.id}>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">
                      {o.rbNumber ?? `Order #${o.id.slice(-8)}`}
                    </CardTitle>
                    <div className="text-sm text-muted-foreground">
                      Placed {formatDate(o.createdAt)} · {o.paymentMethodDisplay}
                    </div>
                    {o.trackingCode && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Tracking: {o.trackingCode}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={o.status === "DELIVERED" ? "default" : "secondary"}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </Badge>
                    {o.paymentStatus ? (
                      <Badge variant={paymentBadgeVariant(o.paymentStatus)}>
                        {paymentStatusLabel(o.paymentStatus)}
                      </Badge>
                    ) : null}
                    <div className="text-sm font-medium">{formatPrice(o.total)}</div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1 text-sm">
                    {o.items.map((it) => (
                      <li key={it.id} className="flex items-center justify-between">
                        <span className="truncate pr-4">
                          {it.name}
                          {it.size ? (
                            <span className="text-muted-foreground"> · Size {it.size}</span>
                          ) : null}
                          {it.quantity > 1 ? (
                            <span className="text-muted-foreground"> × {it.quantity}</span>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground">
                          {formatPrice(it.price * it.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
