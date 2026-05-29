import type { PaymentOrder } from "./types";

export function requireNameAndEmail(order: PaymentOrder): { name: string; email: string } {
  const name = order.guestName ?? order.user?.name;
  const email = order.guestEmail ?? order.user?.email;
  if (!name || !email) throw new Error("Order is missing customer name or email");
  return { name, email };
}

export function checkoutSuccessUrl(req: Request, orderId: string, status?: string): URL {
  const url = new URL("/checkout/success", req.url);
  url.searchParams.set("order_id", orderId);
  if (status) url.searchParams.set("status", status);
  return url;
}
