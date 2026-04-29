// app/account/orders/page.tsx
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockOrders } from "@/app/_data/orders-mock";

const STATUS_LABEL: Record<string, string> = {
  delivered: "Delivered",
  shipped: "Shipped",
  processing: "Processing",
};

export default function OrdersPage() {
  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">My orders</h1>
      <ul className="space-y-4">
        {mockOrders.map((o) => (
          <li key={o.id}>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">Order {o.id}</CardTitle>
                  <div className="text-sm text-muted-foreground">Placed {o.placedAt}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant={o.status === "delivered" ? "default" : "secondary"}>
                    {STATUS_LABEL[o.status]}
                  </Badge>
                  <div className="text-sm font-medium">${o.total.toFixed(2)}</div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {o.items.map((it) => (
                    <li key={it.productId} className="flex items-center justify-between">
                      <span className="truncate pr-4">
                        {it.name} {it.qty > 1 ? <span className="text-muted-foreground">× {it.qty}</span> : null}
                      </span>
                      <span className="text-muted-foreground">${(it.price * it.qty).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
